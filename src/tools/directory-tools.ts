/**
 * Directory Operations Tools - Orchestrator
 *
 * This module orchestrates the registration of all directory-related tools.
 * Individual tool implementations are in separate files for maintainability.
 */

import type { ToolContext } from "./types.js";
import { registerCreateDirectoryTool } from "./directory-create.js";
import { registerListDirectoryTools } from "./directory-list.js";
import { registerMoveFileTool } from "./directory-move.js";
import { registerDeleteTools } from "./directory-delete.js";
import { registerGetFileInfoTool } from "./directory-get-info.js";
import { registerListAllowedDirectoriesTool } from "./directory-allowed.js";
import { registerWatchTools } from "./directory-watch.js";

/**
 * Registers all directory-related tools.
 *
 * Tools registered:
 * - create_directory: Create directories (including nested)
 * - list_directory: List directory contents
 * - list_directory_with_sizes: List with size information
 * - directory_tree: Recursive tree view
 * - move_file: Move or rename files/directories
 * - delete_file: Delete a file
 * - delete_directory: Delete a directory
 * - delete_path: Delete file or directory (auto-detect)
 * - get_file_info: Get file metadata
 * - list_allowed_directories: Show MCP roots
 * - watch_directory: Watch for changes
 * - stop_watching: Stop a watcher
 *
 * @param context - Tool registration context providing factory methods
 */
export function registerDirectoryTools(context: ToolContext): void {
  registerCreateDirectoryTool(context);
  registerListDirectoryTools(context);
  registerMoveFileTool(context);
  registerDeleteTools(context);
  registerGetFileInfoTool(context);
  registerListAllowedDirectoriesTool(context);
  registerWatchTools(context);
}
