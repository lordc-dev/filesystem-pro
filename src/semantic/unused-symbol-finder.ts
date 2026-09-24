import type { Symbol } from "./types.js";
import { getLanguageFromPath } from "./types.js";
import { searchContent } from "../search/index.js";
import { extractSymbols, flattenSymbols } from "./symbol-extractor.js";
import { escapeRegex } from "../utils/text-utils.js";
import { UNUSED_SYMBOL_CONCURRENCY, MAX_RIPGREP_PATTERN_LENGTH } from "../constants.js";
import type { ContentSearchResult } from "../search/ripgrep-types.js";

function countReferencesInResults(
  results: ContentSearchResult[],
  batch: Symbol[],
  symbolRefCount: Map<string, number>,
): void {
  // rg submatches carry the exact matched text — 1 Map lookup per result
  // instead of regex.test per result x symbol
  const names = new Set(batch.map(sym => sym.name));
  for (const r of results) {
    for (const sm of r.submatches ?? []) {
      if (names.has(sm.text)) {
        symbolRefCount.set(sm.text, (symbolRefCount.get(sm.text) ?? 0) + 1);
      }
    }
  }
}

import { logger } from "../utils/logger.js";

async function searchSingleSymbol(
  sym: Symbol,
  searchPath: string,
  symbolRefCount: Map<string, number>,
): Promise<void> {
  try {
    const results = (await searchContent(searchPath, `\\b${escapeRegex(sym.name)}\\b`)).results;
    if (results.length > 0) symbolRefCount.set(sym.name, results.length);
  } catch (err: unknown) {
    logger.debug(`searchSingleSymbol failed for ${sym.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function searchBatchPattern(
  searchPath: string,
  rgPattern: string,
  batch: Symbol[],
  symbolRefCount: Map<string, number>,
): Promise<void> {
  try {
    const results = (await searchContent(searchPath, rgPattern)).results;
    countReferencesInResults(results, batch, symbolRefCount);
  } catch {
    await Promise.all(batch.map(sym => searchSingleSymbol(sym, searchPath, symbolRefCount)));
  }
}

function splitAlternationPattern(names: string[]): string[] {
  const subPatterns: string[] = [];
  let current = '';
  for (const name of names) {
    const alt = current ? `|${name}` : name;
    if (current.length + alt.length > MAX_RIPGREP_PATTERN_LENGTH && current) {
      subPatterns.push(current);
      current = name;
    } else {
      current += alt;
    }
  }
  if (current) subPatterns.push(current);
  return subPatterns;
}

export async function findUnusedSymbols(
  filePath: string,
  content: string,
  searchPath: string
): Promise<Symbol[]> {
  const language = getLanguageFromPath(filePath);
  if (!language) return [];

  const symbols = await extractSymbols(content, language);
  const exportedSymbols = flattenSymbols(symbols).filter(s => s.metadata?.isExported);
  if (exportedSymbols.length === 0) return [];

  const symbolRefCount = new Map<string, number>();

  for (let i = 0; i < exportedSymbols.length; i += UNUSED_SYMBOL_CONCURRENCY) {
    const batch = exportedSymbols.slice(i, i + UNUSED_SYMBOL_CONCURRENCY);
    const names = batch.map(s => escapeRegex(s.name));

    if (names.length === 1) {
      const pattern = `\\b${names[0]}\\b`;
      await searchBatchPattern(searchPath, pattern, batch, symbolRefCount);
      continue;
    }

    const subPatterns = splitAlternationPattern(names);
    for (const sp of subPatterns) {
      await searchBatchPattern(searchPath, `\\b(${sp})\\b`, batch, symbolRefCount);
    }
  }

  return exportedSymbols.filter(sym => (symbolRefCount.get(sym.name) ?? 0) <= 1);
}