/**
 * Count Matches Tool
 *
 * Count pattern matches in files using ripgrep.
 */

import { z } from "zod";
import type { ToolContext } from "./types.js";
import { validatePath } from "../validation/path-validation.js";
import { countMatches } from "../search/index.js";
import { jsonResponse } from "../utils/response-helpers.js";
import { PathSchema, PatternSchema, ExcludePatternsSchema } from "../schemas/index.js";

export function registerCountMatchesTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "count_matches",
    {
      title: "Count Matches",
      description: "Count pattern matches in files using ripgrep.",
      inputSchema: {
        path: PathSchema,
        pattern: PatternSchema,
        fileType: z.string().optional().describe("File type filter"),
        ignoreCase: z.boolean().optional().describe("Case insensitive search"),
        excludePatterns: ExcludePatternsSchema,
      },
      outputSchema: {
        total: z.number().describe("Total number of matches"),
        files: z.record(z.string(), z.number()).describe("Match count per file"),
      },
    },
    async ({ path: searchPath, pattern, fileType, ignoreCase, excludePatterns }) => {
      const validPath = await validatePath(searchPath);
      const counts = await countMatches(validPath, pattern, {
        fileType,
        ignoreCase,
        excludePatterns,
      });

      let total = 0;
      const files: Record<string, number> = {};
      for (const [file, count] of counts) {
        files[file] = count;
        total += count;
      }

      return jsonResponse({ total, files });
    }
  );
}
