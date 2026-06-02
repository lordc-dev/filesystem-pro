/**
 * Search Content Tool
 *
 * Search file contents using ripgrep with regex support.
 */

import { z } from "zod";
import type { ToolContext } from "./types.js";
import { validatePath } from "../validation/path-validation.js";
import { searchContent } from "../search/index.js";
import { structuredSearchResponse } from "../utils/response-helpers.js";
import { PathSchema, PatternSchema, ExcludePatternsSchema, ContentSearchResultSchema } from "../schemas/index.js";

export function registerSearchContentTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "search_content",
    {
      title: "Search Content",
      description: "Search file contents using ripgrep (regex search).",
      inputSchema: {
        path: PathSchema,
        pattern: PatternSchema,
        fileType: z.string().optional().describe("File type filter (e.g., 'js', 'ts')"),
        context: z.number().optional().describe("Number of context lines"),
        ignoreCase: z.boolean().optional().describe("Case insensitive search"),
        maxResults: z.number().optional().describe("Maximum number of results"),
        excludePatterns: ExcludePatternsSchema,
        pcre2: z.boolean().optional().describe("Enable PCRE2 for advanced regex"),
      },
      outputSchema: {
        results: z.array(ContentSearchResultSchema).describe("Search results with context"),
        count: z.number().describe("Number of matches"),
      },
    },
    async ({ path: searchPath, pattern, fileType, context, ignoreCase, maxResults, excludePatterns, pcre2 }) => {
      const validPath = await validatePath(searchPath);
      const results = await searchContent(validPath, pattern, {
        fileType,
        context,
        ignoreCase,
        excludePatterns,
        maxResults,
        pcre2,
      });
      return structuredSearchResponse(results);
    }
  );
}
