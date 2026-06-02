/**
 * Code Editor Helpers
 *
 * Shared logic for symbol operations: validation, indentation, error formatting.
 */

import type { Symbol, ReplaceResult, SupportedLanguage } from "./types.js";
import { getLanguageFromPath } from "./types.js";
import { ERROR_MESSAGES } from "../constants.js";
import { observeHistogram } from "../utils/metrics.js";
import { findSymbol } from "./symbol-lookup.js";

/**
 * Error result factory for symbol operations (SSOT)
 */
export function symbolErrorResult(filePath: string, error: string): ReplaceResult {
  return {
    success: false,
    filePath,
    diff: "",
    error,
  };
}

/**
 * Execute an operation on a symbol with automatic validation (SSOT)
 *
 * Reduces boilerplate by handling:
 * - Language detection and validation
 * - Symbol extraction and lookup
 * - Common error responses
 */
export async function withSymbol(
  filePath: string,
  content: string,
  namePath: string,
  handler: (symbol: Symbol, language: SupportedLanguage) => Promise<ReplaceResult>,
): Promise<ReplaceResult> {
  const language = getLanguageFromPath(filePath);
  if (!language) {
    return symbolErrorResult(filePath, ERROR_MESSAGES.unsupportedFileType(filePath));
  }

  const result = await findSymbol({ content, language }, namePath);
  if (!result) {
    return symbolErrorResult(filePath, ERROR_MESSAGES.symbolNotFound(namePath));
  }

  const startTime = performance.now();
  const handlerResult = await handler(result.symbol, language);
  observeHistogram("refactor_duration_ms", performance.now() - startTime, { operation: "with_symbol" });
  return handlerResult;
}

/**
 * Get the indentation string for a line
 */
export function getIndentation(content: string, lineNumber: number, lines?: string[]): string {
  const allLines = lines ?? content.split("\n");
  if (lineNumber >= 0 && lineNumber < allLines.length) {
    const line = allLines[lineNumber];
    const match = line.match(/^(\s*)/);
    return match ? match[1] : "";
  }
  return "";
}

/**
 * Get the effective indentation for body content.
 * For block bodies (starting with '{'), finds the indentation of the first
 * content line after the opening brace. Otherwise, uses the start line indentation.
 */
export function getBodyContentIndent(
  content: string,
  location: { startLine: number; startOffset: number; endLine: number; endOffset: number },
  lines?: string[],
): string {
  const allLines = lines ?? content.split("\n");
  for (let i = location.startLine; i <= Math.min(location.endLine, allLines.length - 1); i++) {
    const line = allLines[i];
    if (i === location.startLine) {
      const beforeBodyStart = content.substring(location.startOffset, location.startOffset + 1);
      if (beforeBodyStart === "{") {
        continue;
      }
    }
    if (line.trim().length > 0) {
      const match = line.match(/^(\s*)/);
      return match ? match[1] : "";
    }
  }
  return getIndentation(content, location.startLine, allLines);
}

/**
 * Adjust the indentation of a code block
 */
export function adjustBodyIndentation(code: string, baseIndent: string): string {
  const lines = code.split("\n");

  if (lines.length === 0) {
    return code;
  }

  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length > 0) {
      const match = line.match(/^(\s*)/);
      const indent = match ? match[1].length : 0;
      minIndent = Math.min(minIndent, indent);
    }
  }

  if (minIndent === Infinity) {
    minIndent = 0;
  }

  return lines.map((line) => {
    if (line.trim().length === 0) {
      return "";
    }
    const stripped = line.substring(minIndent);
    return baseIndent + stripped;
  }).join("\n");
}