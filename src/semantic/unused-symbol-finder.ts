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
  for (const r of results) {
    const matchText = r.content || '';
    for (const sym of batch) {
      if (new RegExp(`\\b${escapeRegex(sym.name)}\\b`).test(matchText)) {
        symbolRefCount.set(sym.name, (symbolRefCount.get(sym.name) ?? 0) + 1);
      }
    }
  }
}

async function searchSingleSymbol(
  sym: Symbol,
  searchPath: string,
  symbolRefCount: Map<string, number>,
): Promise<void> {
  try {
    const results = await searchContent(searchPath, `\\b${escapeRegex(sym.name)}\\b`, { pcre2: true });
    if (results.length > 0) symbolRefCount.set(sym.name, results.length);
  } catch { /* skip */ }
}

async function searchBatchPattern(
  searchPath: string,
  rgPattern: string,
  batch: Symbol[],
  symbolRefCount: Map<string, number>,
): Promise<void> {
  try {
    const results = await searchContent(searchPath, rgPattern, { pcre2: true });
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