/**
 * Undo & Refactor Tools
 *
 * MCP tool registrations for:
 * - filesystem_undo: Undo last N destructive operations
 * - filesystem_undo_peek: Preview what undo would restore (without applying)
 * - filesystem_undo_all: Undo all recorded operations
 * - filesystem_undo_status: Show undo stack status
 * - filesystem_extract_method: Extract code into a new function
 * - filesystem_inline_variable: Replace variable usages with its value
 * - filesystem_introduce_parameter: Convert expression to function parameter
 */

import { z } from "zod";
import { PathSchema, DryRunSchema } from "../schemas/index.js";
import { getConfig } from "../config/index.js";
import { undoManager } from "../undo/undo-manager.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import {
  extractMethod,
  inlineVariable,
  introduceParameter,
} from "../undo/composite-refactors.js";
import { readValidatedFile } from "../file-operations/read-utils.js";
import { jsonResponse } from "../utils/response-helpers.js";
import type { ToolContext } from "./types.js";

// ---------------------------------------------------------------------------
// Refactor result → MCP response
// ---------------------------------------------------------------------------

function refactorResultResponse(result: {
  success: boolean;
  diff: string;
  modifiedFiles: string[];
  errors: string[];
  description: string;
}) {
  const text = result.success
    ? `${result.description}\n\n${result.diff}`
    : `Error: ${result.errors.join("; ")}`;

  return {
    content: [{ type: "text" as const, text }],
    structuredContent: {
      success: result.success,
      diff: result.diff,
      description: result.description,
      modifiedFiles: result.modifiedFiles,
      errors: result.errors,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool registrations
// ---------------------------------------------------------------------------

/**
 * Registers all undo and refactor tools.
 *
 * Tools registered:
 * - undo: Undo the last N destructive filesystem operations
 * - undo_peek: Preview what undo would restore without applying
 * - undo_all: Undo all recorded destructive operations
 * - undo_status: Show undo stack status and staleness guard state
 * - extract_method: Extract code range into a new function/method
 * - inline_variable: Replace variable usages with its initializer value
 * - introduce_parameter: Convert a local expression into a function parameter
 *
 * @param context - Tool registration context providing factory methods
 */
export function registerUndoTools({ factories }: ToolContext): void {
  const { readOnly, destructive } = factories;

  // =========================================================================
  // filesystem_undo — Undo last N operations
  // =========================================================================
  destructive(
    "undo",
    {
      title: "Undo Filesystem Operations",
      description:
        "Undo the last N destructive filesystem operations (writes, edits, symbol replacements, renames). " +
        "Restores files to their pre-mutation state. Use filesystem_undo_peek to preview before undoing.",
      inputSchema: {
        count: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(1)
          .describe("Number of operations to undo (default: 1)"),
      },
      outputSchema: {
        undone: z.number().describe("Number of operations undone"),
        restored: z
          .array(
            z.object({
              filePath: z.string(),
              success: z.boolean(),
              error: z.string().optional(),
            }),
          )
          .describe("Per-file restore results"),
      },
    },
    async ({ count }) => {
      const result = await undoManager.undo(count);
      return jsonResponse({
        undone: result.undone,
        restored: result.restored,
      });
    },
  );

  // =========================================================================
  // filesystem_undo_peek — Preview undo stack
  // =========================================================================
  readOnly(
    "undo_peek",
    {
      title: "Preview Undo Stack",
      description:
        "Preview the last N entries on the undo stack without applying them. " +
        "Shows what each undo operation would restore.",
      inputSchema: {
        count: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .default(5)
          .describe("Number of entries to preview (default: 5)"),
      },
      outputSchema: {
        entries: z
          .array(
            z.object({
              filePath: z.string(),
              timestamp: z.number(),
              description: z.string(),
              hasPreviousContent: z.boolean(),
            }),
          )
          .describe("Undo stack entries"),
        totalStackSize: z.number().describe("Total entries on the stack"),
      },
    },
    async ({ count }) => {
      const entries = undoManager.peek(count);
      return jsonResponse({
        entries: entries.map((e) => ({
          filePath: e.filePath,
          timestamp: e.timestamp,
          description: e.description,
          hasPreviousContent: e.previousContent !== null,
        })),
        totalStackSize: undoManager.size,
      });
    },
  );

  // =========================================================================
  // filesystem_undo_all — Undo all operations
  // =========================================================================
  destructive(
    "undo_all",
    {
      title: "Undo All Filesystem Operations",
      description:
        "Undo ALL recorded destructive filesystem operations. " +
        "Restores every file to its state before the session started editing. " +
        "Use filesystem_undo_peek first to review what will be undone.",
      inputSchema: {},
      outputSchema: {
        undone: z.number().describe("Number of operations undone"),
        restored: z
          .array(
            z.object({
              filePath: z.string(),
              success: z.boolean(),
              error: z.string().optional(),
            }),
          )
          .describe("Per-file restore results"),
      },
    },
    async () => {
      const result = await undoManager.undoAll();
      return jsonResponse({
        undone: result.undone,
        restored: result.restored,
      });
    },
  );

  // =========================================================================
  // filesystem_undo_status — Show undo stack status
  // =========================================================================
  readOnly(
    "undo_status",
    {
      title: "Undo Stack Status",
      description:
        "Show the current status of the undo stack and staleness guard. " +
        "Includes stack depth, staleness guard state, and configuration.",
      inputSchema: {},
      outputSchema: {
        stackSize: z.number().describe("Number of entries on the undo stack"),
        stalenessGuardEnabled: z.boolean().describe(
          "Whether staleness guard is active",
        ),
        trackedFiles: z.number().describe("Number of files tracked by staleness guard"),
      },
    },
    async () => {
      return jsonResponse({
        stackSize: undoManager.size,
        stalenessGuardEnabled: getConfig().stalenessGuard.enabled,
        trackedFiles: stalenessGuard.size,
      });
    },
  );

  // =========================================================================
  // filesystem_extract_method — Extract code into a new function
  // =========================================================================
  destructive(
    "extract_method",
    {
      title: "Extract Method",
      description:
        "Extract a range of lines into a new function/method. Analyzes free variables " +
        "to determine parameters. Inserts the new function after the parent symbol " +
        "and replaces the extracted lines with a call to the new function.",
      inputSchema: {
        path: PathSchema.describe("Path to the source file"),
        newMethodName: z
          .string()
          .describe("Name for the new function/method"),
        startLine: z
          .number()
          .int()
          .min(1)
          .describe("1-based start line of the code to extract"),
        endLine: z
          .number()
          .int()
          .min(1)
          .describe("1-based end line of the code to extract (inclusive)"),
        parentSymbol: z
          .string()
          .optional()
          .describe(
            "Parent symbol to insert the new method after (e.g., 'MyClass')",
          ),
        dryRun: DryRunSchema,
      },
      outputSchema: {
        success: z.boolean(),
        diff: z.string(),
        modifiedFiles: z.array(z.string()),
        errors: z.array(z.string()),
        description: z.string(),
      },
    },
    async ({ path: filePath, newMethodName, startLine, endLine, parentSymbol, dryRun }) => {
      const { validPath, content } = await readValidatedFile(filePath);
      const result = await extractMethod(validPath, content, {
        newMethodName,
        startLine,
        endLine,
        parentSymbol,
        dryRun,
      });
      return refactorResultResponse(result);
    },
  );

  // =========================================================================
  // filesystem_inline_variable — Replace variable with its value
  // =========================================================================
  destructive(
    "inline_variable",
    {
      title: "Inline Variable",
      description:
        "Replace all usages of a variable with its initializer value and remove " +
        "the variable declaration. The variable must have a simple initializer.",
      inputSchema: {
        path: PathSchema.describe("Path to the source file"),
        variableName: z.string().describe("Name of the variable to inline"),
        parentSymbol: z
          .string()
          .optional()
          .describe(
            "Parent symbol path for disambiguation (e.g., 'MyClass/myMethod')",
          ),
        dryRun: DryRunSchema,
      },
      outputSchema: {
        success: z.boolean(),
        diff: z.string(),
        modifiedFiles: z.array(z.string()),
        errors: z.array(z.string()),
        description: z.string(),
      },
    },
    async ({ path: filePath, variableName, parentSymbol, dryRun }) => {
      const { validPath, content } = await readValidatedFile(filePath);
      const result = await inlineVariable(validPath, content, {
        variableName,
        parentSymbol,
        dryRun,
      });
      return refactorResultResponse(result);
    },
  );

  // =========================================================================
  // filesystem_introduce_parameter — Convert expression to function parameter
  // =========================================================================
  destructive(
    "introduce_parameter",
    {
      title: "Introduce Parameter",
      description:
        "Convert a local expression into a function parameter with a default value. " +
        "Adds the new parameter to the function signature and replaces the expression " +
        "in the function body with the parameter name.",
      inputSchema: {
        path: PathSchema.describe("Path to the source file"),
        parameterName: z.string().describe("Name for the new parameter"),
        startLine: z
          .number()
          .int()
          .min(1)
          .describe("1-based start line of the expression"),
        endLine: z
          .number()
          .int()
          .min(1)
          .describe("1-based end line of the expression (inclusive)"),
        startColumn: z
          .number()
          .int()
          .min(0)
          .describe("0-based start column of the expression"),
        endColumn: z
          .number()
          .int()
          .min(0)
          .describe("0-based end column of the expression"),
        functionSymbol: z
          .string()
          .optional()
          .describe(
            "Function symbol path (e.g., 'MyClass/myMethod')",
          ),
        dryRun: DryRunSchema,
      },
      outputSchema: {
        success: z.boolean(),
        diff: z.string(),
        modifiedFiles: z.array(z.string()),
        errors: z.array(z.string()),
        description: z.string(),
      },
    },
    async ({
      path: filePath,
      parameterName,
      startLine,
      endLine,
      startColumn,
      endColumn,
      functionSymbol,
      dryRun,
    }) => {
      const { validPath, content } = await readValidatedFile(filePath);
      const result = await introduceParameter(validPath, content, {
        parameterName,
        startLine,
        endLine,
        startColumn,
        endColumn,
        functionSymbol,
        dryRun,
      });
      return refactorResultResponse(result);
    },
  );
}