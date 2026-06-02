/**
 * Search Files Tool
 *
 * Search for files by name pattern using ripgrep.
 */

import { z } from "zod";
import type { ToolContext } from "./types.js";
import { validatePath } from "../validation/path-validation.js";
import { searchFiles } from "../search/index.js";
import { searchResultsResponse } from "../utils/response-helpers.js";
import { PathSchema, ExcludePatternsSchema, SearchResultsSchema } from "../schemas/index.js";

export function registerSearchFilesTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "search_files",
    {
      title: "Search Files",
      description: "Search for files by name pattern using ripgrep. Returns matching file paths without reading their contents.",
      inputSchema: {
        path: PathSchema,
        pattern: z.string().describe("File name pattern to search for"),
        excludePatterns: ExcludePatternsSchema,
      },
      outputSchema: SearchResultsSchema,
    },
    async ({ path: searchPath, pattern, excludePatterns }) => {
      const validPath = await validatePath(searchPath);
      const results = await searchFiles(validPath, pattern, { excludePatterns });
      return searchResultsResponse(results);
    }
  );
}
