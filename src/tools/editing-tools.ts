/**
 * Semantic Code Editing Tools
 *
 * Tools for modifying code using semantic operations:
 * - replace_symbol_body: Replace a symbol's implementation
 * - insert_before_symbol: Insert code before a symbol
 * - insert_after_symbol: Insert code after a symbol
 * - rename_symbol: Rename a symbol across all files
 */

import { z } from "zod";
import {
  PathSchema,
  DryRunSchema,
  SymbolNamePathSchema,
} from "../schemas/index.js";
import { withFileContent } from "../file-operations/read-utils.js";
import { validatePath } from "../validation/path-validation.js";
import {
  replaceSymbolBody,
  insertBeforeSymbol,
  insertAfterSymbol,
  renameSymbol,
} from "../semantic/index.js";
import {
  semanticOperationResponse,
  renameResultResponse,
} from "../utils/response-helpers.js";
import type { ToolContext } from "./types.js";
import { undoManager } from "../undo/undo-manager.js";
import { stalenessGuard } from "../undo/staleness-guard.js";

/**
 * Registers all semantic code editing tools.
 *
 * Tools registered:
 * - replace_symbol_body: Replace a symbol's body while preserving its signature
 * - insert_before_symbol: Insert code before a symbol definition
 * - insert_after_symbol: Insert code after a symbol definition
 * - rename_symbol: Rename a symbol across all files where it is referenced
 *
 * @param context - Tool registration context providing factory methods
 */
export function registerEditingTools({ factories }: ToolContext): void {
  const { destructive } = factories;

  destructive(
    "replace_symbol_body",
    {
      title: "Replace Symbol Body",
      description:
        "Replace a symbol's body (implementation) with new code. Preserves the signature.",
      inputSchema: {
        path: PathSchema,
        namePath: SymbolNamePathSchema,
        newBody: z.string().describe("New body code to replace with"),
        dryRun: DryRunSchema,
      },
      outputSchema: {
        success: z.boolean(),
        diff: z.string(),
        error: z.string().optional(),
      },
    },
    async ({ path: filePath, namePath, newBody, dryRun }) => {
      const staleError = await stalenessGuard.checkAndGetError(filePath);
      if (staleError) {
        return semanticOperationResponse({ success: false, diff: "", error: staleError });
      }

      return withFileContent(filePath, async (validPath, content) => {
        if (!dryRun) {
          await undoManager.record(validPath, `replace_symbol_body: ${namePath}`);
        }
        const result = await replaceSymbolBody(
          validPath,
          content,
          namePath,
          newBody,
          { dryRun }
        );
        return semanticOperationResponse(result);
      });
    }
  );

  destructive(
    "insert_before_symbol",
    {
      title: "Insert Before Symbol",
      description: "Insert code before a symbol definition.",
      inputSchema: {
        path: PathSchema,
        namePath: z.string().describe("Symbol name path to insert before"),
        code: z.string().describe("Code to insert"),
        dryRun: DryRunSchema,
      },
      outputSchema: {
        success: z.boolean(),
        diff: z.string(),
        error: z.string().optional(),
      },
    },
    async ({ path: filePath, namePath, code, dryRun }) => {
      const staleError = await stalenessGuard.checkAndGetError(filePath);
      if (staleError) {
        return semanticOperationResponse({ success: false, diff: "", error: staleError });
      }

      return withFileContent(filePath, async (validPath, content) => {
        if (!dryRun) {
          await undoManager.record(validPath, `insert_before_symbol: ${namePath}`);
        }
        const result = await insertBeforeSymbol(
          validPath,
          content,
          namePath,
          code,
          { dryRun }
        );
        return semanticOperationResponse(result);
      });
    }
  );

  destructive(
    "insert_after_symbol",
    {
      title: "Insert After Symbol",
      description: "Insert code after a symbol definition.",
      inputSchema: {
        path: PathSchema,
        namePath: z.string().describe("Symbol name path to insert after"),
        code: z.string().describe("Code to insert"),
        dryRun: DryRunSchema,
      },
      outputSchema: {
        success: z.boolean(),
        diff: z.string(),
        error: z.string().optional(),
      },
    },
    async ({ path: filePath, namePath, code, dryRun }) => {
      const staleError = await stalenessGuard.checkAndGetError(filePath);
      if (staleError) {
        return semanticOperationResponse({ success: false, diff: "", error: staleError });
      }

      return withFileContent(filePath, async (validPath, content) => {
        if (!dryRun) {
          await undoManager.record(validPath, `insert_after_symbol: ${namePath}`);
        }
        const result = await insertAfterSymbol(
          validPath,
          content,
          namePath,
          code,
          { dryRun }
        );
        return semanticOperationResponse(result);
      });
    }
  );

  destructive(
    "rename_symbol",
    {
      title: "Rename Symbol",
      description: "Rename a symbol across all files where it is referenced.",
      inputSchema: {
        path: PathSchema.describe(
          "Path to the file containing the symbol definition"
        ),
        namePath: SymbolNamePathSchema,
        newName: z.string().describe("New name for the symbol"),
        searchPath: z
          .string()
          .optional()
          .describe(
            "Directory to search for references (default: current directory)"
          ),
        dryRun: DryRunSchema,
      },
      outputSchema: {
        oldName: z.string(),
        newName: z.string(),
        modifiedFiles: z.array(z.string()),
        totalReferences: z.number(),
        errors: z.array(z.string()),
      },
    },
    async ({ path: filePath, namePath, newName, searchPath, dryRun }) => {
      const validSearchPath = searchPath
        ? await validatePath(searchPath)
        : process.cwd();

      const staleError = await stalenessGuard.checkAndGetError(filePath);
      if (staleError) {
        return renameResultResponse("", "", [], 0, new Map(), [staleError]);
      }

      return withFileContent(filePath, async (validPath, content) => {
        if (!dryRun) {
          await undoManager.record(validPath, `rename_symbol: ${namePath} -> ${newName}`);
        }
        const result = await renameSymbol(validPath, content, namePath, newName, {
          dryRun,
          searchPath: validSearchPath,
        });

        return renameResultResponse(
          result.oldName,
          result.newName,
          result.modifiedFiles,
          result.totalReferences,
          result.diffs,
          result.errors
        );
      });
    }
  );
}
