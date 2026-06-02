/**
 * Get Callees Tool
 *
 * Find all functions/methods called within a function's body (downstream call hierarchy).
 */

import { z } from "zod";
import { PathSchema, SymbolNamePathSchema, CalleeInfoSchema } from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { getCallees } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerGetCalleesTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "get_callees",
    {
      title: "Get Callees",
      description:
        "Find all functions/methods called within a function's body (downstream call hierarchy). Answers 'what does this function call?'",
      inputSchema: {
        path: PathSchema.describe("Path to the file containing the function"),
        namePath: SymbolNamePathSchema,
      },
      outputSchema: {
        symbolName: z.string(),
        callees: z.array(CalleeInfoSchema),
        count: z.number(),
        methodCalls: z.number().describe("Number of method calls (obj.method())"),
        functionCalls: z.number().describe("Number of direct function calls"),
      },
    },
    async ({ path: filePath, namePath }) => {
      return withFileContent(filePath, async (validPath, content, language) => {
        const callees = await getCallees(content, language, namePath);

        // Count method vs function calls
        const methodCalls = callees.filter((c) => c.isMethodCall).length;
        const functionCalls = callees.length - methodCalls;

        // Format callees for output (convert to 1-indexed)
        const formattedCallees = callees.map((c) => ({
          name: c.name,
          location: {
            startLine: c.location.startLine + 1,
            endLine: c.location.endLine + 1,
            startColumn: c.location.startColumn,
            endColumn: c.location.endColumn,
          },
          isMethodCall: c.isMethodCall,
          receiver: c.receiver,
        }));

        const textOutput =
          formattedCallees.length === 0
            ? `No function calls found in ${namePath}`
            : `Found ${formattedCallees.length} function call(s) in ${namePath} (${functionCalls} direct, ${methodCalls} method):\n\n` +
              formattedCallees
                .map(
                  (c) =>
                    `  Line ${c.location.startLine}: ${c.isMethodCall ? `${c.receiver}.${c.name}()` : `${c.name}()`}`
                )
                .join("\n");

        return {
          content: [{ type: "text" as const, text: textOutput }],
          structuredContent: {
            symbolName: namePath,
            callees: formattedCallees,
            count: formattedCallees.length,
            methodCalls,
            functionCalls,
          },
        };
      });
    }
  );
}
