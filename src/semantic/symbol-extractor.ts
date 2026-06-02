/**
 * Symbol Extractor
 *
 * Public API for extracting symbols from source code using tree-sitter.
 * Helper functions are in symbol-extractor-helpers.ts.
 */

import type { Symbol, SymbolExtractionResult, SupportedLanguage} from "./types.js";
import { getLanguageFromPath } from "./types.js";
import { treeSitterManager } from "./tree-sitter-manager.js";
import { ERROR_MESSAGES } from "../constants.js";
import { getLanguageConfig } from "./language-config.js";
import { symbolCache, createSymbolCacheKey, getCachedFlatten, CACHE_CONFIG } from "./symbol-cache.js";
import type { ExtractionOptions } from "./symbol-extractor-helpers.js";
import { extractSymbolsFromNode, countSymbols } from "./symbol-extractor-helpers.js";

// Re-export ExtractionOptions for consumers
export type { ExtractionOptions } from "./symbol-extractor-helpers.js";

/**
 * Extract all symbols from source code (with caching)
 *
 * Uses LRU cache to avoid re-parsing unchanged content.
 * Cache key is based on content hash + language + options.
 */
export async function extractSymbols(
  sourceCode: string,
  language: SupportedLanguage,
  options: ExtractionOptions = {}
): Promise<Symbol[]> {
  // Check cache first (unless disabled)
  const cacheKey = createSymbolCacheKey(sourceCode, language, options);
  if (!CACHE_CONFIG.disabled) {
    const cached = symbolCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Parse and extract
  const tree = await treeSitterManager.parse(sourceCode, language);
  const langConfig = getLanguageConfig(language);

  const symbols = extractSymbolsFromNode(tree.rootNode, sourceCode, language, langConfig, options);

  // Cache the result (unless disabled)
  if (!CACHE_CONFIG.disabled) {
    symbolCache.set(cacheKey, symbols);
  }

  return symbols;
}

/**
 * Extract symbols from a file
 */
export async function extractSymbolsFromFile(
  filePath: string,
  content: string,
  options: ExtractionOptions = {}
): Promise<SymbolExtractionResult> {
  const language = getLanguageFromPath(filePath);

  if (!language) {
    return {
      filePath,
      language: "typescript", // fallback
      symbols: [],
      totalSymbolCount: 0,
      errors: [ERROR_MESSAGES.unsupportedFileType(filePath)],
    };
  }

  try {
    const symbols = await extractSymbols(content, language, options);

    return {
      filePath,
      language,
      symbols,
      totalSymbolCount: countSymbols(symbols),
    };
  } catch (error: unknown) {
    return {
      filePath,
      language,
      symbols: [],
      totalSymbolCount: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Get a flat list of all symbols (including nested)
 *
 * Uses WeakMap caching - result is cached until symbols array is GC'd.
 */
export function flattenSymbols(symbols: Symbol[]): Symbol[] {
  return getCachedFlatten(symbols);
}

/**
 * Get symbol body text from source code
 */
export function getSymbolBody(symbol: Symbol, sourceCode: string): string {
  const loc = symbol.bodyLocation ?? symbol.location;
  return sourceCode.substring(loc.startOffset, loc.endOffset);
}

/**
 * Get full symbol text (including signature)
 */
export function getSymbolText(symbol: Symbol, sourceCode: string): string {
  return sourceCode.substring(symbol.location.startOffset, symbol.location.endOffset);
}
