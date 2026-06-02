/**
 * Search Module
 * 
 * All search operations use ripgrep exclusively.
 * Ripgrep is REQUIRED - operations will fail with RipgrepNotFoundError if not available.
 * 
 * Module Structure:
 * - ripgrep-types.ts    - Type definitions
 * - ripgrep-args.ts     - Argument builder (RipgrepArgsBuilder, rgArgs)
 * - ripgrep-executor.ts - Core execution (ensureRipgrep, executeRipgrep)
 * - ripgrep-search.ts   - Search operations (searchFiles, searchContent, etc.)
 * - ripgrep-glob.ts     - Glob and directory operations (globSearch, listDirectoryWithRipgrep)
 *   (ripgrep-utils.ts removed — use this module directly)
 */

// Types
export type {
  ContentSearchSubmatch,
  ContentSearchResult,
  BatchSearchResult,
  GlobOptions,
  FileSearchOptions,
  ContentSearchOptions,
  BatchSearchOptions,
  DirectoryListOptions,
} from "./ripgrep-types.js";

// Argument builder
export {
  RipgrepArgsBuilder,
  rgArgs,
  parseRipgrepLines,
} from "./ripgrep-args.js";

// Executor
export {
  RipgrepNotFoundError,
  isRipgrepAvailable,
  ensureRipgrep,
  requiresPCRE2,
  executeRipgrep,
} from "./ripgrep-executor.js";

// Search operations
export {
  searchFiles,
  searchContent,
  batchSearchContent,
  countMatches,
} from "./ripgrep-search.js";

// Glob and directory operations
export {
  globSearch,
  listDirectoryWithRipgrep,
} from "./ripgrep-glob.js";
