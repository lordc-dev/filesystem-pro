/**
 * Diff Files Tool
 *
 * Compare two files and show differences.
 */

import { z } from "zod";
import type { ToolContext } from "./types.js";
import { validatePath } from "../validation/path-validation.js";
import { diffFiles } from "../operations/diff-operations.js";
import { diffResponse } from "../utils/response-helpers.js";

export function registerDiffFilesTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "diff_files",
    {
      title: "Diff Files",
      description: "Compare two files and show differences.",
      inputSchema: {
        file1: z.string().describe("Path to the first file"),
        file2: z.string().describe("Path to the second file"),
        context: z.number().optional().default(3).describe("Context lines"),
        format: z.enum(["unified", "side-by-side", "inline"]).optional().default("unified").describe("Diff format"),
        ignoreWhitespace: z.boolean().optional().default(false).describe("Ignore whitespace differences"),
      },
      outputSchema: {
        diff: z.string().describe("Diff output"),
        identical: z.boolean().describe("Whether files are identical"),
      },
    },
    async ({ file1, file2, context, format, ignoreWhitespace }) => {
      const validPath1 = await validatePath(file1);
      const validPath2 = await validatePath(file2);
      const diff = await diffFiles(validPath1, validPath2, {
        context,
        format,
        ignoreWhitespace,
      });
      return diffResponse(diff);
    }
  );
}
