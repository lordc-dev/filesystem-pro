/**
 * Reference Finder
 * 
 * Find all references to a symbol across files using ripgrep for initial
 * search and tree-sitter for precise location validation.
 *
 * Optimizations:
 * - Groups ripgrep results by file (1 read + 1 AST parse per file, not per match)
 * - Pre-computes line offset array (O(1) offset lookup vs O(n) scan)
 * - Reuses parsed tree for all matches within same file
 */

import fs from "fs/promises";
import type {
  SymbolReference,
  SymbolLocation,
  FindReferencesOptions,
  SupportedLanguage,
  ReferenceType} from "./types.js";
import {
  getLanguageFromPath,
} from "./types.js";
import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import { searchContent, globSearch } from "../search/index.js";
import { treeSitterManager } from "./tree-sitter-manager.js";
import { extractSymbols, flattenSymbols } from "./symbol-extractor.js";
import { escapeRegex } from "../utils/text-utils.js";
import { classifyReferenceType } from "./reference-classifier.js";
import picomatch from "picomatch";
import {
  DEFAULT_REFERENCE_EXCLUDE_PATTERNS,
  SUPPORTED_FILE_PATTERNS,
  FILE_ENCODING,
} from "../constants.js";

export { findUnusedSymbols } from "./unused-symbol-finder.js";

/**
 * Breakdown of reference counts by type
 */
export interface ReferenceCountsByType {
  call: number;
  import: number;
  export: number;
  type: number;
  new: number;
  assignment: number;
  property: number;
  argument: number;
  return: number;
  declaration: number;
  extends: number;
  implements: number;
  decorator: number;
  jsx: number;
  unknown: number;
}

/**
 * Result of a reference search
 */
export interface ReferenceSearchResult {
  symbolName: string;
  references: SymbolReference[];
  totalCount: number;
  filesWithReferences: string[];
  countsByType: ReferenceCountsByType;
  callCount: number;
}

function createEmptyCounts(): ReferenceCountsByType {
  return {
    call: 0, import: 0, export: 0, type: 0, new: 0, assignment: 0,
    property: 0, argument: 0, return: 0, declaration: 0, extends: 0,
    implements: 0, decorator: 0, jsx: 0, unknown: 0,
  };
}

/**
 * Find all references to a symbol in a directory
 *
 * Groups results by file so each file is read and parsed only once.
 * Pre-computes line offsets for O(1) offset lookups.
 */
export async function findReferences(
  symbolName: string,
  searchPath: string,
  definitionPath: string,
  definitionLocation: SymbolLocation,
  options: FindReferencesOptions = {}
): Promise<ReferenceSearchResult> {
  const {
    includeDefinition = true,
    excludePatterns = DEFAULT_REFERENCE_EXCLUDE_PATTERNS,
  } = options;

  const references: SymbolReference[] = [];
  const filesWithReferences = new Set<string>();
  const countsByType = createEmptyCounts();

  const searchResults = await searchContent(searchPath, `\\b${escapeRegex(symbolName)}\\b`, {
    pcre2: true,
  });

  // Group results by file to read + parse each file only once
  const resultsByFile = new Map<string, typeof searchResults>();
  for (const result of searchResults) {
    const fp = result.file;
    if (shouldExclude(fp, excludePatterns)) continue;
    if (!getLanguageFromPath(fp)) continue;
    const existing = resultsByFile.get(fp);
    if (existing) { existing.push(result); } else { resultsByFile.set(fp, [result]); }
  }

  // Process each file once
  for (const [filePath, fileResults] of resultsByFile) {
    const language = getLanguageFromPath(filePath)!;

    let content: string;
    try {
      content = await fs.readFile(filePath, FILE_ENCODING);
    } catch {
      continue;
    }

    // Parse AST once per file
    let tree: Tree;
    try {
      tree = await treeSitterManager.parse(content, language);
    } catch {
      continue;
    }

    // Pre-compute line offsets once per file
    const contentLines = content.split("\n");
    const lineOffsets = new Int32Array(contentLines.length + 1);
    for (let i = 1; i <= contentLines.length; i++) {
      lineOffsets[i] = lineOffsets[i - 1] + contentLines[i - 1].length + 1;
    }

    for (const result of fileResults) {
      const line = result.line || 0;
      const matchText = result.content || "";

      let column: number;
      if (result.submatches && result.submatches.length > 0) {
        column = result.submatches[0].start;
      } else {
        column = matchText.indexOf(symbolName);
      }

      if (column === -1) continue;

      const validation = validateReferenceWithTree(
        tree,
        contentLines,
        symbolName,
        line - 1,
        column
      );

      if (validation.isValid) {
        const isDefinition =
          filePath === definitionPath &&
          line - 1 === definitionLocation.startLine;

        if (!isDefinition || includeDefinition) {
          const referenceType = isDefinition ? "declaration" : validation.referenceType;
          const zeroIndexedLine = line - 1;
          const startOffset = lineOffsets[zeroIndexedLine] + column;

          references.push({
            filePath,
            location: {
              startLine: zeroIndexedLine,
              startColumn: column,
              endLine: zeroIndexedLine,
              endColumn: column + symbolName.length,
              startOffset,
              endOffset: startOffset + symbolName.length,
            },
            text: symbolName,
            context: matchText.trim(),
            isDefinition,
            referenceType,
          });
          countsByType[referenceType]++;
          filesWithReferences.add(filePath);
        }
      }
    }
  }

  references.sort((a, b) => {
    if (a.isDefinition && !b.isDefinition) return -1;
    if (!a.isDefinition && b.isDefinition) return 1;
    const fileCompare = (a.filePath || "").localeCompare(b.filePath || "");
    if (fileCompare !== 0) return fileCompare;
    return a.location.startLine - b.location.startLine;
  });

  return {
    symbolName,
    references,
    totalCount: references.length,
    filesWithReferences: Array.from(filesWithReferences),
    countsByType,
    callCount: countsByType.call + countsByType.new,
  };
}

/**
 * Find references to a symbol defined in a specific file
 */
export async function findReferencesFromDefinition(
  filePath: string,
  content: string,
  namePath: string,
  searchPath: string,
  options: FindReferencesOptions = {}
): Promise<ReferenceSearchResult> {
  const language = getLanguageFromPath(filePath);
  if (!language) {
    return {
      symbolName: namePath, references: [], totalCount: 0,
      filesWithReferences: [], countsByType: createEmptyCounts(), callCount: 0,
    };
  }

  const symbols = await extractSymbols(content, language);
  const flatSymbols = flattenSymbols(symbols);
  const symbol = flatSymbols.find(s => s.namePath === namePath);

  if (!symbol) {
    return {
      symbolName: namePath, references: [], totalCount: 0,
      filesWithReferences: [], countsByType: createEmptyCounts(), callCount: 0,
    };
  }

  return findReferences(symbol.name, searchPath, filePath, symbol.location, options);
}

// ============================================================================
// VALIDATION (synchronous — reuses pre-parsed tree)
// ============================================================================

interface ValidationResult {
  isValid: boolean;
  referenceType: ReferenceType;
}

/**
 * Validate a reference using a pre-parsed tree (no async, no re-parse).
 * Uses pre-split lines for O(1) access instead of content.split() per call.
 */
export function validateReferenceWithTree(
  tree: Tree,
  lines: string[],
  symbolName: string,
  line: number,
  column: number
): ValidationResult {
  try {
    const point = { row: line, column };
    const node = tree.rootNode.descendantForPosition(point);

    if (!node) {
      return { isValid: false, referenceType: "unknown" };
    }

    const originalNode = node;

    // Check if we're inside a comment or string
    let checkNode: SyntaxNode | null = node;
    while (checkNode) {
      const type = checkNode.type.toLowerCase();

      if (
        type.includes("comment") ||
        type === "line_comment" ||
        type === "block_comment"
      ) {
        return { isValid: false, referenceType: "unknown" };
      }

      if (
        type === "string" ||
        type === "string_literal" ||
        type === "template_string"
      ) {
        const parent = checkNode.parent;
        if (parent && !parent.type.includes("import")) {
          return { isValid: false, referenceType: "unknown" };
        }
      }

      checkNode = checkNode.parent;
    }

    // Verify the text at position matches
    if (line < lines.length) {
      const lineText = lines[line];
      const foundText = lineText.substring(column, column + symbolName.length);
      if (foundText !== symbolName) {
        return { isValid: false, referenceType: "unknown" };
      }
    }

    const referenceType = classifyReferenceType(originalNode);
    return { isValid: true, referenceType };
  } catch {
    return { isValid: false, referenceType: "unknown" };
  }
}

/**
 * Legacy async validator (kept for external consumers).
 * Prefer validateReferenceWithTree() when you already have a parsed tree.
 */
export async function validateReference(
  content: string,
  language: SupportedLanguage,
  symbolName: string,
  line: number,
  column: number
): Promise<ValidationResult> {
  try {
    const tree = await treeSitterManager.parse(content, language);
    const lines = content.split("\n");
    return validateReferenceWithTree(tree, lines, symbolName, line, column);
  } catch {
    return { isValid: false, referenceType: "unknown" };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function shouldExclude(filePath: string, patterns: readonly string[]): boolean {
  return picomatch.isMatch(filePath, [...patterns], { windows: false });
}

export async function getSearchableFiles(
  searchPath: string,
  options: FindReferencesOptions = {}
): Promise<string[]> {
  const {
    filePatterns = SUPPORTED_FILE_PATTERNS,
    excludePatterns = DEFAULT_REFERENCE_EXCLUDE_PATTERNS,
  } = options;

  return globSearch(filePatterns, {
    cwd: searchPath,
    ignore: excludePatterns,
    onlyFiles: true,
    absolute: true,
  });
}

export async function countReferences(
  symbolName: string,
  searchPath: string,
  _definitionPath: string,
  _definitionLocation: SymbolLocation,
  options: FindReferencesOptions = {}
): Promise<number> {
  const result = await findReferences(
    symbolName, searchPath, "",
    { startLine: -1, startColumn: 0, endLine: -1, endColumn: 0, startOffset: 0, endOffset: 0 },
    { ...options, includeDefinition: true }
  );
  return result.totalCount;
}
