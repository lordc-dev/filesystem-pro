/**
 * Symbol Lookup API - SSOT for ALL symbol finding operations
 *
 * Supports exact match and pattern-based searching.
 * Pattern matching delegated to symbol-matcher.ts.
 * String literal search delegated to string-literal-finder.ts.
 */

import type { Symbol, SymbolKind, SupportedLanguage } from "./types.js";
import {
  extractSymbols,
  flattenSymbols,
  getSymbolBody,
  getSymbolText,
} from "./symbol-extractor.js";
import { SymbolNotFoundError } from "../errors/index.js";
import {
  matchesDepth,
  matchesKind,
  matchPattern,
  buildNamePathMap,
} from "./symbol-matcher.js";

export {
  StringLiteralResult,
  StringLiteralOptions,
  findStringLiterals,
  findStringIdentifiers,
} from "./string-literal-finder.js";

// ============================================================================
// TYPES
// ============================================================================

export type LookupSource =
  | Symbol[]
  | { content: string; language: SupportedLanguage };

export interface LookupOptions {
  includeBody?: boolean;
  includeFullText?: boolean;
  exactMatch?: boolean;
  ignoreCase?: boolean;
  substringMatch?: boolean;
  kinds?: SymbolKind[];
  depth?: number;
}

export interface LookupResult {
  symbol: Symbol;
  body?: string;
  fullText?: string;
  score?: number;
  filePath?: string;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function resolveSymbols(source: LookupSource): Promise<{
  symbols: Symbol[];
  sourceContent?: string;
}> {
  if (Array.isArray(source)) {
    return { symbols: source };
  }

  const symbols = await extractSymbols(source.content, source.language);
  return { symbols, sourceContent: source.content };
}

function enrichResult(
  result: LookupResult,
  sourceContent: string | undefined,
  options: LookupOptions
): LookupResult {
  if (!sourceContent) return result;

  if (options.includeBody) {
    result.body = getSymbolBody(result.symbol, sourceContent);
  }
  if (options.includeFullText) {
    result.fullText = getSymbolText(result.symbol, sourceContent);
  }

  return result;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function findSymbol(
  source: LookupSource,
  pattern: string,
  options: LookupOptions = {}
): Promise<LookupResult | undefined> {
  const { exactMatch = true } = options;
  const { symbols, sourceContent } = await resolveSymbols(source);
  const flat = flattenSymbols(symbols);

  if (exactMatch && !pattern.includes("*")) {
    const symbolMap = buildNamePathMap(flat);
    const symbol = symbolMap.get(pattern);
    if (!symbol) return undefined;

    return enrichResult({ symbol }, sourceContent, options);
  }

  const results = await findSymbolsInternal(flat, pattern, options, sourceContent);
  return results[0];
}

export async function findSymbols(
  source: LookupSource,
  pattern: string,
  options: LookupOptions = {}
): Promise<LookupResult[]> {
  const { symbols, sourceContent } = await resolveSymbols(source);
  const flat = flattenSymbols(symbols);

  return findSymbolsInternal(flat, pattern, options, sourceContent);
}

async function findSymbolsInternal(
  flatSymbols: Symbol[],
  pattern: string,
  options: LookupOptions,
  sourceContent?: string
): Promise<LookupResult[]> {
  const results: LookupResult[] = [];

  for (const symbol of flatSymbols) {
    if (!matchesDepth(symbol, options.depth)) continue;
    if (!matchesKind(symbol, options.kinds)) continue;

    const { matches, score } = matchPattern(symbol, pattern, options);

    if (matches) {
      const result: LookupResult = { symbol, score };
      results.push(enrichResult(result, sourceContent, options));
    }
  }

  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return results;
}

export async function findSymbolOrThrow(
  source: LookupSource,
  pattern: string,
  options: LookupOptions = {}
): Promise<LookupResult> {
  const result = await findSymbol(source, pattern, options);
  if (!result) {
    throw new SymbolNotFoundError(pattern);
  }
  return result;
}

export async function hasSymbol(
  source: LookupSource,
  pattern: string,
  options: LookupOptions = {}
): Promise<boolean> {
  const result = await findSymbol(source, pattern, options);
  return result !== undefined;
}

export async function lookupSymbols(
  source: LookupSource,
  namePaths: string[],
  options: LookupOptions = {}
): Promise<Map<string, LookupResult>> {
  const results = new Map<string, LookupResult>();
  const { symbols, sourceContent } = await resolveSymbols(source);
  const flat = flattenSymbols(symbols);

  const symbolMap = buildNamePathMap(flat);

  for (const namePath of namePaths) {
    const symbol = symbolMap.get(namePath);
    if (symbol) {
      const result: LookupResult = { symbol };
      results.set(namePath, enrichResult(result, sourceContent, options));
    }
  }

  return results;
}

export async function findSymbolsByKind(
  source: LookupSource,
  kinds: SymbolKind[],
  options: Omit<LookupOptions, "kinds"> = {}
): Promise<LookupResult[]> {
  return findSymbols(source, "*", { ...options, kinds });
}

export async function getTopLevelSymbols(
  source: LookupSource,
  options: LookupOptions = {}
): Promise<LookupResult[]> {
  return findSymbols(source, "*", { ...options, depth: 0 });
}

// ============================================================================
// POSITION-BASED
// ============================================================================

export async function getSymbolAtPosition(
  source: LookupSource,
  line: number,
  column: number
): Promise<LookupResult | undefined> {
  const { symbols, sourceContent } = await resolveSymbols(source);
  const flatSymbols = flattenSymbols(symbols);

  let bestMatch: Symbol | undefined;
  let smallestRange = Infinity;

  for (const symbol of flatSymbols) {
    const loc = symbol.location;

    if (
      (line > loc.startLine || (line === loc.startLine && column >= loc.startColumn)) &&
      (line < loc.endLine || (line === loc.endLine && column <= loc.endColumn))
    ) {
      const range = loc.endOffset - loc.startOffset;
      if (range < smallestRange) {
        smallestRange = range;
        bestMatch = symbol;
      }
    }
  }

  if (!bestMatch) return undefined;

  const result: LookupResult = { symbol: bestMatch };
  return enrichResult(result, sourceContent, {});
}

export async function getSymbolChildren(
  source: LookupSource,
  parentPath: string
): Promise<LookupResult[]> {
  const { symbols, sourceContent } = await resolveSymbols(source);
  const flat = flattenSymbols(symbols);
  const symbolMap = buildNamePathMap(flat);
  const parent = symbolMap.get(parentPath);

  if (!parent?.children) return [];

  return parent.children.map(child =>
    enrichResult({ symbol: child }, sourceContent, {})
  );
}