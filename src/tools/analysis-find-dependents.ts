/**
 * Find Dependents Tool
 *
 * Find all files that import a given file (reverse dependency lookup).
 */

import { z } from "zod";
import { PathSchema, DependentFileSchema } from "../schemas/index.js";
import { validatePath } from "../validation/path-validation.js";
import { findDependents } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerFindDependentsTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_dependents",
    {
      title: "Find Dependents",
      description:
        "Find all files that import a given file (reverse dependency lookup). Useful for understanding impact of changes.",
      inputSchema: {
        path: PathSchema.describe("Path to the file to find dependents of"),
        searchPath: z
          .string()
          .optional()
          .describe(
            "Directory to search for dependents (default: current directory)"
          ),
      },
      outputSchema: {
        filePath: z.string(),
        dependents: z.array(DependentFileSchema),
        count: z.number(),
      },
    },
    async ({ path: filePath, searchPath }) => {
      const validPath = await validatePath(filePath);
      const validSearchPath = searchPath
        ? await validatePath(searchPath)
        : process.cwd();

      const dependents = await findDependents(validPath, validSearchPath);

      const textOutput =
        dependents.length === 0
          ? `No files found that import ${filePath}`
          : `Found ${dependents.length} file(s) that import ${filePath}:\n\n` +
            dependents
              .map((d) => `  ${d.filePath}:${d.line} - ${d.importStatement}`)
              .join("\n");

      return {
        content: [{ type: "text" as const, text: textOutput }],
        structuredContent: {
          filePath: validPath,
          dependents,
          count: dependents.length,
        },
      };
    }
  );
}
