/**
 * API Versioning
 *
 * Provides semantic version information for all MCP tools.
 * Version is derived from package.json and exposed via:
 * - Tool annotations _meta.apiVersion
 * - Server stats tool response
 * - /health HTTP endpoint
 *
 * Breaking changes follow semver:
 * - MAJOR: Tool removed, inputSchema incompatible change, outputSchema incompatible change
 * - MINOR: New tool added, new optional input field, new output field
 * - PATCH: Bug fixes, performance improvements, non-breaking changes
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require("../../package.json");

export const API_VERSION = {
  major: parseInt(PACKAGE_VERSION.split(".")[0], 10),
  minor: parseInt(PACKAGE_VERSION.split(".")[1], 10),
  patch: parseInt(PACKAGE_VERSION.split(".")[2], 10),
} as const;

export const API_VERSION_STRING = PACKAGE_VERSION;

/**
 * Tool version registry.
 * Maps tool names to their API version (independent of package version).
 * Only listed tools have a stable API contract.
 *
 * Format: { toolName: "MAJOR.MINOR" }
 * - MAJOR bump: breaking change in that tool's API
 * - MINOR bump: new optional fields or features
 */
export const TOOL_API_VERSIONS: Record<string, string> = {
  // File operations
  read_text_file: "1.1",
  read_media_file: "1.0",
  read_multiple_files: "1.0",
  write_file: "1.1",
  edit_file: "1.2",

  // Directory operations
  list_directory: "1.1",
  list_directory_with_sizes: "1.0",
  directory_tree: "1.1",
  create_directory: "1.0",
  delete_directory: "1.0",
  delete_file: "1.0",
  delete_path: "1.0",
  move_file: "1.0",

  // Search operations
  search_content: "1.1",
  search_files: "1.0",
  count_matches: "1.0",
  find_by_glob: "1.0",

  // Semantic operations
  find_symbol: "1.0",
  find_symbol_references: "1.0",
  get_callees: "1.0",
  get_callers: "1.0",
  get_file_summary: "1.0",
  get_file_stats: "1.0",
  get_symbols_overview: "1.0",
  find_unused_symbols: "1.0",
  find_unused_imports: "1.0",
  find_imports: "1.0",
  find_dependents: "1.0",
  extract_method: "1.0",
  inline_variable: "1.0",
  introduce_parameter: "1.0",
  rename_symbol: "1.0",
  replace_symbol_body: "1.0",
  insert_after_symbol: "1.0",
  insert_before_symbol: "1.0",
  find_deprecated_usages: "1.0",
  find_string_literals: "1.0",
  diff_files: "1.0",

  // Undo operations
  undo: "1.0",
  undo_peek: "1.0",
  undo_all: "1.0",
  undo_status: "1.0",

  // Watch operations
  watch_directory: "1.0",
  stop_watching: "1.0",

  // Server operations
  get_server_stats: "1.0",
  get_file_info: "1.0",
  bulk_rename: "1.0",

  // Backup operations
  backup_create: "1.0",
  backup_restore: "1.0",
  backup_batch_backup: "1.0",
};

/**
 * Get API version for a specific tool.
 */
export function getToolApiVersion(toolName: string): string | undefined {
  return TOOL_API_VERSIONS[toolName];
}