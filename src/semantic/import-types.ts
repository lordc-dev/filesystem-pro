/**
 * Shared types for import analysis across all language analyzers.
 * This file serves as the Single Source of Truth (SSOT) for import-related interfaces.
 *
 * @module import-types
 */

import type { SymbolLocation } from "./types.js";

/**
 * Represents a single import specifier (named import, default import, etc.)
 */
export interface ImportSpecifier {
  /** The imported name */
  name: string;
  /** Alias if renamed (e.g., `import { foo as bar }`) */
  alias?: string;
  /** Whether this specific specifier is type-only */
  isTypeOnly?: boolean;
}

/**
 * Represents a complete import statement with all its metadata
 */
export interface ImportInfo {
  /** The source module path (e.g., './utils', 'lodash') */
  source: string;
  /** List of imported specifiers */
  specifiers: ImportSpecifier[];
  /** Whether this is a default import */
  isDefault: boolean;
  /** Whether this is a namespace import (e.g., `import * as foo`) */
  isNamespace: boolean;
  /** Whether this is a type-only import (TypeScript) */
  isTypeOnly: boolean;
  /** Whether this is a side-effect only import (e.g., `import './styles.css'`) */
  isSideEffect: boolean;
  /** Resolved absolute path if available */
  resolvedPath?: string;
  /** Location of the import statement in source */
  location: SymbolLocation;
  /** Raw text of the import statement */
  rawText: string;
}

/**
 * Result of extracting imports from a file
 */
export interface ImportExtractionResult {
  /** All imports found in the file */
  imports: ImportInfo[];
  /** Total count of imports */
  count: number;
  /** Summary breakdown by import type */
  summary: {
    default: number;
    named: number;
    namespace: number;
    sideEffect: number;
    typeOnly: number;
  };
}

/**
 * Represents a file that depends on (imports) another file
 */
export interface DependentFile {
  /** Absolute path to the dependent file */
  filePath: string;
  /** Line number where the import occurs */
  line: number;
  /** The raw import statement text */
  importStatement: string;
}

/**
 * Represents a test file related to a source file
 */
export interface RelatedTestFile {
  /** Path to the test file */
  filePath: string;
  /** Test pattern type (test, spec, __tests__, pytest) */
  patternType: string;
}

/**
 * Represents an unused import detected in a file
 */
export interface UnusedImport {
  /** The import info */
  import: ImportInfo;
  /** Specific unused specifiers (for named imports) */
  unusedSpecifiers: string[];
  /** Whether the entire import is unused */
  isFullyUnused: boolean;
}
