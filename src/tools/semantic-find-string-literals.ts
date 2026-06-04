/**
 * Find String Literals Tool
 *
 * Find string literals in source code matching a pattern.
 */

import fs from "fs/promises";
import { z } from "zod";
import { PathSchema } from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { findStringLiterals, getLanguageFromPath } from "../semantic/index.js";
import type { SupportedLanguage } from "../semantic/index.js";
import { validatePath } from "../validation/path-validation.js";
import { FILE_ENCODING } from "../constants.js";
import type { ToolContext } from "./types.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".kt", ".java", ".go", ".rs",
  ".c", ".cpp", ".h", ".hpp", ".rb", ".swift", ".dart",
]);

export function registerFindStringLiteralsTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_string_literals",
    {
      title: "Find String Literals",
      description:
        "Find string literals in source code matching a pattern. Useful for finding tool names, config keys, and other string values that aren't code symbols.",
      inputSchema: {
        path: PathSchema,
        pattern: z
          .string()
          .describe("Pattern to search for (substring match by default)"),
        exactMatch: z
          .boolean()
          .optional()
          .default(false)
          .describe("Use exact matching instead of substring"),
        ignoreCase: z
          .boolean()
          .optional()
          .default(false)
          .describe("Case-insensitive matching"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return"),
      },
      outputSchema: {
        matches: z.array(
          z.object({
            value: z.string().describe("The string value without quotes"),
            rawText: z.string().describe("The raw text including quotes"),
            location: z.object({
              startLine: z.number(),
              endLine: z.number(),
              startColumn: z.number(),
              endColumn: z.number(),
            }),
            parentType: z.string().describe("Parent AST node type for context"),
            grandparentType: z
              .string()
              .optional()
              .describe("Grandparent AST node type"),
          })
        ),
        count: z.number(),
      },
    },
    async ({ path: filePath, pattern, exactMatch, ignoreCase, maxResults }) => {
      const allMatches: Array<{
        value: string;
        rawText: string;
        location: { startLine: number; endLine: number; startColumn: number; endColumn: number };
        parentType: string;
        grandparentType?: string;
      }> = [];

      const processFile = async (validPath: string, content: string, language: SupportedLanguage) => {
        const results = await findStringLiterals(
          { content, language },
          pattern,
          { exactMatch, ignoreCase, maxResults: maxResults ? maxResults - allMatches.length : undefined }
        );

        for (const r of results) {
          allMatches.push({
            value: r.value,
            rawText: r.rawText,
            location: {
              startLine: r.location.startLine + 1,
              endLine: r.location.endLine + 1,
              startColumn: r.location.startColumn,
              endColumn: r.location.endColumn,
            },
            parentType: r.parentType,
            grandparentType: r.grandparentType,
          });
        }
      };

      const validPath = await validatePath(filePath);
      const stat = await fs.stat(validPath);

      if (stat.isDirectory()) {
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        for (const entry of entries) {
          if (maxResults && allMatches.length >= maxResults) break;
          if (entry.isFile()) {
            const ext = entry.name.substring(entry.name.lastIndexOf("."));
            if (SUPPORTED_EXTENSIONS.has(ext)) {
              const subPath = `${validPath}/${entry.name}`;
              const subLang = getLanguageFromPath(subPath);
              if (!subLang) continue;
              const subContent = await fs.readFile(subPath, FILE_ENCODING);
              await processFile(subPath, subContent, subLang);
            }
          }
        }
      } else {
        await withFileContent(filePath, processFile);
      }

      const textOutput =
        allMatches.length === 0
          ? `No string literals matching "${pattern}" found`
          : allMatches
              .map(
                (m) =>
                  `${m.value} (line ${m.location.startLine}, parent: ${m.parentType})`
              )
              .join("\n");

      return {
        content: [{ type: "text" as const, text: textOutput }],
        structuredContent: { matches: allMatches, count: allMatches.length },
      };
    }
  );
}