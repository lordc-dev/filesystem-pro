/**
 * Deprecated Symbol Usage Finder
 *
 * Detects usages of deprecated symbols across the codebase.
 * Works like VSCode's linting - finds where deprecated APIs are being called,
 * not just where they are declared.
 *
 * @example
 * ```typescript
 * // Find all deprecated symbol usages in a directory
 * const report = await findDeprecatedUsages('/src');
 *
 * // Check a specific file for deprecated usages
 * const usages = await findDeprecatedUsagesInFile('/src/my-file.ts', content);
 * ```
 */

import fs from "fs/promises";
import path from "path";
import type {
  Symbol,
  SymbolLocation,
  SymbolReference} from "./types.js";
import {
  getLanguageFromPath,
} from "./types.js";
import { extractSymbols, flattenSymbols } from "./symbol-extractor.js";
import { findReferences } from "./reference-finder.js";
import { observeHistogram, incrementCounter } from "../utils/metrics.js";
import { globSearch } from "../search/index.js";
import {
  SUPPORTED_FILE_PATTERNS,
  DEFAULT_REFERENCE_EXCLUDE_PATTERNS,
  FILE_ENCODING,
} from "../constants.js";

/**
 * Information about a deprecated symbol
 */
export interface DeprecatedSymbol {
  /** Symbol name */
  name: string;
  /** Full name path (e.g., "MyClass/deprecatedMethod") */
  namePath: string;
  /** File where the symbol is defined */
  definitionFile: string;
  /** Location of the definition */
  definitionLocation: SymbolLocation;
  /** The deprecation JSDoc comment */
  deprecationNote: string;
  /** Reason extracted from the deprecation tag (if provided) */
  deprecationReason?: string;
}

/**
 * A usage of a deprecated symbol
 */
export interface DeprecatedUsage {
  /** The deprecated symbol being used */
  symbol: DeprecatedSymbol;
  /** Reference details */
  reference: SymbolReference;
}

/**
 * Options for finding deprecated usages
 */
export interface FindDeprecatedUsagesOptions {
  /** File patterns to include */
  filePatterns?: string[];
  /** Patterns to exclude */
  excludePatterns?: readonly string[];
  /** Include the definition itself in results */
  includeDefinitions?: boolean;
  /** Maximum files to scan (for performance) */
  maxFiles?: number;
}

/**
 * Result of deprecated usage search
 */
export interface DeprecatedUsageReport {
  /** All deprecated symbols found */
  deprecatedSymbols: DeprecatedSymbol[];
  /** All usages of deprecated symbols */
  usages: DeprecatedUsage[];
  /** Count by file */
  usagesByFile: Map<string, DeprecatedUsage[]>;
  /** Total usage count */
  totalUsageCount: number;
  /** Files scanned */
  filesScanned: number;
}

/**
 * Extract deprecation reason from JSDoc comment
 */
function extractDeprecationReason(doc: string): string | undefined {
  // Match @deprecated followed by optional text until end of line or next tag
  const match = doc.match(/@deprecated([^\n]*(?:\n(?!\s*@)[^\n]*)*)/i);
  if (match?.[1]) {
    // Clean up the extracted text
    return match[1]
      .replace(/\s+\*\/+\s*$/g, "") // Remove closing comment marker
      .replace(/\s+\/+\s*$/g, "") // Remove trailing slash
      .replace(/\s+\*\s*/g, " ") // Remove comment asterisks
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  }
  return undefined;
}

/**
 * Check if a symbol is marked as deprecated
 */
function isDeprecated(symbol: Symbol): boolean {
  const doc = symbol.metadata?.documentation;
  if (!doc) return false;
  return /@deprecated/i.test(doc);
}

/**
 * Find all deprecated symbols in a file
 */
export async function findDeprecatedSymbolsInFile(
  filePath: string,
  content: string
): Promise<DeprecatedSymbol[]> {
  const language = getLanguageFromPath(filePath);
  if (!language) {
    return [];
  }

  const symbols = await extractSymbols(content, language, {
    includeDocumentation: true,
  });
  const allSymbols = flattenSymbols(symbols);

  return allSymbols
    .filter(isDeprecated)
    .map((symbol) => ({
      name: symbol.name,
      namePath: symbol.namePath,
      definitionFile: filePath,
      definitionLocation: symbol.location,
      deprecationNote: symbol.metadata?.documentation ?? "",
      deprecationReason: extractDeprecationReason(
        symbol.metadata?.documentation ?? ""
      ),
    }));
}

/**
 * Find all deprecated symbols across a directory
 */
export async function findAllDeprecatedSymbols(
  searchPath: string,
  options: FindDeprecatedUsagesOptions = {}
): Promise<DeprecatedSymbol[]> {
  const {
    filePatterns = SUPPORTED_FILE_PATTERNS,
    excludePatterns = DEFAULT_REFERENCE_EXCLUDE_PATTERNS,
    maxFiles = 1000,
  } = options;

  // Find all source files
  const files = await globSearch(filePatterns, {
    cwd: searchPath,
    ignore: excludePatterns,
    onlyFiles: true,
    absolute: true,
  });

  const filesToScan = files.slice(0, maxFiles);
  const deprecatedSymbols: DeprecatedSymbol[] = [];
  const CONCURRENCY = 10;

  for (let i = 0; i < filesToScan.length; i += CONCURRENCY) {
    const batch = filesToScan.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        try {
          const content = await fs.readFile(filePath, FILE_ENCODING);
          return await findDeprecatedSymbolsInFile(filePath, content);
        } catch {
          return [];
        }
      })
    );
    for (const symbols of results) deprecatedSymbols.push(...symbols);
  }

  return deprecatedSymbols;
}

/**
 * Find all usages of deprecated symbols in a codebase
 *
 * This is the main function that works like VSCode's deprecated linting.
 * It finds all deprecated symbol declarations, then searches for their usages.
 */
export async function findDeprecatedUsages(
  searchPath: string,
  options: FindDeprecatedUsagesOptions = {}
): Promise<DeprecatedUsageReport> {
  const startTime = performance.now();
  const { includeDefinitions = false } = options;

  // Step 1: Find all deprecated symbols
  const deprecatedSymbols = await findAllDeprecatedSymbols(searchPath, options);

  // Step 2: For each deprecated symbol, find its usages (batched)
  const usages: DeprecatedUsage[] = [];
  const usagesByFile = new Map<string, DeprecatedUsage[]>();
  const REF_CONCURRENCY = 5;

  for (let i = 0; i < deprecatedSymbols.length; i += REF_CONCURRENCY) {
    const batch = deprecatedSymbols.slice(i, i + REF_CONCURRENCY);
    const refResults = await Promise.all(
      batch.map(ds => findReferences(
        ds.name, searchPath, ds.definitionFile, ds.definitionLocation,
        { includeDefinition: includeDefinitions, excludePatterns: options.excludePatterns }
      ))
    );
    for (let j = 0; j < batch.length; j++) {
      const deprecatedSymbol = batch[j];
      for (const ref of refResults[j].references) {
        if (ref.isDefinition && !includeDefinitions) continue;
        const usage: DeprecatedUsage = { symbol: deprecatedSymbol, reference: ref };
        usages.push(usage);
        const fileUsages = usagesByFile.get(ref.filePath) ?? [];
        fileUsages.push(usage);
        usagesByFile.set(ref.filePath, fileUsages);
      }
    }
  }

  observeHistogram("search_duration_ms", performance.now() - startTime, { operation: "find_deprecated_usages" });
  incrementCounter("search_deprecated_found", { operation: "find_deprecated_usages" }, usages.length);

  return {
    deprecatedSymbols,
    usages,
    usagesByFile,
    totalUsageCount: usages.length,
    filesScanned: new Set(deprecatedSymbols.map(s => s.definitionFile)).size,
  };
}

/**
 * Find deprecated usages in a specific file
 *
 * Checks if the given file uses any deprecated symbols from the codebase.
 */
export async function findDeprecatedUsagesInFile(
  filePath: string,
  content: string,
  searchPath: string,
  options: FindDeprecatedUsagesOptions = {}
): Promise<DeprecatedUsage[]> {
  // First find all deprecated symbols in the codebase
  const deprecatedSymbols = await findAllDeprecatedSymbols(searchPath, options);

  const usages: DeprecatedUsage[] = [];

  const matchingSymbols = deprecatedSymbols.filter(ds => {
    if (path.resolve(filePath) === path.resolve(ds.definitionFile)) {
      if (!options.includeDefinitions) return false;
    }
    return content.includes(ds.name);
  });

  const REF_BATCH = 5;
  for (let i = 0; i < matchingSymbols.length; i += REF_BATCH) {
    const batch = matchingSymbols.slice(i, i + REF_BATCH);
    const refResults = await Promise.all(
      batch.map(ds => findReferences(
        ds.name, path.dirname(filePath), ds.definitionFile, ds.definitionLocation,
        { includeDefinition: options.includeDefinitions, filePatterns: [filePath] }
      ))
    );
    for (let j = 0; j < batch.length; j++) {
      const ds = batch[j];
      for (const ref of refResults[j].references) {
        if (path.resolve(ref.filePath) === path.resolve(filePath)) {
          if (ref.isDefinition && !options.includeDefinitions) continue;
          usages.push({ symbol: ds, reference: ref });
        }
      }
    }
  }

  return usages;
}

/**
 * Format deprecated usages for display (like VSCode problems panel)
 */
export function formatDeprecatedUsagesReport(
  report: DeprecatedUsageReport
): string {
  const lines: string[] = [];

  lines.push(`Deprecated Symbol Usages`);
  lines.push(`========================`);
  lines.push(``);
  lines.push(`Found ${report.deprecatedSymbols.length} deprecated symbol(s)`);
  lines.push(`Found ${report.totalUsageCount} usage(s) across ${report.usagesByFile.size} file(s)`);
  lines.push(``);

  if (report.usages.length === 0) {
    lines.push(`No deprecated symbol usages found.`);
    return lines.join("\n");
  }

  // Group by deprecated symbol
  const usagesBySymbol = new Map<string, DeprecatedUsage[]>();
  for (const usage of report.usages) {
    const key = `${usage.symbol.definitionFile}:${usage.symbol.namePath}`;
    const existing = usagesBySymbol.get(key) ?? [];
    existing.push(usage);
    usagesBySymbol.set(key, existing);
  }

  for (const [, symbolUsages] of usagesBySymbol) {
    const symbol = symbolUsages[0].symbol;
    lines.push(`──────────────────────────────────────`);
    lines.push(`⚠️  ${symbol.namePath}`);
    lines.push(`    Defined in: ${symbol.definitionFile}:${symbol.definitionLocation.startLine + 1}`);
    if (symbol.deprecationReason) {
      lines.push(`    Reason: ${symbol.deprecationReason}`);
    }
    lines.push(`    Used ${symbolUsages.length} time(s):`);
    lines.push(``);

    for (const usage of symbolUsages) {
      const ref = usage.reference;
      const loc = ref.location;
      lines.push(
        `      ${ref.filePath}:${loc.startLine + 1}:${loc.startColumn + 1}`
      );
      if (ref.context) {
        lines.push(`        ${ref.context.trim()}`);
      }
    }
    lines.push(``);
  }

  return lines.join("\n");
}
