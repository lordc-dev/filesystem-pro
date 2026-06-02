/**
 * Tool Selector - Intelligent tool recommendation engine
 *
 * Analyzes user intent and recommends the optimal filesystem tool(s)
 * for the task. Used for debug status reporting and future smart routing.
 *
 * Features:
 * - Intent-to-tool mapping with confidence scoring
 * - Tool capability matrix (what each tool can do)
 * - Alternative tool suggestions when preferred tool unavailable
 * - Status reporting for MCP debug mode
 */

import { isRipgrepAvailable } from "../search/index.js";

// ============================================================================
// TYPES
// ============================================================================

export type ToolCategory =
  | "file-read"
  | "file-write"
  | "directory"
  | "search"
  | "semantic"
  | "analysis"
  | "editing"
  | "undo";

export interface ToolInfo {
  name: string;
  category: ToolCategory;
  description: string;
  capabilities: string[];
  prerequisites: string[];
  alternatives: string[];
  readOnly: boolean;
}

export interface ToolRecommendation {
  tool: string;
  confidence: number;
  reason: string;
  alternatives: string[];
}

export interface IToolSelector {
  isRipgrepAvailable(): boolean;
  recommendTools(intent: string): ToolRecommendation[];
  getToolInfo(name: string): ToolInfo | undefined;
  getToolsByCategory(category: ToolCategory): ToolInfo[];
  generateStatusReport(): string;
}

// ============================================================================
// TOOL CAPABILITY MATRIX (SSOT)
// ============================================================================

const TOOL_MATRIX: ToolInfo[] = [
  // File Read
  { name: "read_text_file", category: "file-read", description: "Read file as UTF-8 text", capabilities: ["read", "partial-read", "head", "tail"], prerequisites: [], alternatives: ["read_multiple_files"], readOnly: true },
  { name: "read_multiple_files", category: "file-read", description: "Read multiple files simultaneously", capabilities: ["batch-read"], prerequisites: [], alternatives: ["read_text_file"], readOnly: true },
  { name: "read_media_file", category: "file-read", description: "Read image/audio as base64", capabilities: ["media-read", "binary-read"], prerequisites: [], alternatives: [], readOnly: true },
  { name: "get_file_info", category: "file-read", description: "Get file metadata", capabilities: ["metadata", "size", "dates", "permissions"], prerequisites: [], alternatives: [], readOnly: true },

  // File Write
  { name: "write_file", category: "file-write", description: "Create or overwrite a file", capabilities: ["create", "overwrite"], prerequisites: [], alternatives: ["edit_file"], readOnly: false },
  { name: "edit_file", category: "file-write", description: "Line-based file edits with diff", capabilities: ["edit", "replace", "insert", "diff-output"], prerequisites: [], alternatives: ["write_file"], readOnly: false },

  // Directory
  { name: "list_directory", category: "directory", description: "List files/dirs with type markers", capabilities: ["list"], prerequisites: [], alternatives: ["directory_tree"], readOnly: true },
  { name: "directory_tree", category: "directory", description: "Recursive tree view as JSON", capabilities: ["tree", "recursive-list"], prerequisites: [], alternatives: ["list_directory"], readOnly: true },
  { name: "create_directory", category: "directory", description: "Create directory including nested", capabilities: ["mkdir", "nested-create"], prerequisites: [], alternatives: [], readOnly: false },
  { name: "move_file", category: "directory", description: "Move or rename files/dirs", capabilities: ["move", "rename"], prerequisites: [], alternatives: [], readOnly: false },
  { name: "delete_file", category: "directory", description: "Permanently delete a file", capabilities: ["delete-file"], prerequisites: [], alternatives: ["delete_path"], readOnly: false },
  { name: "delete_directory", category: "directory", description: "Delete a directory", capabilities: ["delete-dir", "recursive-delete"], prerequisites: [], alternatives: ["delete_path"], readOnly: false },
  { name: "delete_path", category: "directory", description: "Delete file or dir (auto-detect)", capabilities: ["delete", "auto-detect"], prerequisites: [], alternatives: ["delete_file", "delete_directory"], readOnly: false },
  { name: "watch_directory", category: "directory", description: "Watch directory for changes", capabilities: ["watch", "chokidar"], prerequisites: [], alternatives: [], readOnly: true },
  { name: "stop_watching", category: "directory", description: "Stop watching a directory", capabilities: ["unwatch"], prerequisites: [], alternatives: [], readOnly: true },
  { name: "list_allowed_directories", category: "directory", description: "List allowed directories (Roots)", capabilities: ["roots", "allowed-paths"], prerequisites: ["roots-protocol"], alternatives: [], readOnly: true },

  // Search
  { name: "search_content", category: "search", description: "Ripgrep regex search in files", capabilities: ["regex-search", "context-lines", "file-type-filter"], prerequisites: ["ripgrep"], alternatives: [], readOnly: true },
  { name: "search_files", category: "search", description: "Search files by name pattern", capabilities: ["filename-search"], prerequisites: ["ripgrep"], alternatives: ["find_by_glob"], readOnly: true },
  { name: "find_by_glob", category: "search", description: "Find files using glob patterns", capabilities: ["glob-match", "pattern-match"], prerequisites: [], alternatives: ["search_files"], readOnly: true },
  { name: "count_matches", category: "search", description: "Count pattern matches in files", capabilities: ["count", "frequency"], prerequisites: ["ripgrep"], alternatives: ["search_content"], readOnly: true },
  { name: "diff_files", category: "search", description: "Compare two files", capabilities: ["diff", "compare", "unified", "side-by-side"], prerequisites: [], alternatives: [], readOnly: true },
  { name: "bulk_rename", category: "search", description: "Rename files using pattern matching", capabilities: ["batch-rename", "regex-rename"], prerequisites: [], alternatives: [], readOnly: false },
  { name: "get_project_patterns", category: "search", description: "Get code patterns from AGENTS.md", capabilities: ["patterns", "conventions"], prerequisites: [], alternatives: [], readOnly: true },

  // Semantic
  { name: "get_symbols_overview", category: "semantic", description: "List top-level symbols in file", capabilities: ["symbols", "structure"], prerequisites: ["tree-sitter"], alternatives: ["find_symbol"], readOnly: true },
  { name: "find_symbol", category: "semantic", description: "Find symbol by name pattern", capabilities: ["symbol-search", "wildcard", "body-retrieval"], prerequisites: ["tree-sitter"], alternatives: ["get_symbols_overview"], readOnly: true },
  { name: "find_string_literals", category: "semantic", description: "Find string literals matching pattern", capabilities: ["string-search", "literal-match"], prerequisites: ["tree-sitter"], alternatives: ["search_content"], readOnly: true },
  { name: "find_symbol_references", category: "semantic", description: "Find all references to a symbol", capabilities: ["references", "cross-file", "call-count"], prerequisites: ["tree-sitter", "ripgrep"], alternatives: ["search_content"], readOnly: true },
  { name: "find_unused_symbols", category: "semantic", description: "Find dead code (unused exports)", capabilities: ["dead-code", "unused-exports"], prerequisites: ["tree-sitter", "ripgrep"], alternatives: [], readOnly: true },
  { name: "find_deprecated_usages", category: "semantic", description: "Detect usage of deprecated symbols", capabilities: ["deprecated", "api-audit"], prerequisites: ["tree-sitter", "ripgrep"], alternatives: [], readOnly: true },

  // Analysis
  { name: "find_imports", category: "analysis", description: "Extract all imports from source file", capabilities: ["imports", "dependency-introspection"], prerequisites: ["tree-sitter"], alternatives: [], readOnly: true },
  { name: "find_dependents", category: "analysis", description: "Find files importing given file", capabilities: ["reverse-deps", "impact-analysis"], prerequisites: ["ripgrep"], alternatives: [], readOnly: true },
  { name: "find_related_tests", category: "analysis", description: "Find test files for source file", capabilities: ["test-discovery", "convention-match"], prerequisites: [], alternatives: [], readOnly: true },
  { name: "find_unused_imports", category: "analysis", description: "Detect unused imports in file", capabilities: ["unused-imports"], prerequisites: ["tree-sitter"], alternatives: [], readOnly: true },
  { name: "get_callers", category: "analysis", description: "Upstream call hierarchy", capabilities: ["callers", "upstream", "impact-of-change"], prerequisites: ["tree-sitter"], alternatives: [], readOnly: true },
  { name: "get_callees", category: "analysis", description: "Downstream call hierarchy", capabilities: ["callees", "downstream", "dependency-map"], prerequisites: ["tree-sitter"], alternatives: [], readOnly: true },
  { name: "get_file_stats", category: "analysis", description: "File statistics (lines, symbols)", capabilities: ["stats", "lines", "symbols-count"], prerequisites: ["tree-sitter"], alternatives: [], readOnly: true },
  { name: "get_file_summary", category: "analysis", description: "Human-readable file overview", capabilities: ["summary", "overview"], prerequisites: ["tree-sitter"], alternatives: ["get_file_stats"], readOnly: true },

  // Editing
  { name: "replace_symbol_body", category: "editing", description: "Replace symbol implementation", capabilities: ["replace-body", "preserve-signature"], prerequisites: ["tree-sitter"], alternatives: ["edit_file"], readOnly: false },
  { name: "insert_before_symbol", category: "editing", description: "Insert code before symbol", capabilities: ["insert-before"], prerequisites: ["tree-sitter"], alternatives: ["edit_file"], readOnly: false },
  { name: "insert_after_symbol", category: "editing", description: "Insert code after symbol", capabilities: ["insert-after"], prerequisites: ["tree-sitter"], alternatives: ["edit_file"], readOnly: false },
  { name: "rename_symbol", category: "editing", description: "Rename symbol across codebase", capabilities: ["rename", "cross-file-rename"], prerequisites: ["tree-sitter", "ripgrep"], alternatives: [], readOnly: false },
  { name: "extract_method", category: "editing", description: "Extract code into new function", capabilities: ["extract", "refactor"], prerequisites: ["tree-sitter"], alternatives: [], readOnly: false },
  { name: "inline_variable", category: "editing", description: "Replace variable with its value", capabilities: ["inline", "refactor"], prerequisites: ["tree-sitter"], alternatives: [], readOnly: false },
  { name: "introduce_parameter", category: "editing", description: "Convert expression to parameter", capabilities: ["parameterize", "refactor"], prerequisites: ["tree-sitter"], alternatives: [], readOnly: false },

  // Undo
  { name: "undo", category: "undo", description: "Undo last N filesystem ops", capabilities: ["undo", "restore"], prerequisites: [], alternatives: [], readOnly: false },
  { name: "undo_peek", category: "undo", description: "Preview undo stack", capabilities: ["peek", "preview"], prerequisites: [], alternatives: [], readOnly: true },
  { name: "undo_all", category: "undo", description: "Undo all recorded ops", capabilities: ["undo-all", "full-restore"], prerequisites: [], alternatives: [], readOnly: false },
  { name: "undo_status", category: "undo", description: "Undo stack status", capabilities: ["status"], prerequisites: [], alternatives: [], readOnly: true },
];

// ============================================================================
// INTENT → TOOL MAPPING
// ============================================================================

const INTENT_PATTERNS: Array<{ pattern: RegExp; tools: Array<{ name: string; reason: string }> }> = [
  { pattern: /\b(read|view|show|cat|display|open)\b.*\b(file|content|code|source)\b/i, tools: [{ name: "read_text_file", reason: "Direct file read" }] },
  { pattern: /\b(overview|summary|describe|explain|understand)\b.*\b(file|code)\b/i, tools: [{ name: "get_file_summary", reason: "Comprehensive file overview" }, { name: "get_file_stats", reason: "Quantitative file statistics" }] },
  { pattern: /\b(find|search|locate|where)\b.*\b(symbol|function|class|method|definition)\b/i, tools: [{ name: "find_symbol", reason: "Symbol lookup by name" }, { name: "get_symbols_overview", reason: "List all symbols" }] },
  { pattern: /\b(find|search|grep|look)\b.*\b(text|content|string|code|pattern)\b/i, tools: [{ name: "search_content", reason: "Regex content search" }] },
  { pattern: /\b(find|search|locate)\b.*\b(file|files|filename)\b/i, tools: [{ name: "find_by_glob", reason: "Glob-based file search" }, { name: "search_files", reason: "Filename pattern search" }] },
  { pattern: /\b(rename|move|reorganize)\b.*\b(file|files|symbol)\b/i, tools: [{ name: "rename_symbol", reason: "Semantic cross-file rename" }, { name: "move_file", reason: "Filesystem move/rename" }, { name: "bulk_rename", reason: "Batch file rename" }] },
  { pattern: /\b(edit|modify|change|update|replace|fix)\b.*\b(file|code|function|method)\b/i, tools: [{ name: "edit_file", reason: "Line-based edit with diff" }, { name: "replace_symbol_body", reason: "Replace function body preserving signature" }] },
  { pattern: /\b(write|create|new)\b.*\b(file|files)\b/i, tools: [{ name: "write_file", reason: "Create/overwrite file" }] },
  { pattern: /\b(delete|remove|rm)\b.*\b(file|directory|dir|folder)\b/i, tools: [{ name: "delete_path", reason: "Auto-detect delete" }, { name: "delete_file", reason: "Delete file" }, { name: "delete_directory", reason: "Delete directory" }] },
  { pattern: /\b(list|ls|show|tree)\b.*\b(dir|directory|folder|files)\b/i, tools: [{ name: "list_directory", reason: "Flat directory listing" }, { name: "directory_tree", reason: "Recursive tree view" }] },
  { pattern: /\b(references|refs|usage|used|usages|where.*used)\b/i, tools: [{ name: "find_symbol_references", reason: "Cross-file reference search" }] },
  { pattern: /\b(unused|dead.*code|unreferenced|orphan)\b/i, tools: [{ name: "find_unused_symbols", reason: "Dead code detection" }, { name: "find_unused_imports", reason: "Unused import detection" }] },
  { pattern: /\b(import|imports|dependencies|deps)\b/i, tools: [{ name: "find_imports", reason: "Import analysis" }, { name: "find_dependents", reason: "Reverse dependency lookup" }] },
  { pattern: /\b(caller|callers|who.*calls|upstream|impact.*change)\b/i, tools: [{ name: "get_callers", reason: "Upstream call hierarchy" }] },
  { pattern: /\b(callee|callees|what.*calls|downstream|calls.*what)\b/i, tools: [{ name: "get_callees", reason: "Downstream call hierarchy" }] },
  { pattern: /\b(test|tests|spec|coverage)\b/i, tools: [{ name: "find_related_tests", reason: "Test file discovery" }] },
  { pattern: /\b(deprecated|deprecation|legacy|obsolete)\b/i, tools: [{ name: "find_deprecated_usages", reason: "Deprecated symbol detection" }] },
  { pattern: /\b(extract|refactor)\b.*\b(method|function)\b/i, tools: [{ name: "extract_method", reason: "Extract code into new function" }] },
  { pattern: /\b(inline|flatten)\b.*\b(variable|var)\b/i, tools: [{ name: "inline_variable", reason: "Replace variable with its value" }] },
  { pattern: /\b(parameterize|add.*parameter|introduce.*param)\b/i, tools: [{ name: "introduce_parameter", reason: "Convert expression to parameter" }] },
  { pattern: /\b(undo|revert|rollback|restore)\b/i, tools: [{ name: "undo", reason: "Undo last N operations" }, { name: "undo_peek", reason: "Preview undo stack" }] },
  { pattern: /\b(diff|compare|difference|changes)\b/i, tools: [{ name: "diff_files", reason: "File comparison" }] },
  { pattern: /\b(review|audit|assess|evaluate)\b.*\b(code|file)\b/i, tools: [{ name: "get_file_summary", reason: "File overview for review" }, { name: "find_unused_symbols", reason: "Dead code check" }, { name: "find_deprecated_usages", reason: "Deprecated usage check" }] },
  { pattern: /\b(directory|list|tree)\b.*\b(allowed|roots|accessible)\b/i, tools: [{ name: "list_allowed_directories", reason: "Show Roots Protocol boundaries" }] },
  { pattern: /\b(watch|monitor|observe)\b.*\b(directory|file|changes)\b/i, tools: [{ name: "watch_directory", reason: "Filesystem watcher" }] },
  { pattern: /\b(patterns|conventions|style|coding.*standard)\b/i, tools: [{ name: "get_project_patterns", reason: "AGENTS.md code patterns" }] },
  { pattern: /\b(string.*literal|string.*value|hardcoded.*string)\b/i, tools: [{ name: "find_string_literals", reason: "String literal search" }] },
];

// ============================================================================
// TOOL INDEX
// ============================================================================

const toolByName = new Map<string, ToolInfo>();
for (const tool of TOOL_MATRIX) {
  toolByName.set(tool.name, tool);
}

const toolsByCategory = new Map<ToolCategory, ToolInfo[]>();
for (const tool of TOOL_MATRIX) {
  const list = toolsByCategory.get(tool.category) ?? [];
  list.push(tool);
  toolsByCategory.set(tool.category, list);
}

// ============================================================================
// SELECTOR IMPLEMENTATION
// ============================================================================

class ToolSelectorImpl implements IToolSelector {
  private ripgrepAvailable = false;

  async initialize(): Promise<void> {
    this.ripgrepAvailable = await isRipgrepAvailable();
  }

  isRipgrepAvailable(): boolean {
    return this.ripgrepAvailable;
  }

  recommendTools(intent: string): ToolRecommendation[] {
    const results: ToolRecommendation[] = [];
    const seen = new Set<string>();

    for (const { pattern, tools } of INTENT_PATTERNS) {
      if (pattern.test(intent)) {
        for (const { name, reason } of tools) {
          if (seen.has(name)) continue;
          seen.add(name);

          const info = toolByName.get(name);
          if (!info) continue;

          if (info.prerequisites.includes("ripgrep") && !this.ripgrepAvailable) {
            continue;
          }

          results.push({
            tool: name,
            confidence: 0.9,
            reason,
            alternatives: info.alternatives,
          });
        }
      }
    }

    if (results.length === 0) {
      results.push({
        tool: "search_content",
        confidence: 0.3,
        reason: "No specific match — generic content search fallback",
        alternatives: ["find_by_glob", "search_files"],
      });
    }

    return results;
  }

  getToolInfo(name: string): ToolInfo | undefined {
    return toolByName.get(name);
  }

  getToolsByCategory(category: ToolCategory): ToolInfo[] {
    return toolsByCategory.get(category) ?? [];
  }

  generateStatusReport(): string {
    const ripgrepStatus = this.ripgrepAvailable ? "Available" : "Unavailable";
    const toolCount = TOOL_MATRIX.length;
    const categories = [...toolsByCategory.keys()];

    const lines = [
      "=== Tool Selector Status ===",
      `Ripgrep: ${ripgrepStatus}`,
      `Tools registered: ${toolCount}`,
      `Categories: ${categories.join(", ")}`,
    ];

    if (!this.ripgrepAvailable) {
      const affectedTools = TOOL_MATRIX.filter(t => t.prerequisites.includes("ripgrep"));
      lines.push(`\nWARNING: ${affectedTools.length} tools require ripgrep and will fail:`);
      lines.push(affectedTools.map(t => `  - ${t.name}`).join("\n"));
      lines.push("\nInstall via: brew install ripgrep");
    }

    return lines.join("\n");
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let cachedSelector: ToolSelectorImpl | null = null;

export async function getToolSelector(): Promise<IToolSelector> {
  if (!cachedSelector) {
    cachedSelector = new ToolSelectorImpl();
    await cachedSelector.initialize();
  }
  return cachedSelector;
}

export { TOOL_MATRIX, INTENT_PATTERNS };
