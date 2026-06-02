/**
 * Shared Constants (SSOT)
 * 
 * This file contains constants that are used across multiple modules.
 * Centralizing these values prevents duplication and ensures consistency.
 */

import { getConfig } from "./config/index.js";

// =============================================================================
// FILE ENCODING
// =============================================================================

/**
 * Default file encoding for all text file operations
 */
export const FILE_ENCODING = "utf-8" as const;

// =============================================================================
// EXCLUDE PATTERNS
// =============================================================================

/**
 * Default directories to exclude from searches and analysis.
 * These are common build artifacts, dependencies, and VCS directories.
 */
export const DEFAULT_EXCLUDE_DIRS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  ".next",
  ".nuxt",
  "__pycache__",
  ".pytest_cache",
  "venv",
  ".venv",
] as const;

/**
 * Default glob patterns to exclude from file searches.
 * Uses double-star patterns for recursive matching.
 */
export const DEFAULT_EXCLUDE_PATTERNS = DEFAULT_EXCLUDE_DIRS.map(
  (dir) => `**/${dir}/**`
);

/**
 * Default exclude patterns specifically for reference finding operations
 */
export const DEFAULT_REFERENCE_EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.git/**",
] as const;

// =============================================================================
// SUPPORTED LANGUAGES & FILE EXTENSIONS
// =============================================================================

/**
 * Languages supported by the semantic module
 */
export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "tsx"
  | "jsx"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "c"
  | "cpp"
  | "kotlin"
  | "bash"
  | "c_sharp"
  | "ruby"
  | "php"
  | "html"
  | "css"
  | "scala"
  | "swift";

/**
 * File extension to language mapping (SSOT).
 * All language-aware code must use this map — do not create local copies.
 */
export const EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyw": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".cs": "c_sharp",
  ".rb": "ruby",
  ".php": "php",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "css",
  ".scala": "scala",
  ".sbt": "scala",
  ".swift": "swift",
};

/**
 * Get language from file path
 */
export function getLanguageFromPath(filePath: string): SupportedLanguage | undefined {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext];
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): language is SupportedLanguage {
  return Object.values(EXTENSION_LANGUAGE_MAP).includes(language as SupportedLanguage);
}

/**
 * Generate glob patterns for all supported file types.
 * Derived from EXTENSION_LANGUAGE_MAP to maintain SSOT.
 */
export const SUPPORTED_FILE_PATTERNS = Object.keys(EXTENSION_LANGUAGE_MAP).map(
  (ext) => `**/*${ext}`
);

/**
 * Check if a file extension is supported for semantic analysis
 */
export function isSupportedExtension(ext: string): boolean {
  return ext in EXTENSION_LANGUAGE_MAP;
}

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

/**
 * Centralized cache TTL values (SSOT)
 * 
 * All cache implementations should use these values to ensure consistency.
 * Values can be overridden via environment variables where noted.
 */
export function getCacheTTL() {
  const config = getConfig();
  return {
    SYMBOL_CACHE_MS: config.cache.symbolCacheTtlMs,
    AST_CACHE_MS: config.cache.astCacheTtlMs,
    PROMPT_CACHE_MS: 4 * 60 * 60 * 1000,
    PATH_CACHE_MS: 30 * 60 * 1000,
    TEMPLATES_LIST_MS: 5 * 60 * 1000,
  } as const;
}

export function getCacheSize() {
  const config = getConfig();
  return {
    SYMBOL_CACHE: config.cache.symbolCacheSize,
    AST_CACHE: config.cache.astCacheSize,
    PROMPT_CACHE: 100,
  } as const;
}

/**
 * Content size thresholds (SSOT)
 * 
 * Used for optimizations like content hashing and sampling.
 */
export const CONTENT_THRESHOLDS = {
  /**
   * Threshold for "small file" optimizations in bytes.
   * Files smaller than this are processed fully; larger files use sampling.
   */
  SMALL_FILE_BYTES: 10000,
  
  /**
   * Sample size in bytes for content hashing of large files.
   * Used to take samples from start and end of file for hash generation.
   */
  SAMPLE_SIZE_BYTES: 2000,
} as const;

/**
 * Check if caching is disabled globally
 */
export function isCacheDisabled(): boolean {
  return getConfig().cache.disabled;
}

export function isDebugMode(): boolean {
  return getConfig().debug;
}

/**
 * Generic cache statistics interface.
 * Used by all cache implementations for consistent reporting.
 */
export interface CacheStats {
  /** Number of items currently in cache */
  size: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Maximum cache size (if applicable) */
  maxSize?: number;
  /** Time-to-live in milliseconds (if applicable) */
  ttlMs?: number;
}

/**
 * Create a cache stats object with computed hit rate
 */
export function createCacheStats(
  size: number,
  hits: number,
  misses: number,
  maxSize?: number
): CacheStats {
  const total = hits + misses;
  return {
    size,
    hits,
    misses,
    hitRate: total > 0 ? hits / total : 0,
    maxSize,
  };
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

/**
 * Default context lines for diff operations
 */
export const DEFAULT_DIFF_CONTEXT_LINES = 3;

/**
 * Default maximum search results
 */
export const DEFAULT_MAX_SEARCH_RESULTS = 100;

// =============================================================================
// DIRECTORY TREE LIMITS
// =============================================================================

/**
 * Default maximum depth for directory_tree traversal.
 * Prevents freezing on deep directory structures.
 * Override with maxDepth parameter.
 */
export const DEFAULT_TREE_MAX_DEPTH = 5;

/**
 * Maximum number of entries to process in directory_tree.
 * Prevents memory exhaustion on wide directories.
 * When limit is reached, remaining entries are truncated with a warning.
 */
export const DEFAULT_TREE_MAX_ENTRIES = 5000;

// =============================================================================
// ERROR MESSAGES (SSOT)
// =============================================================================

/**
 * Centralized error message factories.
 * Use these instead of hardcoding error strings.
 */
export const ERROR_MESSAGES = {
  // -------------------------------------------------------------------------
  // Semantic Analysis Errors
  // -------------------------------------------------------------------------
  /** Error for unsupported file types in semantic analysis */
  unsupportedFileType: (path: string) => `Unsupported file type: ${path}`,
  /** Error when a symbol cannot be found */
  symbolNotFound: (name: string) => `Symbol not found: ${name}`,
  /** Error when a template is not found */
  templateNotFound: (path: string) => `Template not found: '${path}'`,
  /** Error when tree-sitter fails to parse */
  parseError: () => "Failed to parse source code",
  /** Error when tree-sitter is not initialized */
  notInitialized: () =>
    "TreeSitterManager not initialized. Call initialize() first.",
  /** Error when language configuration is not found */
  noLanguageConfig: (language: string) =>
    `No configuration for language: ${language}`,
  /** Error when tree-sitter initialization fails */
  treeSitterInitFailed: (error: unknown) =>
    `Failed to initialize tree-sitter: ${error}`,
  /** Error when loading a language fails */
  languageLoadFailed: (language: string, error: unknown) =>
    `Failed to load language ${language}: ${error}`,

  // -------------------------------------------------------------------------
  // File System Errors
  // -------------------------------------------------------------------------
  /** Error when parent directory does not exist */
  parentDirNotExist: (parentDir: string) =>
    `Parent directory does not exist: ${parentDir}`,
  /** Error when trying to delete directory with delete_file */
  cannotDeleteDirWithDeleteFile: (path: string) =>
    `Cannot delete directory with delete_file. Use delete_directory instead: ${path}`,
  /** Error when trying to delete file with delete_directory */
  cannotDeleteFileWithDeleteDir: (path: string) =>
    `Cannot delete file with delete_directory. Use delete_file instead: ${path}`,
  /** Error when watcher is not found */
  watcherNotFound: (watcherId: string) =>
    `No watcher found with ID: ${watcherId}`,
  /** Error when watcher already exists */
  watcherAlreadyExists: (id: string) => `Watcher with id ${id} already exists`,

  // -------------------------------------------------------------------------
  // Edit/Diff Errors
  // -------------------------------------------------------------------------
  /** Error when edit match is not found */
  editMatchNotFound: (oldText: string) =>
    `Could not find exact match for edit:\n${oldText}`,
  /** Error for unknown diff format */
  unknownDiffFormat: (format: string) => `Unknown diff format: ${format}`,
  /** Error for invalid regex pattern */
  invalidRegexPattern: (pattern: string) => `Invalid regex pattern: ${pattern}`,
} as const;
