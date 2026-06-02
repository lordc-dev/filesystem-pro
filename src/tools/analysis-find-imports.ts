/**
 * Find Imports Tool
 *
 * Extract all imports from a source file with their details.
 */

import { z } from "zod";
import { PathSchema, ImportInfoSchema } from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { extractImports } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerFindImportsTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_imports",
    {
      title: "Find Imports",
      description:
        "Extract all imports from a source file with their details (source module, specifiers, import type). Supports TypeScript, JavaScript, and Python.",
      inputSchema: {
        path: PathSchema.describe("Path to the source file to analyze"),
      },
      outputSchema: {
        filePath: z.string(),
        language: z.string(),
        imports: z.array(ImportInfoSchema),
        count: z.number(),
        summary: z.object({
          default: z.number().describe("Number of default imports"),
          named: z.number().describe("Number of named imports"),
          namespace: z.number().describe("Number of namespace imports"),
          sideEffect: z.number().describe("Number of side-effect imports"),
          typeOnly: z.number().describe("Number of type-only imports"),
        }),
      },
    },
    async ({ path: filePath }) => {
      return withFileContent(filePath, async (validPath, content, language) => {
        const result = await extractImports(content, language);

        const formattedImports = result.imports.map((imp) => ({
          source: imp.source,
          specifiers: imp.specifiers,
          isDefault: imp.isDefault,
          isNamespace: imp.isNamespace,
          isTypeOnly: imp.isTypeOnly,
          isSideEffect: imp.isSideEffect,
          location: {
            startLine: imp.location.startLine + 1,
            endLine: imp.location.endLine + 1,
          },
          rawText: imp.rawText,
        }));

        const textOutput =
          formattedImports.length === 0
            ? `No imports found in ${filePath}`
            : `Found ${formattedImports.length} import(s) in ${filePath}:\n\n` +
              formattedImports
                .map((imp) => {
                  const type = imp.isDefault
                    ? "default"
                    : imp.isNamespace
                      ? "namespace"
                      : imp.isSideEffect
                        ? "side-effect"
                        : imp.isTypeOnly
                          ? "type-only"
                          : "named";
                  const specs =
                    imp.specifiers.length > 0
                      ? ` { ${imp.specifiers.map((s) => (s.alias ? `${s.name} as ${s.alias}` : s.name)).join(", ")} }`
                      : "";
                  return `  [${type}] ${imp.source}${specs}`;
                })
                .join("\n");

        return {
          content: [{ type: "text" as const, text: textOutput }],
          structuredContent: {
            filePath: validPath,
            language,
            imports: formattedImports,
            count: result.count,
            summary: result.summary,
          },
        };
      });
    }
  );
}
