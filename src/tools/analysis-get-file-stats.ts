/**
 * Get File Stats Tool
 *
 * Get comprehensive statistics about a source file.
 */

import { PathSchema, CodeFileStatsSchema } from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { getFileStats as getCodeFileStats } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerGetFileStatsTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "get_file_stats",
    {
      title: "Get File Stats",
      description:
        "Get comprehensive statistics about a source file including line counts (code/blank/comment), symbol counts by kind (functions, classes, etc.), import/export counts. Quick overview of file size and complexity.",
      inputSchema: {
        path: PathSchema.describe("Path to the source file to analyze"),
      },
      outputSchema: CodeFileStatsSchema.shape,
    },
    async ({ path: filePath }) => {
      return withFileContent(filePath, async (validPath, content, language) => {
        const stats = await getCodeFileStats(validPath, content, language);

        const textOutput = [
          `File: ${stats.path}`,
          `Language: ${stats.language}`,
          "",
          "Lines:",
          `  Total: ${stats.lines.total}`,
          `  Code: ${stats.lines.code}`,
          `  Blank: ${stats.lines.blank}`,
          `  Comment: ${stats.lines.comment}`,
          "",
          "Symbols:",
          `  Functions: ${stats.symbols.functions}`,
          `  Classes: ${stats.symbols.classes}`,
          `  Interfaces: ${stats.symbols.interfaces}`,
          `  Types: ${stats.symbols.types}`,
          `  Variables: ${stats.symbols.variables}`,
          `  Constants: ${stats.symbols.constants}`,
          `  Methods: ${stats.symbols.methods}`,
          `  Total: ${stats.symbols.total}`,
          "",
          `Imports: ${stats.imports.count}`,
          `Exports: ${stats.exports.count}`,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: textOutput }],
          structuredContent: { ...stats },
        };
      });
    }
  );
}
