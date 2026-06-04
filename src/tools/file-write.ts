/**
 * File Write Tools
 *
 * Tools for writing and editing files.
 */

import fs from "fs/promises";
import { z } from "zod";

import { EditMatchError } from "../errors/index.js";
import type { ToolContext } from "./types.js";
import { validatePath } from "../validation/path-validation.js";
import { normalizeLineEndings } from "../utils/text-utils.js";
import { createUnifiedDiff } from "../operations/diff-operations.js";
import { pathSuccessResponse, errorResponse, editErrorResponse, editDiffResponse } from "../utils/response-helpers.js";
import { PathSchema, PathSuccessShape } from "../schemas/index.js";
import { FILE_ENCODING } from "../constants.js";
import { undoManager } from "../undo/undo-manager.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { atomicWrite } from "../utils/fs-utils.js";
import { getConfig } from "../config/index.js";
/**
 * Apply edits to a file with improved indentation preservation.
 * Returns diff + ambiguity flag (true if oldText matched multiple times).
 */
async function applyFileEdits(
  filePath: string,
  edits: Array<{ oldText: string; newText: string }>,
  dryRun = false
): Promise<{ diff: string; ambiguous: boolean }> {
  const content = normalizeLineEndings(await fs.readFile(filePath, FILE_ENCODING));
  let modifiedContent = content;
  let ambiguous = false;

  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    // If exact match exists, use indexOf for precise position
    const matchIndex = modifiedContent.indexOf(normalizedOld);
    if (matchIndex !== -1) {
      // Check for duplicate matches — if oldText appears more than once,
      // the edit is ambiguous. We still replace the first occurrence
      // but flag it for the caller to report.
      const secondMatch = modifiedContent.indexOf(normalizedOld, matchIndex + 1);
      if (secondMatch !== -1) {
        ambiguous = true;
      }

      modifiedContent =
        modifiedContent.substring(0, matchIndex) +
        normalizedNew +
        modifiedContent.substring(matchIndex + normalizedOld.length);
      continue;
    }

    // Otherwise, try line-by-line fuzzy matching with similarity threshold
    const oldLines = normalizedOld.split("\n");
    const contentLines = modifiedContent.split("\n");
    let matchFound = false;
    let bestMatchIndex = -1;
    let bestMatchScore = 0;

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);
      
      const matchingLines = oldLines.filter((oldLine, j) => {
        const contentLine = potentialMatch[j];
        return oldLine.trim() === contentLine.trim();
      }).length;
      const score = matchingLines / oldLines.length;

      if (score > bestMatchScore && score >= 0.6) {
        bestMatchScore = score;
        bestMatchIndex = i;
      }
    }

    if (bestMatchIndex !== -1) {
      const originalIndent = contentLines[bestMatchIndex].match(/^\s*/)?.[0] ?? "";

      const newLines = normalizedNew.split("\n").map((line, j) => {
        if (j === 0) return originalIndent + line.trimStart();

        const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] ?? "";
        const newIndent = line.match(/^\s*/)?.[0] ?? "";

        if (oldIndent && newIndent) {
          const relativeIndent = newIndent.length - oldIndent.length;
          return originalIndent + " ".repeat(Math.max(0, relativeIndent)) + line.trimStart();
        }
        return line;
      });

      contentLines.splice(bestMatchIndex, oldLines.length, ...newLines);
      modifiedContent = contentLines.join("\n");
      matchFound = true;
    }

    if (!matchFound) {
      throw new EditMatchError(edit.oldText, filePath, { cause: undefined });
    }
  }

  const diff = createUnifiedDiff(content, modifiedContent, filePath, {});

  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    await atomicWrite(filePath, modifiedContent);
  }

  return { diff: formattedDiff, ambiguous };
}

export function registerFileWriteTools({ factories }: ToolContext): void {
  const { destructive } = factories;

  destructive(
    "write_file",
    {
      title: "Write File",
      description: "Create or overwrite a file with new content.",
      inputSchema: {
        path: PathSchema,
        content: z.string().describe("Content to write to the file"),
      },
      outputSchema: PathSuccessShape,
      annotations: { idempotentHint: true },
    },
    async ({ path: filePath, content }) => {
      const validPath = await validatePath(filePath, { bypassCache: true });

      const staleError = await stalenessGuard.checkAndGetError(validPath);
      if (staleError) {
        return errorResponse(staleError, { path: validPath });
      }

      // Record for undo before writing
      const maxWriteBytes = getConfig().fileRead.maxFileSizeBytes;
      if (Buffer.byteLength(content, "utf-8") > maxWriteBytes) {
        return errorResponse(`Content size (${(Buffer.byteLength(content, "utf-8") / 1024 / 1024).toFixed(1)}MB) exceeds limit (${(maxWriteBytes / 1024 / 1024).toFixed(0)}MB). Set MCP_MAX_FILE_SIZE_BYTES to increase.`, { path: validPath });
      }

      await undoManager.record(validPath, `write_file: ${validPath}`);

      await atomicWrite(validPath, content);

      return pathSuccessResponse("wrote to", filePath);
    }
  );

  destructive(
    "edit_file",
    {
      title: "Edit File",
      description: "Make line-based edits to a file. Returns a git-style diff.",
      inputSchema: {
        path: PathSchema,
        edits: z
          .array(
            z.object({
              oldText: z.string().describe("Text to search for - must match exactly"),
              newText: z.string().describe("Text to replace with"),
            })
          )
          .describe("Array of edits to apply"),
        dryRun: z.boolean().default(false).describe("Preview changes without applying"),
      },
      outputSchema: {
        diff: z.string().describe("Git-style diff of changes"),
        identical: z.boolean().describe("Whether file is unchanged after edits"),
        applied: z.boolean().describe("Whether changes were applied"),
        warnings: z.array(z.string()).describe("Warnings about the edits (e.g., ambiguous matches)"),
      },
    },
    async ({ path: filePath, edits, dryRun }) => {
      const validPath = await validatePath(filePath, { bypassCache: true });

      const staleError = await stalenessGuard.checkAndGetError(validPath);
      if (staleError) {
        return editErrorResponse(staleError);
      }

      // Record for undo before editing (if not dry run)
      if (!dryRun) {
        await undoManager.record(validPath, `edit_file: ${validPath}`);
      }

      let result: { diff: string; ambiguous: boolean };
      try {
        result = await applyFileEdits(validPath, edits, dryRun);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return editErrorResponse(msg);
      }
      return editDiffResponse(result.diff, !dryRun, result.ambiguous);
    }
  );
}