/**
 * Search Operations Tools - Orchestrator
 *
 * This module orchestrates the registration of all search-related tools.
 * Individual tool implementations are in separate files for maintainability.
 */

import type { ToolContext } from "./types.js";
import { registerSearchFilesTool } from "./search-files.js";
import { registerFindByGlobTool } from "./search-glob.js";
import { registerSearchContentTool } from "./search-content.js";
import { registerCountMatchesTool } from "./search-count.js";
import { registerDiffFilesTool } from "./search-diff.js";
import { registerBulkRenameTool } from "./search-bulk-rename.js";
import { registerGetProjectPatternsTool } from "./search-patterns.js";

/**
 * Registers all search-related tools.
 *
 * Tools registered:
 * - search_files: Search for files by name pattern
 * - find_by_glob: Find files using glob patterns
 * - search_content: Search file contents with regex
 * - count_matches: Count pattern matches in files
 * - diff_files: Compare two files
 * - bulk_rename: Rename multiple files by pattern
 * - get_project_patterns: Get patterns from AGENTS.md
 *
 * @param context - Tool registration context providing factory methods
 */
export function registerSearchTools(context: ToolContext): void {
  registerSearchFilesTool(context);
  registerFindByGlobTool(context);
  registerSearchContentTool(context);
  registerCountMatchesTool(context);
  registerDiffFilesTool(context);
  registerBulkRenameTool(context);
  registerGetProjectPatternsTool(context);
}
