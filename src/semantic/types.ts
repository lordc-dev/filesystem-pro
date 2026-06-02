/**
 * Semantic Code Analysis Types
 * 
 * Type definitions for AST-based code analysis using Tree-sitter.
 * SymbolKind values are LSP-compatible for interoperability.
 * 
 * Language types and EXTENSION_LANGUAGE_MAP are defined in constants.ts (SSOT).
 * They are re-exported here for backward compatibility.
 */

import type { SupportedLanguage } from "../constants.js";
export type { SupportedLanguage } from "../constants.js";
export { EXTENSION_LANGUAGE_MAP, getLanguageFromPath, isLanguageSupported } from "../constants.js";

/**
 * Symbol kinds following LSP specification values
 * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#symbolKind
 */
export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

/**
 * Human-readable names for SymbolKind values (SSOT)
 * 
 * Uses numeric keys for universal compatibility across modules.
 * Import this instead of creating local copies.
 */
export const SymbolKindNames: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
};

/**
 * Location within a file (0-indexed lines and columns)
 */
export interface SymbolLocation {
  /** Start line (0-indexed) */
  startLine: number;
  /** Start column (0-indexed) */
  startColumn: number;
  /** End line (0-indexed) */
  endLine: number;
  /** End column (0-indexed) */
  endColumn: number;
  /** Byte offset for start position */
  startOffset: number;
  /** Byte offset for end position */
  endOffset: number;
}

/**
 * Represents a code symbol extracted from AST
 */
export interface Symbol {
  /** Symbol name (e.g., "MyClass", "myFunction") */
  name: string;
  /** Full path including parent symbols (e.g., "MyClass/myMethod") */
  namePath: string;
  /** Symbol type */
  kind: SymbolKind;
  /** Location in the source file */
  location: SymbolLocation;
  /** Location of just the symbol's body (excluding signature) */
  bodyLocation?: SymbolLocation;
  /** Child symbols (methods, properties, nested classes, etc.) */
  children: Symbol[];
  /** Parent symbol name path, undefined for top-level */
  parent?: string;
  /** Additional metadata */
  metadata?: SymbolMetadata;
}

/**
 * Optional metadata for symbols
 */
export interface SymbolMetadata {
  /** Documentation comment if present */
  documentation?: string;
  /** Visibility modifier (public, private, protected) */
  visibility?: "public" | "private" | "protected";
  /** Whether the symbol is static */
  isStatic?: boolean;
  /** Whether the symbol is async */
  isAsync?: boolean;
  /** Whether the symbol is exported */
  isExported?: boolean;
  /** Type annotation if present */
  typeAnnotation?: string;
  /** Decorators/annotations */
  decorators?: string[];
}

/**
 * Result of symbol extraction for a file
 */
export interface SymbolExtractionResult {
  /** File path */
  filePath: string;
  /** Detected language */
  language: SupportedLanguage;
  /** Top-level symbols */
  symbols: Symbol[];
  /** Total symbol count (including nested) */
  totalSymbolCount: number;
  /** Parse errors if any */
  errors?: string[];
}

/**
 * Reference to a symbol in the codebase
 */
/**
 * Types of symbol references for classification
 */
export type ReferenceType = 
  | "call"           // Function/method invocation: foo()
  | "import"         // Import statement: import { foo }
  | "export"         // Export statement: export { foo }
  | "type"           // Type annotation: x: Foo
  | "new"            // Constructor call: new Foo()
  | "assignment"     // Variable assignment: x = foo
  | "property"       // Property access: obj.foo
  | "argument"       // Function argument: bar(foo)
  | "return"         // Return statement: return foo
  | "declaration"    // Variable/function declaration
  | "extends"        // Class extension: extends Foo
  | "implements"     // Interface implementation: implements Foo
  | "decorator"      // Decorator: @Foo
  | "jsx"            // JSX element: <Foo />
  | "unknown";       // Could not classify

export interface SymbolReference {
  /** File containing the reference */
  filePath: string;
  /** Location of the reference */
  location: SymbolLocation;
  /** The matched text */
  text: string;
  /** Context around the reference */
  context?: string;
  /** Whether this is the definition */
  isDefinition: boolean;
  /** Type of reference (call, import, type annotation, etc.) */
  referenceType?: ReferenceType;
}

/**
 * Options for finding symbols
 */
export interface FindSymbolOptions {
  /** Name or name path pattern to search for */
  namePattern: string;
  /** Filter by symbol kind */
  kinds?: SymbolKind[];
  /** Maximum depth to search (0 = top-level only) */
  depth?: number;
  /** Include symbol body in results */
  includeBody?: boolean;
  /** Use substring matching instead of exact match */
  substringMatch?: boolean;
  /** Case-insensitive matching */
  ignoreCase?: boolean;
}

/**
 * Options for finding references
 */
export interface FindReferencesOptions {
  /** Include the definition in results */
  includeDefinition?: boolean;
  /** Limit search to specific file patterns */
  filePatterns?: string[];
  /** Exclude patterns */
  excludePatterns?: readonly string[];
  /** Context lines around each reference */
  contextLines?: number;
}

/**
 * Result of a symbol replacement operation
 */
export interface ReplaceResult {
  /** Whether the replacement succeeded */
  success: boolean;
  /** Path to the modified file */
  filePath: string;
  /** Unified diff of changes */
  diff: string;
  /** New content after replacement (if not dry run) */
  newContent?: string;
  /** Error message if failed */
  error?: string;
}

