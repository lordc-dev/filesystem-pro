/**
 * Find Unused Imports Tool
 *
 * Detect imports that are declared but never used in the file.
 */

import { z } from "zod";
import { PathSchema, UnusedImportSchema } from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { findUnusedImports } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerFindUnusedImportsTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_unused_imports",
    {
      title: "Find Unused Imports",
      description:
        "Detect imports that are declared but never used in the file. Useful for code cleanup and reducing bundle size.",
      inputSchema: {
        path: PathSchema.describe("Path to the source file to analyze"),
      },
      outputSchema: {
        filePath: z.string(),
        unusedImports: z.array(UnusedImportSchema),
        count: z.number(),
        totalImports: z.number().describe("Total number of imports in the file"),
      },
    },
    async ({ path: filePath }) => {
      return withFileContent(filePath, async (validPath, content, language) => {
        const unusedImports = await findUnusedImports(content, language);

        const formattedUnused = unusedImports.map((u) => ({
          source: u.import.source,
          unusedSpecifiers: u.unusedSpecifiers,
          isFullyUnused: u.isFullyUnused,
          line: u.import.location.startLine + 1,
        }));

        const textOutput =
          formattedUnused.length === 0
            ? `No unused imports found in ${filePath}`
            : `Found ${formattedUnused.length} unused import(s) in ${filePath}:\n\n` +
              formattedUnused
                .map((u) => {
                  const status = u.isFullyUnused
                    ? "fully unused"
                    : "partially unused";
                  return `  Line ${u.line}: ${u.source} (${status})\n    Unused: ${u.unusedSpecifiers.join(", ")}`;
                })
                .join("\n");

        return {
          content: [{ type: "text" as const, text: textOutput }],
          structuredContent: {
            filePath: validPath,
            unusedImports: formattedUnused,
            count: formattedUnused.length,
            totalImports: unusedImports.length + formattedUnused.length,
          },
        };
      });
    }
  );
}
