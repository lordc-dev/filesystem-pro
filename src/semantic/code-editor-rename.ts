/**
 * Code Editor - Rename Operations
 *
 * Global symbol rename across files with diff generation.
 */

import fs from "fs/promises";
import { getLanguageFromPath } from "./types.js";
import { FILE_ENCODING, ERROR_MESSAGES } from "../constants.js";
import { findSymbol } from "./symbol-lookup.js";
import { findReferences } from "./reference-finder.js";
import { createUnifiedDiff } from "../operations/diff-operations.js";
import { atomicWrite } from "../utils/fs-utils.js";
import { observeHistogram, incrementCounter } from "../utils/metrics.js";
import type { RenameOptions, SymbolRenameResult } from "./code-editor-types.js";

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

  const language = getLanguageFromPath(filePath);
  if (!language) {
    return {
      oldName: namePath,
      newName,
      modifiedFiles: [],
      totalReferences: 0,
      diffs: new Map(),
      errors: [ERROR_MESSAGES.unsupportedFileType(filePath)],
    };
  }

  const lookupResult = await findSymbol({ content, language }, namePath);
  if (!lookupResult) {
    return {
      oldName: namePath,
      newName,
      modifiedFiles: [],
      totalReferences: 0,
      diffs: new Map(),
      errors: [ERROR_MESSAGES.symbolNotFound(namePath)],
    };
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
          result.errors.push(`Could not read file: ${refFilePath}`);
          continue;
        }
      }

      refs.sort((a, b) => b.location.startOffset - a.location.startOffset);

      let modifiedContent = fileContent;
      for (const ref of refs) {
        const offset = ref.location.startOffset;
        modifiedContent =
          modifiedContent.substring(0, offset) +
          newName +
          modifiedContent.substring(offset + oldName.length);
      }

      const diff = createUnifiedDiff(fileContent, modifiedContent, refFilePath, {});
      result.diffs.set(refFilePath, diff);

      if (!dryRun) {
        await atomicWrite(refFilePath, modifiedContent);
        result.modifiedFiles.push(refFilePath);
      } else {
        result.modifiedFiles.push(refFilePath);
      }
    } catch (error: unknown) {
      result.errors.push(
        `Error processing ${refFilePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  observeHistogram("refactor_duration_ms", performance.now() - startTime, { operation: "rename_symbol" });
  incrementCounter("refactor_files_modified", { operation: "rename_symbol" }, result.modifiedFiles.length);
  return result;
}