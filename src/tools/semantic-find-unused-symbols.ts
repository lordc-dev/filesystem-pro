/**
 * Find Unused Symbols Tool
 *
 * Find exported symbols that have no references across the codebase (dead code detection).
 */

import { z } from "zod";
import { PathSchema } from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { validatePath } from "../validation/path-validation.js";
import { findUnusedSymbols, SymbolKindNames } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerFindUnusedSymbolsTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_unused_symbols",
    {
      title: "Find Unused Symbols",
      description:
        "Find exported symbols that have no references across the codebase (dead code detection). Useful for identifying unused functions, classes, and exports.",
      inputSchema: {
        path: PathSchema.describe(
          "Path to the file to analyze for unused exports"
        ),
        searchPath: z
          .string()
          .optional()
          .describe(
            "Directory to search for references (default: current directory)"
          ),
      },
      outputSchema: {
        filePath: z.string(),
        unusedSymbols: z.array(
          z.object({
            name: z.string(),
            namePath: z.string(),
            kind: z.string(),
            location: z.object({
              startLine: z.number(),
              endLine: z.number(),
            }),
          })
        ),
        count: z.number(),
        analyzedExports: z
          .number()
          .describe("Total number of exported symbols analyzed"),
      },
    },
    async ({ path: filePath, searchPath }) => {
      const validSearchPath = searchPath
        ? await validatePath(searchPath)
        : process.cwd();

      return withFileContent(filePath, async (validPath, content) => {
        const unusedSymbols = await findUnusedSymbols(
          validPath,
          content,
          validSearchPath
        );

        const formattedSymbols = unusedSymbols.map((s) => ({
          name: s.name,
          namePath: s.namePath,
          kind: SymbolKindNames[s.kind] || "Unknown",
          location: {
            startLine: s.location.startLine + 1,
            endLine: s.location.endLine + 1,
          },
        }));

        const textOutput =
          formattedSymbols.length === 0
            ? `No unused exported symbols found in ${filePath}`
            : `Found ${formattedSymbols.length} unused exported symbol(s) in ${filePath}:\n\n` +
              formattedSymbols
                .map(
                  (s) =>
                    `  ${s.kind} ${s.name} (lines ${s.location.startLine}-${s.location.endLine})`
                )
                .join("\n");

        return {
          content: [{ type: "text" as const, text: textOutput }],
          structuredContent: {
            filePath: validPath,
            unusedSymbols: formattedSymbols,
            count: formattedSymbols.length,
            analyzedExports: unusedSymbols.length + formattedSymbols.length,
          },
        };
      });
    }
  );
}
