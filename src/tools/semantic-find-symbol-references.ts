/**
 * Find Symbol References Tool
 *
 * Find all references to a symbol across the codebase.
 */

import { z } from "zod";
import {
  PathSchema,
  SymbolNamePathSchema,
  ReferenceTypeSchema,
} from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { validatePath } from "../validation/path-validation.js";
import { findReferencesFromDefinition } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerFindSymbolReferencesTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_symbol_references",
    {
      title: "Find Symbol References",
      description:
        "Find all references to a symbol across the codebase. Now includes reference type classification (call, import, type, etc.) and call count.",
      inputSchema: {
        path: PathSchema.describe(
          "Path to the file containing the symbol definition"
        ),
        namePath: SymbolNamePathSchema,
        searchPath: z
          .string()
          .optional()
          .describe(
            "Directory to search for references (default: current directory)"
          ),
        includeDefinition: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include the definition in results"),
      },
      outputSchema: {
        symbolName: z.string(),
        references: z.array(
          z.object({
            filePath: z.string(),
            line: z.number(),
            column: z.number(),
            context: z.string().optional(),
            isDefinition: z.boolean(),
            referenceType: ReferenceTypeSchema.optional().describe(
              "Type of reference (call, import, type, etc.)"
            ),
          })
        ),
        totalCount: z.number(),
        callCount: z
          .number()
          .describe(
            "Number of actual function/method calls (most useful metric)"
          ),
        countsByType: z
          .object({
            call: z.number(),
            import: z.number(),
            export: z.number(),
            type: z.number(),
            new: z.number(),
            assignment: z.number(),
            property: z.number(),
            argument: z.number(),
            return: z.number(),
            declaration: z.number(),
            extends: z.number(),
            implements: z.number(),
            decorator: z.number(),
            jsx: z.number(),
            unknown: z.number(),
          })
          .describe("Breakdown of references by type"),
        filesCount: z.number(),
      },
    },
    async ({ path: filePath, namePath, searchPath, includeDefinition }) => {
      const validSearchPath = searchPath
        ? await validatePath(searchPath)
        : process.cwd();

      return withFileContent(filePath, async (validPath, content) => {
        const result = await findReferencesFromDefinition(
          validPath,
          content,
          namePath,
          validSearchPath,
          { includeDefinition }
        );

        const references = result.references.map((r) => ({
          filePath: r.filePath,
          line: r.location.startLine + 1,
          column: r.location.startColumn,
          context: r.context,
          isDefinition: r.isDefinition,
          referenceType: r.referenceType,
        }));

        const summaryLines = [
          `Symbol: ${result.symbolName}`,
          `Total references: ${result.totalCount}`,
          `Function calls: ${result.callCount}`,
          `Files: ${result.filesWithReferences.length}`,
          "",
          "Breakdown by type:",
          ...Object.entries(result.countsByType)
            .filter(([, count]) => count > 0)
            .map(([type, count]) => `  ${type}: ${count}`),
        ];

        const refLines = references.map(
          (r) =>
            `  ${r.filePath}:${r.line}:${r.column} [${r.referenceType ?? "unknown"}] ${r.context ?? ""}`
        );

        const textOutput = [
          ...summaryLines,
          "",
          "References:",
          ...refLines,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: textOutput }],
          structuredContent: {
            symbolName: result.symbolName,
            references,
            totalCount: result.totalCount,
            callCount: result.callCount,
            countsByType: result.countsByType,
            filesCount: result.filesWithReferences.length,
          },
        };
      });
    }
  );
}
