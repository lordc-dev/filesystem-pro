/**
 * Find Deprecated Usages Tool
 *
 * Detect usages of deprecated symbols across the codebase.
 * Works like VSCode's deprecated linting - shows where deprecated APIs are being used.
 */

import { z } from "zod";
import { PathSchema } from "../schemas/index.js";
import { validatePath } from "../validation/path-validation.js";
import { DEFAULT_MAX_DEPRECATED_FILES } from "../constants.js";
import {
  findDeprecatedUsages,
  formatDeprecatedUsagesReport,
} from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerFindDeprecatedUsagesTool({
  factories,
}: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_deprecated_usages",
    {
      title: "Find Deprecated Usages",
      description:
        "Detect usages of deprecated symbols across the codebase. Works like VSCode's deprecated linting - finds where @deprecated APIs are being called, not just where they are declared.",
      inputSchema: {
        path: PathSchema.describe("Directory to search for deprecated usages"),
        includeDefinitions: z
          .boolean()
          .optional()
          .describe("Include the deprecated declarations themselves in results"),
        maxFiles: z
          .number()
          .optional()
          .describe(`Maximum files to scan (default: ${DEFAULT_MAX_DEPRECATED_FILES})`),
      },
      outputSchema: {
        deprecatedSymbolCount: z.number(),
        usageCount: z.number(),
        filesWithUsages: z.number(),
        filesScanned: z.number(),
        deprecatedSymbols: z.array(
          z.object({
            name: z.string(),
            namePath: z.string(),
            definitionFile: z.string(),
            definitionLine: z.number(),
            deprecationReason: z.string().optional(),
            usageCount: z.number(),
          })
        ),
        usages: z.array(
          z.object({
            symbolName: z.string(),
            file: z.string(),
            line: z.number(),
            column: z.number(),
            context: z.string().optional(),
            referenceType: z.string().optional(),
          })
        ),
      },
    },
    async ({ path, includeDefinitions, maxFiles }) => {
      const validPath = await validatePath(path);

      const report = await findDeprecatedUsages(validPath, {
        includeDefinitions: includeDefinitions ?? false,
        maxFiles: maxFiles ?? DEFAULT_MAX_DEPRECATED_FILES,
      });

      // Group usages by deprecated symbol for summary
      const usageCountBySymbol = new Map<string, number>();
      for (const usage of report.usages) {
        const key = usage.symbol.namePath;
        usageCountBySymbol.set(key, (usageCountBySymbol.get(key) ?? 0) + 1);
      }

      const deprecatedSymbols = report.deprecatedSymbols.map((s) => ({
        name: s.name,
        namePath: s.namePath,
        definitionFile: s.definitionFile,
        definitionLine: s.definitionLocation.startLine + 1,
        deprecationReason: s.deprecationReason,
        usageCount: usageCountBySymbol.get(s.namePath) ?? 0,
      }));

      const usages = report.usages.map((u) => ({
        symbolName: u.symbol.namePath,
        file: u.reference.filePath,
        line: u.reference.location.startLine + 1,
        column: u.reference.location.startColumn + 1,
        context: u.reference.context,
        referenceType: u.reference.referenceType,
      }));

      // Format text output similar to VSCode problems panel
      const textOutput = formatDeprecatedUsagesReport(report);

      return {
        content: [{ type: "text" as const, text: textOutput }],
        structuredContent: {
          deprecatedSymbolCount: report.deprecatedSymbols.length,
          usageCount: report.totalUsageCount,
          filesWithUsages: report.usagesByFile.size,
          filesScanned: report.filesScanned,
          deprecatedSymbols,
          usages,
        },
      };
    }
  );
}
