/**
 * Find Symbol Tool
 *
 * Find a symbol by name pattern.
 */

import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import {
  PathSchema,
  IncludeBodySchema,
  SymbolKindSchema,
} from "../schemas/index.js";
import { withFileContent, readValidatedFile } from "../file-operations/read-utils.js";
import { findSymbols, SymbolKind, SymbolKindNames, getLanguageFromPath } from "../semantic/index.js";
import { symbolMatchesResponse } from "../utils/response-helpers.js";
import { DEFAULT_EXCLUDE_DIRS } from "../constants.js";
import type { ToolContext } from "./types.js";

export function registerFindSymbolTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_symbol",
    {
      title: "Find Symbol",
      description:
        "Find a symbol by name pattern. Supports patterns like 'MyClass', 'MyClass/myMethod', or wildcards like 'User*'.",
      inputSchema: {
        path: PathSchema,
        pattern: z
          .string()
          .describe(
            "Symbol name or path pattern (e.g., 'MyClass', 'MyClass/method', 'User*')"
          ),
        includeBody: IncludeBodySchema,
        kinds: z
          .array(SymbolKindSchema)
          .optional()
          .describe("Filter by symbol kinds"),
        depth: z.number().optional().describe("Maximum depth to search"),
      },
      outputSchema: {
        matches: z.array(
          z.object({
            namePath: z.string(),
            kind: z.string(),
            location: z.object({
              startLine: z.number(),
              endLine: z.number(),
            }),
            body: z.string().optional(),
          })
        ),
        count: z.number(),
      },
    },
    async ({ path: filePath, pattern, includeBody, kinds, depth }) => {
      const kindValues = kinds?.map(
        (k) => SymbolKind[k as keyof typeof SymbolKind]
      );

      // Check if path is a directory
      let isDir = false;
      let validPath: string;
      try {
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          isDir = true;
          validPath = filePath;
        } else {
          validPath = stat.isFile() ? filePath : filePath;
        }
      } catch {
        // Path doesn't exist as-is; fall through to file validation
        validPath = filePath;
      }

      if (!isDir) {
        // Validate as file path
        const { validPath: vp } = await readValidatedFile(filePath);
        validPath = vp;
        // Re-check if validated path is a directory
        try {
          const stat = await fs.stat(validPath);
          isDir = stat.isDirectory();
        } catch { /* not a dir */ }
      }

      if (isDir) {
        // Directory mode: find all source files and search each
        const { globSearch } = await import("../search/index.js");
        const extensions = [
          ".ts", ".tsx", ".js", ".jsx", ".py", ".kt", ".java",
          ".go", ".rs", ".c", ".cpp", ".h", ".hpp",
        ];
        const patterns = extensions.map((ext) => `**/*${ext}`);
        const globResults = await Promise.all(
          patterns.map((pat) =>
            globSearch(pat, {
              cwd: validPath,
              ignore: DEFAULT_EXCLUDE_DIRS,
              onlyFiles: true,
              absolute: true,
            }).catch(() => [])
          )
        );
        const allFiles = [...new Set(globResults.flat())];

        const allMatches: Array<{
          namePath: string;
          kind: string;
          location: { startLine: number; endLine: number };
          body?: string;
          filePath: string;
        }> = [];

        for (const file of allFiles) {
          const lang = getLanguageFromPath(file);
          if (!lang) continue;
          try {
            const { content } = await readValidatedFile(file);
            const results = await findSymbols({ content, language: lang }, pattern, {
              includeBody,
              kinds: kindValues,
              depth,
              exactMatch: false,
            });
            for (const r of results) {
              allMatches.push({
                namePath: r.symbol.namePath,
                kind: SymbolKindNames[r.symbol.kind] || "Unknown",
                location: {
                  startLine: r.symbol.location.startLine + 1,
                  endLine: r.symbol.location.endLine + 1,
                },
                body: r.body,
                filePath: file,
              });
            }
          } catch { /* skip unreadable files */ }
        }

        if (allMatches.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No symbols matching '${pattern}' found in ${filePath}` }],
            structuredContent: { matches: [], count: 0 },
          };
        }

        const textOutput = allMatches
          .map((m) =>
            `[${m.kind}] ${m.namePath} (${path.relative(validPath, m.filePath)}:${m.location.startLine})${
              m.body ? "\n```\n" + m.body + "\n```" : ""
            }`
          )
          .join("\n\n");

        return {
          content: [{ type: "text" as const, text: textOutput }],
          structuredContent: {
            matches: allMatches.map((m) => ({
              namePath: m.namePath,
              kind: m.kind,
              location: m.location,
              body: m.body,
            })),
            count: allMatches.length,
          },
        };
      }

      // Single file mode
      return withFileContent(filePath, async (validPath, content, language) => {
        const results = await findSymbols({ content, language }, pattern, {
          includeBody,
          kinds: kindValues,
          depth,
          exactMatch: false,
        });

        const matches = results.map((r) => ({
          namePath: r.symbol.namePath,
          kind: SymbolKindNames[r.symbol.kind] || "Unknown",
          location: {
            startLine: r.symbol.location.startLine + 1,
            endLine: r.symbol.location.endLine + 1,
          },
          body: r.body,
        }));

        return symbolMatchesResponse(matches);
      });
    }
  );
}