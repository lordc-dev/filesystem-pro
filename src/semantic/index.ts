/**
 * Semantic Code Analysis Module
 * 
 * Provides AST-based code analysis and manipulation using Tree-sitter.
 * 
 * ## Architecture (SSOT)
 * 
 * All symbol finding operations use symbol-lookup.ts as the single source of truth.
 * 
 * ## Main Features
 * 
 * - Symbol extraction (classes, functions, methods, etc.)
 * - Symbol search by name pattern and kind
 * - Reference finding across files
 * - AST-aware code modifications (replace, insert, rename)
 * 
 * @example
 * ```typescript
 * import { 
 *   initializeSemanticModule,
 *   extractSymbolsFromFile, 
 *   findSymbol,
 *   findSymbols,
 *   replaceSymbolBody 
 * } from './semantic';
 * 
 * // Initialize once at startup
 * await initializeSemanticModule();
 * 
 * // Extract all symbols from a file
 * const result = await extractSymbolsFromFile(filePath, content);
 * 
 * // Find a specific symbol (exact match - fast)
 * const found = await findSymbol(result.symbols, 'MyClass/myMethod');
 * 
 * // Find symbols by pattern (wildcard support)
 * const allMethods = await findSymbols(result.symbols, 'MyClass/*');
 * 
 * // Replace a symbol's body
 * await replaceSymbolBody(filePath, content, 'MyClass/myMethod', newBody);
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export {
  SymbolKind,
  SymbolKindNames,
  Symbol,
  SymbolLocation,
  SymbolMetadata,
  SymbolExtractionResult,
  SymbolReference,
  ReferenceType,
  FindSymbolOptions,
  FindReferencesOptions,
  ReplaceResult,
  SupportedLanguage,
  EXTENSION_LANGUAGE_MAP,
  getLanguageFromPath,
  isLanguageSupported,
} from "./types.js";

import type { SupportedLanguage } from "./types.js";

// ============================================================================
// TREE-SITTER MANAGER
// ============================================================================

export { treeSitterManager, TreeSitterManager } from "./tree-sitter-manager.js";
import { treeSitterManager } from "./tree-sitter-manager.js";
export { isSemanticAvailable } from "./tree-sitter-manager.js";

// ============================================================================
// LANGUAGE CONFIGURATION
// ============================================================================

export {
  LanguageConfig,
  NodeTypeConfig,
  LANGUAGE_CONFIGS,
  getLanguageConfig,
  isSymbolNode,
  getNodeConfig,
} from "./language-config.js";

// ============================================================================
// SYMBOL EXTRACTION
// ============================================================================

export {
  ExtractionOptions,
  extractSymbols,
  extractSymbolsFromFile,
  flattenSymbols,
  getSymbolBody,
  getSymbolText,
} from "./symbol-extractor.js";

// ============================================================================
// SYMBOL LOOKUP - SSOT (All symbol finding operations)
// ============================================================================

export {
  // Types
  LookupSource,
  LookupOptions,
  LookupResult,
  StringLiteralResult,
  StringLiteralOptions,
  // Core API
  findSymbol,
  findSymbols,
  findSymbolOrThrow,
  hasSymbol,
  lookupSymbols,
  // Convenience functions
  findSymbolsByKind,
  getTopLevelSymbols,
  // Position-based functions
  getSymbolAtPosition,
  getSymbolChildren,
  // String literal search
  findStringLiterals,
  findStringIdentifiers,
} from "./symbol-lookup.js";

// ============================================================================
// REFERENCE FINDING
// ============================================================================

export {
  ReferenceSearchResult,
  ReferenceCountsByType,
  findReferences,
  findReferencesFromDefinition,
  getSearchableFiles,
  countReferences,
  findUnusedSymbols,
} from "./reference-finder.js";

// ============================================================================
// CODE EDITING
// ============================================================================

export {
  ReplaceOptions,
  InsertOptions,
  RenameOptions,
  SymbolRenameResult,
  replaceSymbolBody,
  replaceSymbol,
  insertBeforeSymbol,
  insertAfterSymbol,
  renameSymbol,
  deleteSymbol,
} from "./code-editor.js";

// ============================================================================
// CACHE UTILITIES
// ============================================================================

export {
  LRUCache,
  symbolCache,
  clearSymbolCaches,
  getSymbolCacheStats,
} from "./symbol-cache.js";

// ============================================================================
// IMPORT ANALYSIS
// ============================================================================

export {
  ImportInfo,
  ImportSpecifier,
  ImportExtractionResult,
  DependentFile,
  RelatedTestFile,
  UnusedImport,
  extractImports,
  getImportSources,
  hasImport,
  findImportsFrom,
  findDependents,
  countDependents,
  findRelatedTests,
  findUnusedImports,
} from "./import-analyzer.js";

// ============================================================================
// CALL HIERARCHY
// ============================================================================

export {
  CallerInfo,
  CalleeInfo,
  getCallers,
  getCallees,
  countCallers,
  countCallees,
} from "./call-hierarchy.js";

// ============================================================================
// FILE STATISTICS
// ============================================================================

export {
  LineStats,
  SymbolStats,
  FileStats,
  BatchFileStatsResult,
  getFileStats,
  batchGetFileStats,
  getFileSummary,
  countTotalSymbols,
} from "./file-stats.js";

// ============================================================================
// DEPRECATED SYMBOL DETECTION
// ============================================================================

export {
  DeprecatedSymbol,
  DeprecatedUsage,
  DeprecatedUsageReport,
  FindDeprecatedUsagesOptions,
  findDeprecatedSymbolsInFile,
  findAllDeprecatedSymbols,
  findDeprecatedUsages,
  findDeprecatedUsagesInFile,
  formatDeprecatedUsagesReport,
} from "./deprecated-finder.js";

// ============================================================================
// MODULE INITIALIZATION
// ============================================================================

/**
 * Initialize the semantic module (tree-sitter)
 */
export async function initializeSemanticModule(): Promise<void> {
  await treeSitterManager.initialize();
}

/**
 * Get semantic module status including cache statistics
 */
export async function getSemanticModuleStatus(): Promise<{
  initialized: boolean;
  loadedLanguages: SupportedLanguage[];
  availableGrammars: { available: SupportedLanguage[]; missing: SupportedLanguage[] };
  cacheStats: {
    astCache: { size: number; maxSize?: number; ttlMs?: number; hits: number; misses: number; hitRate: number };
    symbolCache: { size: number; maxSize: number; ttlMs: number };
  };
}> {
  const { available, missing } = await treeSitterManager.getAvailableGrammars();
  const { getSymbolCacheStats } = await import("./symbol-cache.js");
  
  return {
    initialized: treeSitterManager.getLoadedLanguages().length > 0,
    loadedLanguages: treeSitterManager.getLoadedLanguages(),
    availableGrammars: { available, missing },
    cacheStats: {
      astCache: treeSitterManager.getCacheStats(),
      symbolCache: getSymbolCacheStats().symbolCache,
    },
  };
}
