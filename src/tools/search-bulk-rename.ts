/**
 * Bulk Rename Tool
 *
 * Rename multiple files using pattern matching.
 */

import { z } from "zod";
import type { ToolContext } from "./types.js";
import { validatePath } from "../validation/path-validation.js";
import { bulkRename, generateRenameReport } from "../operations/bulk-rename-operations.js";
import { PathSchema, ExcludePatternsSchema } from "../schemas/index.js";

export function registerBulkRenameTool({ factories }: ToolContext): void {
  const { destructive } = factories;

  destructive(
    "bulk_rename",
    {
      title: "Bulk Rename",
      description: "Rename multiple files using pattern matching.",
      inputSchema: {
        path: PathSchema,
        pattern: z.string().describe("Regex pattern to match filenames"),
        replacement: z.string().describe("Replacement pattern"),
        dryRun: z.boolean().optional().default(true).describe("Preview without applying"),
        recursive: z.boolean().optional().default(false).describe("Search recursively"),
        includeExtensions: z.array(z.string()).optional().describe("Only include these extensions"),
        excludePatterns: ExcludePatternsSchema,
      },
      outputSchema: {
        renamed: z.array(z.object({ from: z.string(), to: z.string() })),
        errors: z.array(z.object({ from: z.string(), to: z.string(), status: z.string(), error: z.string().optional() })),
        skipped: z.array(z.object({ from: z.string(), to: z.string(), status: z.string(), error: z.string().optional() })),
        dryRun: z.boolean(),
      },
    },
    async ({ path: dirPath, pattern, replacement, dryRun, recursive, includeExtensions, excludePatterns }) => {
      const validPath = await validatePath(dirPath);
      const { renamed, errors, skipped } = await bulkRename(validPath, {
        pattern,
        replacement,
        dryRun,
        recursive,
        includeExtensions,
        excludePatterns,
      });

      const report = generateRenameReport({ renamed, errors, skipped });
      const allRenames = renamed.map((r) => ({ from: r.from, to: r.to }));

      return {
        content: [{ type: "text" as const, text: report }],
        structuredContent: { renamed: allRenames, errors, skipped, dryRun },
      };
    }
  );
}
