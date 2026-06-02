/**
 * Get Callers Tool
 *
 * Find all locations that call a function/method (upstream call hierarchy).
 */

import { z } from "zod";
import { PathSchema, SymbolNamePathSchema, CallerInfoSchema } from "../schemas/index.js";
import { validatePath } from "../validation/path-validation.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { getCallers } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerGetCallersTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "get_callers",
    {
      title: "Get Callers",
      description:
        "Find all locations that call a function/method (upstream call hierarchy). Answers 'who calls this function?'",
      inputSchema: {
        path: PathSchema.describe(
          "Path to the file containing the symbol definition"
        ),
        namePath: SymbolNamePathSchema,
        searchPath: z
          .string()
          .optional()
          .describe(
            "Directory to search for callers (default: current directory)"
          ),
      },
      outputSchema: {
        symbolName: z.string(),
        callers: z.array(CallerInfoSchema),
        count: z.number(),
        filesCount: z.number().describe("Number of files containing callers"),
      },
    },
    async ({ path: filePath, namePath, searchPath }) => {
      const validSearchPath = searchPath
        ? await validatePath(searchPath)
        : process.cwd();

      return withFileContent(filePath, async (validPath, content) => {
        const callers = await getCallers(
          namePath,
          validPath,
          content,
          validSearchPath
        );

        // Get unique files count
        const uniqueFiles = new Set(callers.map((c) => c.filePath));

        // Format callers for output (convert to 1-indexed)
        const formattedCallers = callers.map((c) => ({
          filePath: c.filePath,
          callerSymbol: c.callerSymbol,
          location: {
            startLine: c.location.startLine + 1,
            endLine: c.location.endLine + 1,
            startColumn: c.location.startColumn,
            endColumn: c.location.endColumn,
          },
          context: c.context,
        }));

        const textOutput =
          formattedCallers.length === 0
            ? `No callers found for ${namePath}`
            : `Found ${formattedCallers.length} caller(s) of ${namePath} in ${uniqueFiles.size} file(s):\n\n` +
              formattedCallers
                .map(
                  (c) =>
                    `  ${c.filePath}:${c.location.startLine}${c.callerSymbol ? ` (in ${c.callerSymbol})` : ""}\n    ${c.context}`
                )
                .join("\n");

        return {
          content: [{ type: "text" as const, text: textOutput }],
          structuredContent: {
            symbolName: namePath,
            callers: formattedCallers,
            count: formattedCallers.length,
            filesCount: uniqueFiles.size,
          },
        };
      });
    }
  );
}
