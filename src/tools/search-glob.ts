/**
 * Find by Glob Tool
 *
 * Find files using glob patterns.
 */

import { z } from "zod";
import type { ToolContext } from "./types.js";
import { validatePath } from "../validation/path-validation.js";
import { globSearch } from "../search/index.js";
import { searchResultsResponse } from "../utils/response-helpers.js";
import { SearchResultsSchema } from "../schemas/index.js";

export function registerFindByGlobTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "find_by_glob",
    {
      title: "Find by Glob",
      description: "Find files using glob patterns (e.g., '**/*.ts'). Supports multiple patterns, ignore rules, and depth filtering.",
      inputSchema: {
        patterns: z.union([z.string(), z.array(z.string())]).describe("Glob pattern(s)"),
        cwd: z.string().optional().describe("Working directory"),
        ignore: z.array(z.string()).optional().describe("Patterns to ignore"),
        onlyFiles: z.boolean().optional().describe("Only return files"),
        onlyDirectories: z.boolean().optional().describe("Only return directories"),
        followSymlinks: z.boolean().optional().default(false).describe("Follow symbolic links"),
        deep: z.number().optional().describe("Max directory depth"),
      },
      outputSchema: SearchResultsSchema,
    },
    async ({ patterns, cwd, ignore, onlyFiles, onlyDirectories, followSymlinks, deep }) => {
      const searchPath = cwd ? await validatePath(cwd) : process.cwd();
      const results = await globSearch(patterns, {
        cwd: searchPath,
        ignore,
        onlyFiles,
        onlyDirectories,
        followSymlinks,
        deep,
        absolute: true,
      });
      return searchResultsResponse(results);
    }
  );
}
