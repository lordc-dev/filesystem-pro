/**
 * Semantic Code Analysis Tools
 *
 * Tools for analyzing code structure using Tree-sitter:
 * - get_symbols_overview: List symbols in a file
 * - find_symbol: Find symbols by pattern
 * - find_string_literals: Find string literals
 * - find_symbol_references: Find all references to a symbol
 * - find_unused_symbols: Dead code detection
 * - find_deprecated_usages: Find usages of deprecated APIs
 */

import type { ToolContext } from "./types.js";
import { registerGetSymbolsOverviewTool } from "./semantic-get-symbols-overview.js";
import { registerFindSymbolTool } from "./semantic-find-symbol.js";
import { registerFindStringLiteralsTool } from "./semantic-find-string-literals.js";
import { registerFindSymbolReferencesTool } from "./semantic-find-symbol-references.js";
import { registerFindUnusedSymbolsTool } from "./semantic-find-unused-symbols.js";
import { registerFindDeprecatedUsagesTool } from "./semantic-find-deprecated-usages.js";

/**
 * Registers all semantic code analysis tools.
 *
 * Tools registered:
 * - get_symbols_overview: List symbols in a file with kinds and locations
 * - find_symbol: Find symbols by name pattern with wildcard support
 * - find_string_literals: Find string literals matching a pattern
 * - find_symbol_references: Find all references to a symbol across the codebase
 * - find_unused_symbols: Dead code detection for unused exported symbols
 * - find_deprecated_usages: Detect usages of @deprecated APIs across the codebase
 *
 * @param context - Tool registration context providing factory methods
 */
export function registerSemanticTools(context: ToolContext): void {
  registerGetSymbolsOverviewTool(context);
  registerFindSymbolTool(context);
  registerFindStringLiteralsTool(context);
  registerFindSymbolReferencesTool(context);
  registerFindUnusedSymbolsTool(context);
  registerFindDeprecatedUsagesTool(context);
}
