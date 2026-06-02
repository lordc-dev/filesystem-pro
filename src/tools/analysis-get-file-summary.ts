/**
 * Get File Summary Tool
 *
 * Get a comprehensive human-readable summary of a source file.
 */

import { z } from "zod";
import { PathSchema, CodeFileStatsSchema } from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { getFileStats as getCodeFileStats, getFileSummary } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerGetFileSummaryTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "get_file_summary",
    {
      title: "Get File Summary",
      description:
        "Get a comprehensive human-readable summary of a source file including stats, structure overview, and key exports. One-stop tool for quickly understanding any source file.",
      inputSchema: {
        path: PathSchema.describe("Path to the source file to summarize"),
      },
      outputSchema: {
        summary: z.string().describe("Human-readable file summary"),
        stats: CodeFileStatsSchema,
        keyExports: z.array(z.string()).describe("List of exported symbol names"),
      },
    },
    async ({ path: filePath }) => {
      return withFileContent(filePath, async (validPath, content, language) => {
        const stats = await getCodeFileStats(validPath, content, language);
        const summary = getFileSummary(stats);

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: {
            summary,
            stats: { ...stats },
            keyExports: stats.exports.names,
          },
        };
      });
    }
  );
}
