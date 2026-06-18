/**
 * Code Editor - Rename Operations
 *
 * Global symbol rename across files with diff generation.
 */

import fs from "node:fs/promises";
import { getLanguageFromPath } from "./types.js";
import { FILE_ENCODING, ERROR_MESSAGES } from "../constants.js";
import { findSymbol } from "./symbol-lookup.js";
import { findReferences } from "./reference-finder.js";
import { createUnifiedDiff } from "../operations/diff-operations.js";
import { atomicWrite } from "../utils/fs-utils.js";
import { observeHistogram, incrementCounter } from "../utils/metrics.js";
import type { RenameOptions, SymbolRenameResult } from "./code-editor-types.js";

/**
 * Maximum length for a renamed symbol name.
 * Security: prevents excessive payloads via newName parameter.
 */
const MAX_SYMBOL_NAME_LENGTH = 128;

/**
 * Valid identifier characters for renamed symbols.
 * Allows alphanumeric, underscore, dollar sign, brackets, hyphen (covers JS/TS/Java/Python/etc).
 * Blocks: path separators, newlines, semicolons, braces, parens, backticks.
 * Security: CWE-20 — prevents code injection via newName parameter.
 */
const VALID_SYMBOL_NAME_PATTERN = /^[A-Za-z0-9_$][A-Za-z0-9_$.\u005b\u005d-]*$/;

/**
 * Validate that a new symbol name is safe to write into source files.
 * Rejects names containing path separators, newlines, code constructs, or excessive length.
 * Security audit finding #1 (CWE-20, CWE-184).
 */
function validateSymbolName(name: string): boolean {
  if (!name || name.length === 0 || name.length > MAX_SYMBOL_NAME_LENGTH) {
    return false;
  }
  return VALID_SYMBOL_NAME_PATTERN.test(name);
}

/**
 * Build an error-only result when validation fails early.
 * Reduces cognitive complexity of renameSymbol by consolidating early-return paths.
 */
function buildValidationError(
  namePath: string,
  newName: string,
  error: string,
): SymbolRenameResult {
  return {
    oldName: namePath,
    newName,
    modifiedFiles: [],
    totalReferences: 0,
    diffs: new Map(),
    errors: [error],
  };
}

/**
 * Apply replacements for all references in a single file and return the modified content.
 * Extracted from renameSymbol to reduce cognitive complexity (S3776).
 */
function applyReferenceReplacements(
  fileContent: string,
  refs: { location: { startOffset: number } }[],
  oldName: string,
  newName: string,
): string {
  const sorted = [...refs].sort(
    (a, b) => b.location.startOffset - a.location.startOffset,
  );
  let modified = fileContent;
  for (const ref of sorted) {
    const offset = ref.location.startOffset;
    modified =
      modified.substring(0, offset) +
      newName +
      modified.substring(offset + oldName.length);
  }
  return modified;
}

/**
 * Process references for a single file: read content, apply replacements, generate diff, write.
 * Extracted from renameSymbol to reduce cognitive complexity (S3776).
 */
async function processFileReferences(
  refFilePath: string,
  refs: { location: { startOffset: number } }[],
  oldName: string,
  newName: string,
  dryRun: boolean,
  contentCache: Map<string, string>,
): Promise<{ diff: string; modifiedContent: string } | { error: string }> {
  try {
    let fileContent: string;
    const cached = contentCache.get(refFilePath);
    if (cached) {
      fileContent = cached;
    } else {
      try {
        fileContent = await fs.readFile(refFilePath, FILE_ENCODING);
        contentCache.set(refFilePath, fileContent);
      } catch {
        return { error: `Could not read file: ${refFilePath}` };
      }
    }

    const modifiedContent = applyReferenceReplacements(fileContent, refs, oldName, newName);
    const diff = createUnifiedDiff(fileContent, modifiedContent, refFilePath, {});

    if (!dryRun) {
      await atomicWrite(refFilePath, modifiedContent);
    }

    return { diff, modifiedContent };
  } catch (error: unknown) {
    return { error: `Error processing ${refFilePath}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Rename a symbol across all references
 */
export async function renameSymbol(
  filePath: string,
  content: string,
  namePath: string,
  newName: string,
  options: RenameOptions = {},
): Promise<SymbolRenameResult> {
  const {
    dryRun = false,
    searchPath = process.cwd(),
    filePatterns,
    excludePatterns,
  } = options;

  if (!validateSymbolName(newName)) {
    return buildValidationError(namePath, newName, ERROR_MESSAGES.invalidSymbolName(newName));
  }

  const language = getLanguageFromPath(filePath);
  if (!language) {
    return buildValidationError(namePath, newName, ERROR_MESSAGES.unsupportedFileType(filePath));
  }

  const lookupResult = await findSymbol({ content, language }, namePath);
  if (!lookupResult) {
    return buildValidationError(namePath, newName, ERROR_MESSAGES.symbolNotFound(namePath));
  }

  const symbol = lookupResult.symbol;
  const oldName = symbol.name;

  const refResult = await findReferences(
    oldName,
    searchPath,
    filePath,
    symbol.location,
    { includeDefinition: true, filePatterns, excludePatterns },
  );

  const result: SymbolRenameResult = {
    oldName,
    newName,
    modifiedFiles: [],
    totalReferences: refResult.totalCount,
    diffs: new Map(),
    errors: [],
  };

  const refsByFile = new Map<string, typeof refResult.references>();
  for (const ref of refResult.references) {
    const refs = refsByFile.get(ref.filePath) ?? [];
    refs.push(ref);
    refsByFile.set(ref.filePath, refs);
  }

  const startTime = performance.now();
  const contentCache = new Map<string, string>();
  for (const [refFilePath, refs] of refsByFile) {
    const outcome = await processFileReferences(
      refFilePath,
      refs,
      oldName,
      newName,
      dryRun,
      contentCache,
    );
    if ("error" in outcome) {
      result.errors.push(outcome.error);
      continue;
    }
    result.diffs.set(refFilePath, outcome.diff);
    result.modifiedFiles.push(refFilePath);
  }

  observeHistogram("refactor_duration_ms", performance.now() - startTime, { operation: "rename_symbol" });
  incrementCounter("refactor_files_modified", { operation: "rename_symbol" }, result.modifiedFiles.length);
  return result;
}