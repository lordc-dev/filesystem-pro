/**
 * Shared Schema Definitions (SSOT)
 * 
 * All Zod schemas used across tool registrations are defined here
 * to reduce duplication and ensure consistency.
 */

import { z } from "zod";

// ============================================================================
// BASE INPUT SCHEMAS
// ============================================================================

export const PathSchema = z.string().describe("File or directory path");
export const ExcludePatternsSchema = z.array(z.string()).optional().default([]);
export const PatternSchema = z.string().describe("Search pattern (regex)");

// Semantic tool schemas
export const IncludeBodySchema = z.boolean().optional().default(false).describe("Include the symbol's source code");
export const DryRunSchema = z.boolean().optional().default(false).describe("Preview changes without applying");
export const SymbolNamePathSchema = z.string().describe("Symbol name path (e.g., 'MyClass/myMethod')");

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

export const SuccessSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const PathSuccessSchema = SuccessSchema.extend({
  path: z.string(),
});

export const DualPathSuccessSchema = SuccessSchema.extend({
  source: z.string(),
  destination: z.string(),
});

// Shape exports for outputSchema (MCP expects object, not ZodObject)
export const PathSuccessShape = PathSuccessSchema.shape;
export const DualPathSuccessShape = DualPathSuccessSchema.shape;
export const SuccessShape = SuccessSchema.shape;

export const SearchResultsSchema = {
  matches: z.array(z.string()).describe("Matching paths"),
  count: z.number().describe("Number of matches"),
};

export const DirectoryEntrySchema = z.object({
  name: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number().optional(),
});

export const WatcherResponseSchema = {
  watcherId: z.string(),
  path: z.string(),
  message: z.string(),
};

// ============================================================================
// SEMANTIC SCHEMAS
// ============================================================================

export const SymbolKindSchema = z.enum([
  "File", "Module", "Namespace", "Package", "Class", "Method", "Property",
  "Field", "Constructor", "Enum", "Interface", "Function", "Variable",
  "Constant", "String", "Number", "Boolean", "Array", "Object", "Key",
  "Null", "EnumMember", "Struct", "Event", "Operator", "TypeParameter"
]);

export const SymbolLocationSchema = z.object({
  startLine: z.number(),
  endLine: z.number(),
  startColumn: z.number(),
  endColumn: z.number(),
});

// Base symbol schema without children to avoid circular reference
const BaseSymbolSchema = z.object({
  name: z.string(),
  namePath: z.string(),
  kind: z.number(),
  kindName: z.string(),
  location: SymbolLocationSchema,
});

// Symbol schema with recursive children using z.lazy()
export const SymbolSchema: z.ZodType<{
  name: string;
  namePath: string;
  kind: number;
  kindName: string;
  location: z.infer<typeof SymbolLocationSchema>;
  children?: unknown[];
}> = BaseSymbolSchema.extend({
  children: z.lazy(() => z.array(SymbolSchema)).optional(),
});

export const ReferenceTypeSchema = z.enum([
  "call", "import", "export", "type", "new", "assignment",
  "property", "argument", "return", "declaration", "extends",
  "implements", "decorator", "jsx", "unknown"
]);

// ============================================================================
// IMPORT/DEPENDENCY SCHEMAS
// ============================================================================

export const ImportSpecifierSchema = z.object({
  name: z.string().describe("The imported name (what's exported from the module)"),
  alias: z.string().optional().describe("Local alias if renamed"),
  isTypeOnly: z.boolean().optional().describe("Whether this is a type-only import"),
});

export const ImportInfoSchema = z.object({
  source: z.string().describe("Module specifier (e.g., './utils', 'react')"),
  specifiers: z.array(ImportSpecifierSchema),
  isDefault: z.boolean(),
  isNamespace: z.boolean(),
  isTypeOnly: z.boolean(),
  isSideEffect: z.boolean(),
  location: z.object({
    startLine: z.number(),
    endLine: z.number(),
  }),
  rawText: z.string(),
});

export const DependentFileSchema = z.object({
  filePath: z.string(),
  importStatement: z.string(),
  line: z.number(),
});

export const RelatedTestFileSchema = z.object({
  filePath: z.string().describe("Path to the test file"),
  patternType: z.string().describe("Test pattern type (test, spec, __tests__, pytest)"),
});

export const UnusedImportSchema = z.object({
  source: z.string(),
  unusedSpecifiers: z.array(z.string()),
  isFullyUnused: z.boolean(),
  line: z.number(),
});

// ============================================================================
// CALL HIERARCHY SCHEMAS
// ============================================================================

export const CallerInfoSchema = z.object({
  filePath: z.string().describe("Path to the file containing the caller"),
  callerSymbol: z.string().optional().describe("Name of the containing function/method"),
  location: SymbolLocationSchema,
  context: z.string().describe("Code context around the call"),
});

export const CalleeInfoSchema = z.object({
  name: z.string().describe("Name of the called function"),
  location: SymbolLocationSchema,
  isMethodCall: z.boolean().describe("Whether this is a method call (obj.method())"),
  receiver: z.string().optional().describe("Object/class receiving the method call"),
});

// ============================================================================
// FILE STATS SCHEMAS
// ============================================================================

export const LineStatsSchema = z.object({
  total: z.number(),
  code: z.number(),
  blank: z.number(),
  comment: z.number(),
});

export const SymbolStatsSchema = z.object({
  functions: z.number(),
  classes: z.number(),
  interfaces: z.number(),
  types: z.number(),
  variables: z.number(),
  constants: z.number(),
  enums: z.number(),
  methods: z.number(),
  total: z.number(),
});

export const CodeFileStatsSchema = z.object({
  path: z.string(),
  language: z.string(),
  lines: LineStatsSchema,
  symbols: SymbolStatsSchema,
  imports: z.object({
    count: z.number(),
    sources: z.array(z.string()),
  }),
  exports: z.object({
    count: z.number(),
    names: z.array(z.string()),
  }),
});

// ============================================================================
// SEARCH RESULT SCHEMAS
// ============================================================================

export const ContentSearchSubmatchSchema = z.object({
  text: z.string().describe("Matched text"),
  start: z.number().describe("Start column (0-indexed)"),
  end: z.number().describe("End column (0-indexed)"),
});

// Base content search result without recursive matches
const BaseContentSearchResultSchema = z.object({
  file: z.string().describe("File path"),
  line: z.number().describe("Line number"),
  content: z.string().describe("Line content"),
  submatches: z.array(ContentSearchSubmatchSchema),
});

// Full content search result with recursive matches (deprecated field)
export const ContentSearchResultSchema: z.ZodType<{
  file: string;
  line: number;
  content: string;
  submatches: z.infer<typeof ContentSearchSubmatchSchema>[];
  matches?: unknown[];
}> = BaseContentSearchResultSchema.extend({
  matches: z.lazy(() => z.array(ContentSearchResultSchema)).optional(),
});

// ============================================================================
// PROJECT PATTERN SCHEMAS
// ============================================================================

export const PatternVariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const ProjectPatternSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  pattern: z.string(),
  type: z.enum(["code", "structure", "config"]),
  language: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  variables: z.array(PatternVariableSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// DIRECTORY TREE SCHEMAS
// ============================================================================

// Base tree entry without children
const BaseTreeEntrySchema = z.object({
  name: z.string(),
  type: z.enum(["file", "directory"]),
});

// Recursive tree entry with children
export const TreeEntrySchema: z.ZodType<{
  name: string;
  type: "file" | "directory";
  children?: unknown[];
}> = BaseTreeEntrySchema.extend({
  children: z.lazy(() => z.array(TreeEntrySchema)).optional(),
});
