import type { Symbol } from "./types.js";
import { getLanguageFromPath } from "./types.js";
import { searchContent } from "../search/index.js";
import { extractSymbols, flattenSymbols } from "./symbol-extractor.js";
import { escapeRegex } from "../utils/text-utils.js";

const UNUSED_SYMBOL_CONCURRENCY = 5;
const MAX_RIPGREP_PATTERN_LENGTH = 5000;

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
    let pattern: string;
    if (names.length === 1) {
      pattern = `\\b${names[0]}\\b`;
      try {
        const results = await searchContent(searchPath, pattern, { pcre2: true });
        for (const r of results) {
          const matchText = r.content || '';
          for (const sym of batch) {
            if (new RegExp(`\\b${escapeRegex(sym.name)}\\b`).test(matchText)) {
              symbolRefCount.set(sym.name, (symbolRefCount.get(sym.name) ?? 0) + 1);
            }
          }
        }
      } catch {
        for (const sym of batch) {
          try {
            const results = await searchContent(searchPath, `\\b${escapeRegex(sym.name)}\\b`, { pcre2: true });
            if (results.length > 0) symbolRefCount.set(sym.name, results.length);
          } catch { /* skip */ }
        }
      }
      continue;
    }

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

    for (const sp of subPatterns) {
      const rgPattern = `\\b(${sp})\\b`;
      try {
        const results = await searchContent(searchPath, rgPattern, { pcre2: true });
        for (const r of results) {
          const matchText = r.content || '';
          for (const sym of batch) {
            if (new RegExp(`\\b${escapeRegex(sym.name)}\\b`).test(matchText)) {
              symbolRefCount.set(sym.name, (symbolRefCount.get(sym.name) ?? 0) + 1);
            }
          }
        }
      } catch {
        for (const sym of batch) {
          try {
            const results = await searchContent(searchPath, `\\b${escapeRegex(sym.name)}\\b`, { pcre2: true });
            if (results.length > 0) symbolRefCount.set(sym.name, results.length);
          } catch { /* skip */ }
        }
      }
    }
  }

  return exportedSymbols.filter(sym => {
    const count = symbolRefCount.get(sym.name) ?? 0;
    return count <= 1;
  });
}