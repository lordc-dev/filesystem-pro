/**
 * Code Editor - Facade
 *
 * AST-aware code modifications: replace symbol bodies, insert before/after
 * symbols, and perform global renames while generating diffs.
 *
 * Implementation has been split into focused modules:
 * - code-editor-types.ts: Shared interfaces
 * - code-editor-helpers.ts: Validation, indentation, error formatting
 * - code-editor-rename.ts: Cross-file rename operations
 * - code-editor.ts: Replace, insert, delete operations + re-exports
 */

import { SymbolKind, getLanguageFromPath } from "./types.js";
import { findSymbol } from "./symbol-lookup.js";
import { createUnifiedDiff } from "../operations/diff-operations.js";
import { atomicWrite } from "../utils/fs-utils.js";
import type { ReplaceOptions, InsertOptions } from "./code-editor-types.js";
import type { ReplaceResult } from "./types.js";
import {
  withSymbol,
  getIndentation,
  getBodyContentIndent,
  adjustBodyIndentation,
} from "./code-editor-helpers.js";

// Re-export types and rename for backward compatibility
export type { ReplaceOptions, InsertOptions, RenameOptions, SymbolRenameResult } from "./code-editor-types.js";
export { renameSymbol } from "./code-editor-rename.js";

// ============================================================================
// REPLACE OPERATIONS
// ============================================================================

/**
 * Replace a symbol's body with new content
 */
export async function replaceSymbolBody(
  filePath: string,
  content: string,
  namePath: string,
  newBody: string,
  options: ReplaceOptions = {},
): Promise<ReplaceResult> {
  const { dryRun = false, adjustIndentation = true } = options;

  return withSymbol(filePath, content, namePath, async (symbol) => {
    const targetLocation = symbol.bodyLocation ?? symbol.location;

    let replaceStart = targetLocation.startOffset;
    let replaceEnd = targetLocation.endOffset;
    let prefix = "";
    let suffix = "";
    const bodyContent = content.substring(targetLocation.startOffset, targetLocation.endOffset);
    const preserveBraces = bodyContent.startsWith("{") && bodyContent.endsWith("}");
    if (preserveBraces) {
      const closingBraceStartLine = content.lastIndexOf("\n", targetLocation.endOffset - 2);
      let closingIndent = "";
      if (closingBraceStartLine !== -1 && closingBraceStartLine >= targetLocation.startOffset) {
        const lineAfterNewline = closingBraceStartLine + 1;
        const lineText = content.substring(lineAfterNewline, targetLocation.endOffset);
        const indentMatch = lineText.match(/^(\s*)/);
        closingIndent = indentMatch ? indentMatch[1] : "";
      }
      prefix = "{\n";
      suffix = "\n" + closingIndent + "}";
      replaceStart = targetLocation.startOffset;
      replaceEnd = targetLocation.endOffset;
    }

    let adjustedNewBody = newBody;
    if (adjustIndentation) {
      const baseIndent = getBodyContentIndent(content, targetLocation);
      adjustedNewBody = adjustBodyIndentation(newBody, baseIndent);
    }

    const replacementContent = preserveBraces
      ? prefix + adjustedNewBody + suffix
      : adjustedNewBody;
    const newContent =
      content.substring(0, replaceStart) +
      replacementContent +
      content.substring(replaceEnd);

    const diff = createUnifiedDiff(content, newContent, filePath, {});

    if (!dryRun) {
      await atomicWrite(filePath, newContent);
    }

    return {
      success: true,
      filePath,
      diff,
      newContent: dryRun ? newContent : undefined,
    };
  });
}

/**
 * Replace entire symbol (including signature)
 */
export async function replaceSymbol(
  filePath: string,
  content: string,
  namePath: string,
  newCode: string,
  options: ReplaceOptions = {},
): Promise<ReplaceResult> {
  const { dryRun = false, adjustIndentation = true } = options;

  return withSymbol(filePath, content, namePath, async (symbol) => {
    let adjustedCode = newCode;
    if (adjustIndentation) {
      const lines = content.split("\n");
      const originalIndent = getIndentation(content, symbol.location.startLine, lines);
      adjustedCode = adjustBodyIndentation(newCode, originalIndent);
    }

    const newContent =
      content.substring(0, symbol.location.startOffset) +
      adjustedCode +
      content.substring(symbol.location.endOffset);

    const diff = createUnifiedDiff(content, newContent, filePath, {});

    if (!dryRun) {
      await atomicWrite(filePath, newContent);
    }

    return {
      success: true,
      filePath,
      diff,
      newContent: dryRun ? newContent : undefined,
    };
  });
}

// ============================================================================
// INSERT OPERATIONS
// ============================================================================

/**
 * Insert code relative to a symbol (before or after)
 *
 * SSOT for insert-before/after logic — eliminates duplication.
 */
async function insertAtSymbol(
  filePath: string,
  content: string,
  namePath: string,
  codeToInsert: string,
  position: "before" | "after",
  options: InsertOptions = {},
): Promise<ReplaceResult> {
  const {
    dryRun = false,
    blankLineBefore = position === "after",
    blankLineAfter = position === "before",
    matchIndentation = true,
  } = options;

  return withSymbol(filePath, content, namePath, async (symbol) => {
    const lines = content.split("\n");
    let adjustedCode = codeToInsert;
    if (matchIndentation) {
      const parentResult = await findSymbol(
        { content, language: getLanguageFromPath(filePath)! },
        namePath.includes("/") ? namePath.substring(0, namePath.lastIndexOf("/")) : "",
      );
      if (parentResult && symbol.kind !== SymbolKind.Class && symbol.kind !== SymbolKind.Interface) {
        const indent = getBodyContentIndent(content, parentResult.symbol.bodyLocation ?? parentResult.symbol.location, lines);
        adjustedCode = adjustBodyIndentation(codeToInsert, indent);
      } else if (symbol.bodyLocation) {
        const indent = getBodyContentIndent(content, symbol.bodyLocation, lines);
        adjustedCode = adjustBodyIndentation(codeToInsert, indent);
      } else {
        const indent = getIndentation(content, symbol.location.startLine, lines);
        adjustedCode = adjustBodyIndentation(codeToInsert, indent);
      }
    }

    let insertion = "";
    if (blankLineBefore) insertion += "\n";
    insertion += adjustedCode;
    if (blankLineAfter) insertion += "\n";

    let insertPosition: number;
    if (position === "before") {
      insertPosition = 0;
      for (let i = 0; i < symbol.location.startLine; i++) {
        insertPosition += lines[i].length + 1;
      }
    } else {
      insertPosition = 0;
      for (let i = 0; i <= symbol.location.endLine; i++) {
        insertPosition += lines[i].length + 1;
      }
    }

    const newContent =
      content.substring(0, insertPosition) +
      insertion +
      content.substring(insertPosition);

    const diff = createUnifiedDiff(content, newContent, filePath, {});

    if (!dryRun) {
      await atomicWrite(filePath, newContent);
    }

    return {
      success: true,
      filePath,
      diff,
      newContent: dryRun ? newContent : undefined,
    };
  });
}

/**
 * Insert code before a symbol
 */
export async function insertBeforeSymbol(
  filePath: string,
  content: string,
  namePath: string,
  codeToInsert: string,
  options: InsertOptions = {},
): Promise<ReplaceResult> {
  const { blankLineBefore = false, blankLineAfter = true, ...rest } = options;
  return insertAtSymbol(filePath, content, namePath, codeToInsert, "before", {
    ...rest,
    blankLineBefore,
    blankLineAfter,
  });
}

/**
 * Insert code after a symbol
 */
export async function insertAfterSymbol(
  filePath: string,
  content: string,
  namePath: string,
  codeToInsert: string,
  options: InsertOptions = {},
): Promise<ReplaceResult> {
  const { blankLineBefore = true, blankLineAfter = false, ...rest } = options;
  return insertAtSymbol(filePath, content, namePath, codeToInsert, "after", {
    ...rest,
    blankLineBefore,
    blankLineAfter,
  });
}

// ============================================================================
// DELETE OPERATION
// ============================================================================

/**
 * Delete a symbol from a file
 */
export async function deleteSymbol(
  filePath: string,
  content: string,
  namePath: string,
  options: { dryRun?: boolean } = {},
): Promise<ReplaceResult> {
  const { dryRun = false } = options;

  return withSymbol(filePath, content, namePath, async (symbol) => {
    const lines = content.split("\n");
    let lineStart = 0;
    for (let i = 0; i < symbol.location.startLine; i++) {
      lineStart += lines[i].length + 1;
    }

    let lineEnd = lineStart;
    for (let i = symbol.location.startLine; i <= symbol.location.endLine; i++) {
      lineEnd += lines[i].length + 1;
    }

    const newContent =
      content.substring(0, lineStart) +
      content.substring(lineEnd);

    const diff = createUnifiedDiff(content, newContent, filePath, {});

    if (!dryRun) {
      await atomicWrite(filePath, newContent);
    }

    return {
      success: true,
      filePath,
      diff,
      newContent: dryRun ? newContent : undefined,
    };
  });
}