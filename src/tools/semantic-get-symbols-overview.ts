/**
 * Get Symbols Overview Tool
 *
 * List all top-level symbols (classes, functions, etc.) in a file.
 */

import { z } from "zod";
import {
  PathSchema,
  SymbolKindSchema,
  SymbolSchema,
} from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { extractSymbolsFromFile, SymbolKind } from "../semantic/index.js";
import {
  formatSymbolForDisplay,
  symbolsOverviewResponse,
} from "../utils/response-helpers.js";
import type { ToolContext } from "./types.js";

export function registerGetSymbolsOverviewTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "get_symbols_overview",
    {
      title: "Get Symbols Overview",
      description:
        "List all top-level symbols (classes, functions, etc.) in a file. Returns symbol names, kinds, and locations.",
      inputSchema: {
        path: PathSchema,
        depth: z
          .number()
          .optional()
          .default(0)
          .describe("Maximum depth (0=top-level only, 1=include children)"),
        kinds: z
          .array(SymbolKindSchema)
          .optional()
          .describe("Filter by symbol kinds"),
      },
      outputSchema: {
        filePath: z.string(),
        language: z.string(),
        symbols: z.array(SymbolSchema),
        totalCount: z.number(),
      },
    },
    async ({ path: filePath, depth, kinds }) => {
      const kindValues = kinds?.map(
        (k) => SymbolKind[k as keyof typeof SymbolKind]
      );

      return withFileContent(filePath, async (validPath, content, _language) => {
        const result = await extractSymbolsFromFile(validPath, content, {
          maxDepth: depth,
          kinds: kindValues,
          includeMetadata: true,
        });

        const symbols = result.symbols.map(formatSymbolForDisplay);
        return symbolsOverviewResponse(
          validPath,
          result.language,
          symbols,
          result.totalSymbolCount
        );
      });
    }
  );
}
