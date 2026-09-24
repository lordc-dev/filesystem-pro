/**
 * Analyze Symbol Tool
 *
 * Batch symbol analysis: references + callers + callees in ONE call.
 * Replaces the 3-call pattern (find_symbol_references + get_callers +
 * get_callees) when assessing impact of changing a symbol.
 */

import { z } from "zod";
import { PathSchema, SymbolNamePathSchema, ReferenceTypeSchema, CallerInfoSchema, CalleeInfoSchema } from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { validatePath } from "../validation/path-validation.js";
import { findReferencesFromDefinition, getCallers, getCallees } from "../semantic/index.js";
import type { ToolContext } from "./types.js";

export function registerAnalyzeSymbolTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "analyze_symbol",
    {
      title: "Analyze Symbol",
      description:
        "Full impact analysis of a symbol in ONE call: references (with type classification), " +
        "callers (who calls it), and callees (what it calls). Use this before refactoring " +
        "instead of calling find_symbol_references + get_callers + get_callees separately.",
      inputSchema: {
        path: PathSchema.describe("Path to the file containing the symbol definition"),
        namePath: SymbolNamePathSchema,
        searchPath: z.string().optional().describe("Directory to search (default: current directory)"),
        includeDefinition: z.boolean().optional().default(true).describe("Include the definition in references"),
      },
      outputSchema: {
        symbolName: z.string(),
        references: z.array(
          z.object({
            filePath: z.string(),
            line: z.number(),
            referenceType: ReferenceTypeSchema.optional(),
            isDefinition: z.boolean(),
          })
        ),
        totalCount: z.number(),
        callCount: z.number(),
        callers: z.array(CallerInfoSchema),
        callees: z.array(CalleeInfoSchema),
        filesCount: z.number(),
      },
    },
    async ({ path: filePath, namePath, searchPath, includeDefinition }) => {
      const validSearchPath = searchPath
        ? await validatePath(searchPath)
        : process.cwd();

      return withFileContent(filePath, async (validPath, content, language) => {
        // Run all three analyses in parallel
        const [refResult, callers, callees] = await Promise.all([
          findReferencesFromDefinition(validPath, content, namePath, validSearchPath, { includeDefinition }),
          getCallers(namePath, validPath, content, validSearchPath).catch(() => []),
          getCallees(content, language, namePath).catch(() => []),
        ]);

        const references = refResult.references.map((r) => ({
          filePath: r.filePath,
          line: r.location.startLine + 1,
          referenceType: r.referenceType,
          isDefinition: r.isDefinition,
        }));

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

        const textOutput = [
          `Symbol: ${refResult.symbolName}`,
          `References: ${refResult.totalCount} (${refResult.callCount} calls) in ${refResult.filesWithReferences.length} file(s)`,
          `Callers: ${formattedCallers.length}`,
          `Callees: ${formattedCallees.length}`,
          "",
          "Callers:",
          ...formattedCallers.map((c) => `  ${c.filePath}:${c.location.startLine}${c.callerSymbol ? ` (in ${c.callerSymbol})` : ""}`),
          "",
          "Callees:",
          ...formattedCallees.map((c) => `  ${c.isMethodCall ? `${c.receiver}.${c.name}()` : `${c.name}()`}`),
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: textOutput }],
          structuredContent: {
            symbolName: refResult.symbolName,
            references,
            totalCount: refResult.totalCount,
            callCount: refResult.callCount,
            callers: formattedCallers,
            callees: formattedCallees,
            filesCount: refResult.filesWithReferences.length,
          },
        };
      });
    }
  );
}