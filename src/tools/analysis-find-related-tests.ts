/**
 * Find Related Tests Tool
 *
 * Find test files associated with a source file using common naming conventions.
 */

import { z } from "zod";
import { PathSchema, RelatedTestFileSchema } from "../schemas/index.js";
import { validatePath } from "../validation/path-validation.js";
import { findRelatedTests } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerFindRelatedTestsTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_related_tests",
    {
      title: "Find Related Tests",
      description:
        "Find test files associated with a source file using common naming conventions (*.test.*, *.spec.*, __tests__/*, test_*.py, *_test.py).",
      inputSchema: {
        path: PathSchema.describe("Path to the source file"),
        searchPath: z
          .string()
          .optional()
          .describe(
            "Directory to search for tests (default: current directory)"
          ),
      },
      outputSchema: {
        filePath: z.string(),
        testFiles: z.array(RelatedTestFileSchema),
        count: z.number(),
      },
    },
    async ({ path: filePath, searchPath }) => {
      const validPath = await validatePath(filePath);
      const validSearchPath = searchPath
        ? await validatePath(searchPath)
        : process.cwd();

      const testFiles = await findRelatedTests(validPath, validSearchPath);

      const textOutput =
        testFiles.length === 0
          ? `No test files found for ${filePath}`
          : `Found ${testFiles.length} test file(s) for ${filePath}:\n\n` +
            testFiles.map((t) => `  [${t.patternType}] ${t.filePath}`).join("\n");

      return {
        content: [{ type: "text" as const, text: textOutput }],
        structuredContent: {
          filePath: validPath,
          testFiles,
          count: testFiles.length,
        },
      };
    }
  );
}
