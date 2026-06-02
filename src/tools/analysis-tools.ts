/**
 * Code Analysis Tools
 *
 * Tools for analyzing code relationships and statistics:
 * - find_imports: Extract imports from a file
 * - find_dependents: Find files that import a given file
 * - find_related_tests: Find test files for a source file
 * - find_unused_imports: Detect unused imports
 * - get_callers: Find callers of a function
 * - get_callees: Find functions called by a function
 * - get_file_stats: Get file statistics
 * - get_file_summary: Get comprehensive file summary
 */

import type { ToolContext } from "./types.js";
import { registerFindImportsTool } from "./analysis-find-imports.js";
import { registerFindDependentsTool } from "./analysis-find-dependents.js";
import { registerFindRelatedTestsTool } from "./analysis-find-related-tests.js";
import { registerFindUnusedImportsTool } from "./analysis-find-unused-imports.js";
import { registerGetCallersTool } from "./analysis-get-callers.js";
import { registerGetCalleesTool } from "./analysis-get-callees.js";
import { registerGetFileStatsTool } from "./analysis-get-file-stats.js";
import { registerGetFileSummaryTool } from "./analysis-get-file-summary.js";

/**
 * Registers all code analysis tools.
 *
 * Tools registered:
 * - find_imports: Extract imports from a source file with details
 * - find_dependents: Find files that import a given file (reverse dependency lookup)
 * - find_related_tests: Find test files for a source file using naming conventions
 * - find_unused_imports: Detect imports declared but never used
 * - get_callers: Find callers of a function (upstream call hierarchy)
 * - get_callees: Find functions called within a function (downstream call hierarchy)
 * - get_file_stats: Get file statistics (line counts, symbol counts, imports/exports)
 * - get_file_summary: Get comprehensive human-readable file summary
 *
 * @param context - Tool registration context providing factory methods
 */
export function registerAnalysisTools(context: ToolContext): void {
  registerFindImportsTool(context);
  registerFindDependentsTool(context);
  registerFindRelatedTestsTool(context);
  registerFindUnusedImportsTool(context);
  registerGetCallersTool(context);
  registerGetCalleesTool(context);
  registerGetFileStatsTool(context);
  registerGetFileSummaryTool(context);
}
