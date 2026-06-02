/**
 * File Statistics Module
 * 
 * Provides file analysis for line counts, symbol counts, and summary generation.
 * Reuses existing semantic analysis infrastructure.
 * 
 * @example
 * import { getFileStats, getFileSummary } from './file-stats';
 * 
 * const stats = await getFileStats(filePath, content, 'typescript');
 * console.log(getFileSummary(stats));
 */

import { extractSymbols, flattenSymbols } from "./symbol-extractor.js";
import { extractImports } from "./import-analyzer.js";
import { SymbolKind, type SupportedLanguage, type Symbol } from "./types.js";

/**
 * Line count statistics
 */
export interface LineStats {
  total: number;
  code: number;
  blank: number;
  comment: number;
}

/**
 * Symbol count statistics by type
 */
export interface SymbolStats {
  functions: number;
  classes: number;
  interfaces: number;
  types: number;
  variables: number;
  constants: number;
  enums: number;
  methods: number;
  total: number;
}

/**
 * Complete file statistics
 */
export interface FileStats {
  path: string;
  language: SupportedLanguage;
  lines: LineStats;
  symbols: SymbolStats;
  imports: {
    count: number;
    sources: string[];
  };
  exports: {
    count: number;
    names: string[];
  };
}

/**
 * Count lines in content, categorizing into code, blank, and comment lines
 */
function countLines(content: string, language: SupportedLanguage): LineStats {
  const lines = content.split("\n");
  let code = 0;
  let blank = 0;
  let comment = 0;
  let inBlockComment = false;

  // Comment patterns by language
  const lineCommentPattern = language === "python" ? /^\s*#/ : /^\s*\/\//;
  const blockCommentStart = language === "python" ? /^\s*['"""]{3}/ : /^\s*\/\*/;
  const blockCommentEnd = language === "python" ? /['"""]{3}\s*$/ : /\*\/\s*$/;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      blank++;
      continue;
    }

    // Handle block comments
    if (inBlockComment) {
      comment++;
      if (blockCommentEnd.test(trimmed)) {
        inBlockComment = false;
      }
      continue;
    }

    if (blockCommentStart.test(trimmed)) {
      comment++;
      // Check if block comment ends on same line
      if (!blockCommentEnd.test(trimmed) || trimmed.match(blockCommentStart)![0] === trimmed.match(blockCommentEnd)?.[0]) {
        inBlockComment = !blockCommentEnd.test(trimmed.slice(trimmed.match(blockCommentStart)![0].length));
      }
      continue;
    }

    // Single-line comments
    if (lineCommentPattern.test(trimmed)) {
      comment++;
      continue;
    }

    code++;
  }

  return {
    total: lines.length,
    code,
    blank,
    comment,
  };
}

/**
 * Count symbols by kind
 */
function countSymbols(symbols: Symbol[]): SymbolStats {
  const flat = flattenSymbols(symbols);
  
  let functions = 0;
  let classes = 0;
  let interfaces = 0;
  let types = 0;
  let variables = 0;
  let constants = 0;
  let enums = 0;
  let methods = 0;

  for (const symbol of flat) {
    switch (symbol.kind) {
      case SymbolKind.Function:
        functions++;
        break;
      case SymbolKind.Class:
        classes++;
        break;
      case SymbolKind.Interface:
        interfaces++;
        break;
      case SymbolKind.TypeParameter:
        types++;
        break;
      case SymbolKind.Variable:
        variables++;
        break;
      case SymbolKind.Constant:
        constants++;
        break;
      case SymbolKind.Enum:
        enums++;
        break;
      case SymbolKind.Method:
      case SymbolKind.Constructor:
        methods++;
        break;
    }
  }

  return {
    functions,
    classes,
    interfaces,
    types,
    variables,
    constants,
    enums,
    methods,
    total: flat.length,
  };
}

/**
 * Find exported symbols from the symbol tree
 */
function findExportedSymbols(symbols: Symbol[]): string[] {
  const exports: string[] = [];
  const flat = flattenSymbols(symbols);
  
  for (const symbol of flat) {
    // Check if symbol has export modifier in metadata or name
    if (symbol.metadata?.isExported) {
      exports.push(symbol.name);
    }
  }
  
  return exports;
}

/**
 * Get comprehensive statistics for a source file
 */
export async function getFileStats(
  filePath: string,
  content: string,
  language: SupportedLanguage
): Promise<FileStats> {
  const [symbols, importResult] = await Promise.all([
    extractSymbols(content, language),
    extractImports(content, language),
  ]);
  const exportedNames = findExportedSymbols(symbols);

  return {
    path: filePath,
    language,
    lines: countLines(content, language),
    symbols: countSymbols(symbols),
    imports: {
      count: importResult.count,
      sources: importResult.imports.map(imp => imp.source),
    },
    exports: {
      count: exportedNames.length,
      names: exportedNames,
    },
  };
}


/**
 * Batch result for multiple file stats
 */
export interface BatchFileStatsResult {
  results: Map<string, FileStats>;
  errors: Map<string, Error>;
  successCount: number;
  errorCount: number;
}

/**
 * Get file statistics for multiple files in parallel
 * 
 * @param files - Array of {path, content, language} objects
 * @param options - Batch processing options
 * @returns BatchFileStatsResult with results and errors
 * 
 * @example
 * const result = await batchGetFileStats([
 *   { path: 'src/a.ts', content: '...', language: 'typescript' },
 *   { path: 'src/b.ts', content: '...', language: 'typescript' },
 * ]);
 * console.log(`Success: ${result.successCount}, Errors: ${result.errorCount}`);
 */
export async function batchGetFileStats(
  files: Array<{ path: string; content: string; language: SupportedLanguage }>,
  options: { concurrency?: number } = {}
): Promise<BatchFileStatsResult> {
  const concurrency = options.concurrency ?? 5;
  const results = new Map<string, FileStats>();
  const errors = new Map<string, Error>();

  // Process in batches for controlled concurrency
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const promises = batch.map(async (file) => {
      try {
        const stats = await getFileStats(file.path, file.content, file.language);
        results.set(file.path, stats);
      } catch (error: unknown) {
        errors.set(file.path, error instanceof Error ? error : new Error(String(error)));
      }
    });
    await Promise.all(promises);
  }

  return {
    results,
    errors,
    successCount: results.size,
    errorCount: errors.size,
  };
}


/**
 * Generate a human-readable summary of file statistics
 */
export function getFileSummary(stats: FileStats): string {
  const lines: string[] = [];
  
  lines.push(`File: ${stats.path}`);
  lines.push(`Language: ${stats.language}`);
  lines.push("");
  
  // Line stats
  lines.push("Lines:");
  lines.push(`  Total: ${stats.lines.total}`);
  lines.push(`  Code: ${stats.lines.code} (${Math.round(stats.lines.code / stats.lines.total * 100)}%)`);
  lines.push(`  Blank: ${stats.lines.blank}`);
  lines.push(`  Comment: ${stats.lines.comment}`);
  lines.push("");
  
  // Symbol stats
  lines.push("Symbols:");
  if (stats.symbols.classes > 0) lines.push(`  Classes: ${stats.symbols.classes}`);
  if (stats.symbols.interfaces > 0) lines.push(`  Interfaces: ${stats.symbols.interfaces}`);
  if (stats.symbols.functions > 0) lines.push(`  Functions: ${stats.symbols.functions}`);
  if (stats.symbols.methods > 0) lines.push(`  Methods: ${stats.symbols.methods}`);
  if (stats.symbols.variables > 0) lines.push(`  Variables: ${stats.symbols.variables}`);
  if (stats.symbols.constants > 0) lines.push(`  Constants: ${stats.symbols.constants}`);
  if (stats.symbols.enums > 0) lines.push(`  Enums: ${stats.symbols.enums}`);
  if (stats.symbols.types > 0) lines.push(`  Types: ${stats.symbols.types}`);
  lines.push(`  Total: ${stats.symbols.total}`);
  lines.push("");
  
  // Imports
  lines.push(`Imports: ${stats.imports.count}`);
  if (stats.imports.sources.length > 0 && stats.imports.sources.length <= 10) {
    for (const source of stats.imports.sources) {
      lines.push(`  - ${source}`);
    }
  } else if (stats.imports.sources.length > 10) {
    for (const source of stats.imports.sources.slice(0, 5)) {
      lines.push(`  - ${source}`);
    }
    lines.push(`  ... and ${stats.imports.sources.length - 5} more`);
  }
  lines.push("");
  
  // Exports
  lines.push(`Exports: ${stats.exports.count}`);
  if (stats.exports.names.length > 0 && stats.exports.names.length <= 10) {
    for (const name of stats.exports.names) {
      lines.push(`  - ${name}`);
    }
  } else if (stats.exports.names.length > 10) {
    for (const name of stats.exports.names.slice(0, 5)) {
      lines.push(`  - ${name}`);
    }
    lines.push(`  ... and ${stats.exports.names.length - 5} more`);
  }
  
  return lines.join("\n");
}

/**
 * Quick count of total symbols without detailed breakdown
 */
export function countTotalSymbols(symbols: Symbol[]): number {
  return flattenSymbols(symbols).length;
}
