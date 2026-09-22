/**
 * Tree-sitter Manager
 * 
 * Singleton pattern for managing Parser instance and lazy-loading
 * language grammars from WASM files.
 */

import type { Tree } from "web-tree-sitter";
import { Parser, Language, Edit } from "web-tree-sitter";
import type { SupportedLanguage } from "./types.js";
import { getLanguageFromPath } from "./types.js";
import type { CacheStats} from "../constants.js";
import { getCacheTTL, getCacheSize, isCacheDisabled } from "../constants.js";
import { TreeSitterError } from "../errors/index.js";
import { hashContent } from "./symbol-cache.js";
import { GrammarResolver, SUPPORTED_LANGUAGES } from "./grammar-resolver.js";
import { observeHistogram } from "../utils/metrics.js";
import { treeSitterBreaker } from "../utils/circuit-breaker.js";




/**
 * AST Cache entry with metadata
 */
interface ASTCacheEntry {
  tree: Tree;
  language: SupportedLanguage;
  timestamp: number;
}

/**
 * TreeSitterManager - Singleton for managing tree-sitter parser and languages
 * 
 * Features:
 * - Lazy loading of language grammars
 * - LRU cache for parsed ASTs (configurable size)
 * - Automatic cache invalidation based on content hash
 */
class TreeSitterManager {
  private static instance: TreeSitterManager;
  private parser: Parser | null = null;
  private languages: Map<SupportedLanguage, Language> = new Map();
  private initPromise: Promise<void> | null = null;
  private grammarResolver: GrammarResolver;

  // AST Cache configuration (from centralized constants.ts SSOT)
  private static readonly AST_CACHE_SIZE = getCacheSize().AST_CACHE;
  private static readonly AST_CACHE_TTL_MS = getCacheTTL().AST_CACHE_MS;
  private static readonly IS_CACHE_DISABLED = isCacheDisabled();
  private astCache: Map<string, ASTCacheEntry> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;
  // Last language set on the parser — skips redundant setLanguage calls
  private currentLanguage: SupportedLanguage | null = null;

  private constructor(wasmDir?: string) {
    this.grammarResolver = new GrammarResolver(wasmDir);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): TreeSitterManager {
    if (!TreeSitterManager.instance) {
      TreeSitterManager.instance = new TreeSitterManager();
    }
    return TreeSitterManager.instance;
  }

  /**
   * Initialize tree-sitter (must be called before parsing)
   */
  public async initialize(): Promise<void> {
    if (this.parser) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private static readonly PRELOAD_LANGUAGES: readonly SupportedLanguage[] = [
    "typescript", "javascript", "tsx", "jsx", "python", "lua",
  ];

  private async doInitialize(): Promise<void> {
    try {
      await Parser.init();
      this.parser = new Parser();

      await Promise.all(
        TreeSitterManager.PRELOAD_LANGUAGES.map(lang =>
          this.loadLanguage(lang).catch(() => {})
        )
      );

      markSemanticAvailable(true);
    } catch (error: unknown) {
      this.parser = null;
      this.initPromise = null;
      throw new TreeSitterError("initialization", { cause: error });
    }
  }

  /**
   * Get parser instance
   */
  public getParser(): Parser {
    if (!this.parser) {
      throw new TreeSitterError("not initialized");
    }
    return this.parser;
  }

  /**
   * Load a language grammar (lazy loading with caching)
   */
  public async loadLanguage(language: SupportedLanguage): Promise<Language> {
    if (!this.parser) {
      throw new TreeSitterError("not initialized for language load", { context: { language } });
    }

    // Return cached language if available
    const cached = this.languages.get(language);
    if (cached) return cached;

    const wasmPath = await this.grammarResolver.ensureGrammarExists(language);

    try {
      const lang = await Language.load(wasmPath);
      this.languages.set(language, lang);
      return lang;
    } catch (error: unknown) {
      throw new TreeSitterError("language load failed", { cause: error, context: { language } });
    }
  }

  /**
   * Set parser language only if it changed (setLanguage is a pointer swap,
   * but skipping it avoids redundant WASM FFI calls in hot parse loops)
   */
  private setParserLanguage(parser: Parser, lang: Language, language: SupportedLanguage): void {
    if (this.currentLanguage === language) return;
    parser.setLanguage(lang);
    this.currentLanguage = language;
  }

  /**
   * Create a cache key from source code (fast hash)
   */
  private createCacheKey(sourceCode: string, language: SupportedLanguage): string {
    return `${language}:${hashContent(sourceCode)}`;
  }

  /**
   * Evict oldest entries if cache is full
   */
  private evictOldestCacheEntries(): void {
    if (this.astCache.size < TreeSitterManager.AST_CACHE_SIZE) {
      return;
    }

    const oldestKey = this.astCache.keys().next().value;
    if (oldestKey !== undefined) {
      const entry = this.astCache.get(oldestKey);
      if (entry) {
        entry.tree.delete();
      }
      this.astCache.delete(oldestKey);
    }
  }

  /**
   * Parse source code and return the AST (with caching)
   * 
   * Uses LRU cache to avoid re-parsing unchanged content.
   * Cache is automatically evicted based on size and TTL.
   */
  public async parse(
    sourceCode: string,
    language: SupportedLanguage
  ): Promise<Tree> {
    return treeSitterBreaker.execute(async () => this._parse(sourceCode, language));
  }

  /**
   * Incremental re-parse after an edit: O(delta) instead of O(file).
   *
   * Given the OLD content (already parsed and cached) and the NEW content,
   * computes the common prefix/suffix, applies tree.edit() with the change
   * range, and re-parses incrementally. The result is stored in the AST
   * cache under the NEW content hash — subsequent parse() calls hit cache.
   *
   * Fallback: on any error (no cached tree, parse failure, corruption)
   * silently falls back to a full parse. Callers never see a difference.
   *
   * @returns true if the incremental tree was cached, false on full-parse fallback
   */
  public async parseIncremental(
    oldContent: string,
    newContent: string,
    language: SupportedLanguage
  ): Promise<boolean> {
    if (TreeSitterManager.IS_CACHE_DISABLED) return false;
    if (oldContent === newContent) return true;

    try {
      const oldKey = this.createCacheKey(oldContent, language);
      const oldEntry = this.astCache.get(oldKey);
      if (!oldEntry || !this.parser) return false;

      // Compute common prefix/suffix (byte-safe: both strings are UTF-8 via
      // JS strings; offsets here are in UTF-16 code units, matching what
      // tree-sitter WASM uses for JS strings)
      let prefix = 0;
      const maxPrefix = Math.min(oldContent.length, newContent.length);
      while (prefix < maxPrefix && oldContent[prefix] === newContent[prefix]) prefix++;

      let suffix = 0;
      const maxSuffix = Math.min(oldContent.length, newContent.length) - prefix;
      while (
        suffix < maxSuffix &&
        oldContent[oldContent.length - 1 - suffix] === newContent[newContent.length - 1 - suffix]
      ) {
        suffix++;
      }

      const oldEnd = oldContent.length - suffix;
      const newEnd = newContent.length - suffix;

      // No common region at all — full parse is cheaper
      if (prefix === 0 && suffix === 0) return false;

      // Clone the old tree so the cached entry stays intact if incremental
      // parsing produces a corrupt tree (defensive: web-tree-sitter clones
      // are cheap pointer copies)
      const tree = oldEntry.tree.copy();

      // Point the edit: start byte, old end byte, new end byte, plus
      // row/column positions computed from the prefix
      const prefixLines = oldContent.substring(0, prefix).split("\n");
      const startRow = prefixLines.length - 1;
      const startColumn = prefix === 0 ? 0 : prefixLines[prefixLines.length - 1].length;

      const oldSuffixLines = oldContent.substring(oldEnd).split("\n");
      const oldEndRow = startRow + oldSuffixLines.length - 1;
      const oldEndColumn = oldSuffixLines[oldSuffixLines.length - 1].length;

      const newSuffixLines = newContent.substring(newEnd).split("\n");
      const newEndRow = startRow + newSuffixLines.length - 1;
      const newEndColumn = newSuffixLines[newSuffixLines.length - 1].length;

      tree.edit(new Edit({
        startIndex: prefix,
        oldEndIndex: oldEnd,
        newEndIndex: newEnd,
        startPosition: { row: startRow, column: startColumn },
        oldEndPosition: { row: oldEndRow, column: oldEndColumn },
        newEndPosition: { row: newEndRow, column: newEndColumn },
      }));

      // Re-parse incrementally — parser reuses unchanged tree regions
      const lang = await this.loadLanguage(language);
      this.setParserLanguage(this.parser, lang, language);
      const newTree = this.parser.parse(newContent, tree);
      if (!newTree) return false;

      // Sanity check: incremental result must match a full parse's root span.
      // Guards against tree.edit() misuse producing corrupt trees.
      const root = newTree.rootNode;
      if (root.startIndex !== 0 || root.endIndex !== newContent.length) {
        newTree.delete();
        return false;
      }

      // Cache under the NEW content hash — next parse() hits
      const newKey = this.createCacheKey(newContent, language);
      this.evictOldestCacheEntries();
      this.astCache.set(newKey, {
        tree: newTree,
        language,
        timestamp: Date.now(),
      });

      observeHistogram("incremental_parse", 1, { result: "hit" });
      return true;
    } catch {
      // Any failure (missing grammar, WASM error, corrupt tree) — full parse fallback
      observeHistogram("incremental_parse", 1, { result: "fallback" });
      return false;
    }
  }

  private async _parse(
    sourceCode: string,
    language: SupportedLanguage
  ): Promise<Tree> {
    const startTime = performance.now();
    if (!this.parser) {
      throw new TreeSitterError("not initialized for parse", { context: { language } });
    }

    // Skip cache if disabled
    if (TreeSitterManager.IS_CACHE_DISABLED) {
      const parser = this.getParser();
      const lang = await this.loadLanguage(language);
      this.setParserLanguage(parser, lang, language);
      const tree = parser.parse(sourceCode);
      if (!tree) throw new TreeSitterError("parse returned null");
      return tree;
    }

    const cacheKey = this.createCacheKey(sourceCode, language);
    
    // Check cache
    const cached = this.astCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < TreeSitterManager.AST_CACHE_TTL_MS) {
        this.cacheHits++;
        observeHistogram("cache_duration_ms", performance.now() - startTime, { cache: "ast", result: "hit" });
        // Move to end (most recently used) by re-inserting
        this.astCache.delete(cacheKey);
        this.astCache.set(cacheKey, { ...cached, timestamp: Date.now() });
        return cached.tree;
      } else {
        // Expired, remove it
        cached.tree.delete();
        this.astCache.delete(cacheKey);
      }
    }

    this.cacheMisses++;

    // Parse fresh
    const parser = this.getParser();
    const lang = await this.loadLanguage(language);
    this.setParserLanguage(parser, lang, language);
    const tree = parser.parse(sourceCode);
    
    if (!tree) {
      throw new TreeSitterError("parse returned null");
    }

    // Cache the result
    this.evictOldestCacheEntries();
    this.astCache.set(cacheKey, {
      tree,
      language,
      timestamp: Date.now(),
    });
    observeHistogram("cache_duration_ms", performance.now() - startTime, { cache: "ast", result: "miss" });
    
    return tree;
  }

  /**
   * Parse a file by path (auto-detects language)
   */
  public async parseFile(
    filePath: string,
    content: string
  ): Promise<{ tree: Tree; language: SupportedLanguage }> {
    return treeSitterBreaker.execute(async () => this._parseFile(filePath, content));
  }

  private async _parseFile(
    filePath: string,
    content: string
  ): Promise<{ tree: Tree; language: SupportedLanguage }> {
    const language = getLanguageFromPath(filePath);
    
    if (!language) {
      throw new TreeSitterError("unsupported file type", { context: { filePath } });
    }

    const tree = await this.parse(content, language);
    return { tree, language };
  }

  /**
   * Check if a language grammar is loaded
   */
  public isLanguageLoaded(language: SupportedLanguage): boolean {
    return this.languages.has(language);
  }

  /**
   * Get list of currently loaded languages
   */
  public getLoadedLanguages(): SupportedLanguage[] {
    return Array.from(this.languages.keys());
  }

  /**
   * Preload multiple language grammars
   */
  public async preloadLanguages(languages: SupportedLanguage[]): Promise<void> {
    await Promise.all(languages.map(lang => this.loadLanguage(lang)));
  }

  /**
   * Get the grammars directory path
   */
  public getGrammarsDir(): string {
    return this.grammarResolver.getWasmPath("typescript").replace(/tree-sitter-typescript\.wasm$/, "");
  }

  /**
   * Check which grammars are available
   */
  public async getAvailableGrammars(): Promise<{
    available: SupportedLanguage[];
    missing: SupportedLanguage[];
  }> {
    const available: SupportedLanguage[] = [];
    const missing: SupportedLanguage[] = [];

    for (const lang of SUPPORTED_LANGUAGES) {
      try {
        await this.grammarResolver.ensureGrammarExists(lang);
        available.push(lang);
      } catch {
        missing.push(lang);
      }
    }

    return { available, missing };
  }

  /**
   * Reset the manager (useful for testing)
   */
  public reset(): void {
    // Clear AST cache and free memory
    for (const entry of this.astCache.values()) {
      entry.tree.delete();
    }
    this.astCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;

    if (this.parser) {
      this.parser.delete();
    }
    this.parser = null;
    this.currentLanguage = null;
    this.languages.clear();
    this.initPromise = null;
  }

  /**
   * Clear only the AST cache (keep parser and languages)
   */
  public clearASTCache(): void {
    for (const entry of this.astCache.values()) {
      entry.tree.delete();
    }
    this.astCache.clear();
  }

  /**
   * Get cache statistics for debugging/monitoring
   */
  public getCacheStats(): CacheStats {
    const total = this.cacheHits + this.cacheMisses;
    return {
      size: this.astCache.size,
      maxSize: TreeSitterManager.AST_CACHE_SIZE,
      ttlMs: TreeSitterManager.AST_CACHE_TTL_MS,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
  }
}

// Export singleton instance
export const treeSitterManager = TreeSitterManager.getInstance();

let semanticAvailable = false;

export function isSemanticAvailable(): boolean {
  return semanticAvailable;
}

export function markSemanticAvailable(available: boolean): void {
  semanticAvailable = available;
}

// Export class for testing
export { TreeSitterManager };