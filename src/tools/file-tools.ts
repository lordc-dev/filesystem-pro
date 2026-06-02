/**
 * File Operations Tools - Orchestrator
 *
 * This module orchestrates the registration of all file-related tools.
 * Individual tool implementations are in separate files for maintainability.
 */

import type { ToolContext } from "./types.js";
import { registerFileReadTools } from "./file-read.js";
import { registerFileWriteTools } from "./file-write.js";

/**
 * Registers all file-related tools.
 *
 * Tools registered:
 * - read_text_file: Read file as UTF-8 text
 * - read_media_file: Read image/audio as base64
 * - read_multiple_files: Read multiple files at once
 * - write_file: Create or overwrite a file
 * - edit_file: Make line-based edits with diff output
 *
 * @param context - Tool registration context providing factory methods
 */
export function registerFileTools(context: ToolContext): void {
  registerFileReadTools(context);
  registerFileWriteTools(context);
}
