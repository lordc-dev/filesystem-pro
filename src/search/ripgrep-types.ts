/**
 * Ripgrep Type Definitions
 * 
 * Shared interfaces for ripgrep operations.
 */

/**
 * Submatch with exact column positions from ripgrep
 */
export interface ContentSearchSubmatch {
  /** Matched text */
  text: string;
  /** Start column (0-indexed) in the original line */
  start: number;
  /** End column (0-indexed) in the original line */
  end: number;
}

/**
 * Content search result from ripgrep
 */
export interface ContentSearchResult {
  file: string;
  line: number;
  /** Original line content (may have leading whitespace) */
  content: string;
  /** Exact match positions from ripgrep - use these for accurate column lookup */
  submatches: ContentSearchSubmatch[];
}

/**
 * Batch result for multiple pattern searches
 */
export interface BatchSearchResult {
  results: Map<string, ContentSearchResult[]>;
  errors: Map<string, Error>;
  totalMatches: number;
  successCount: number;
  errorCount: number;
}

/**
 * Options for glob search operations
 */
export interface GlobOptions {
  cwd?: string;
  ignore?: readonly string[];
  onlyFiles?: boolean;
  onlyDirectories?: boolean;
  followSymlinks?: boolean;
  deep?: number;
  absolute?: boolean;
  /** Skip pattern validation (default: false) */
  skipValidation?: boolean;
}

/**
 * Options for file search operations
 */
export interface FileSearchOptions {
  excludePatterns?: readonly string[];
  ignoreCase?: boolean;
  includeHidden?: boolean;
}

/**
 * Options for content search operations
 */
export interface ContentSearchOptions {
  fileType?: string;
  context?: number;
  ignoreCase?: boolean;
  excludePatterns?: string[];
  maxResults?: number;
  pcre2?: boolean;
}

/**
 * Options for batch content search operations
 */
export interface BatchSearchOptions extends ContentSearchOptions {
  concurrency?: number;
}

/**
 * Options for directory listing operations
 */
export interface DirectoryListOptions {
  recursive?: boolean;
  includeHidden?: boolean;
  excludePatterns?: string[];
}
