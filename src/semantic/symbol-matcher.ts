import type { Symbol, SymbolKind } from "./types.js";
import { escapeRegex } from "../utils/text-utils.js";

export type { LookupSource, LookupOptions, LookupResult } from "./symbol-lookup.js";

export function parseNamePath(pattern: string): { parts: string[]; isAbsolute: boolean } {
  const isAbsolute = pattern.startsWith("/");
  const cleanPattern = isAbsolute ? pattern.slice(1) : pattern;
  const parts = cleanPattern.split("/").filter(p => p.length > 0);
  return { parts, isAbsolute };
}

export function matchesPart(
  actual: string,
  pattern: string,
  options: { ignoreCase?: boolean; substringMatch?: boolean }
): boolean {
  let actualStr = actual;
  let patternStr = pattern;

  if (options.ignoreCase) {
    actualStr = actual.toLowerCase();
    patternStr = pattern.toLowerCase();
  }
  if (patternStr.includes("*")) {
    // Split on wildcards, escape each part individually, then join with .*
    const parts = patternStr.split("*");
    const escaped = parts.map((p) => escapeRegex(p)).join(".*");
    const regex = new RegExp(
      "^" + escaped + "$",
      options.ignoreCase ? "i" : ""
    );
    return regex.test(actualStr);
  }

  if (options.substringMatch) {
    return actualStr.includes(patternStr);
  }

  return actualStr === patternStr;
}

export function matchesDepth(symbol: Symbol, depth?: number): boolean {
  if (depth === undefined) return true;
  const symbolDepth = symbol.namePath.split("/").length - 1;
  return symbolDepth <= depth;
}

export function matchesKind(symbol: Symbol, kinds?: SymbolKind[]): boolean {
  if (!kinds || kinds.length === 0) return true;
  return kinds.includes(symbol.kind);
}

export function matchPattern(
  symbol: Symbol,
  pattern: string,
  options: { ignoreCase?: boolean; substringMatch?: boolean; depth?: number; kinds?: SymbolKind[] }
): { matches: boolean; score: number } {
  if (!matchesDepth(symbol, options.depth)) return { matches: false, score: 0 };
  if (!matchesKind(symbol, options.kinds)) return { matches: false, score: 0 };

  const { parts, isAbsolute } = parseNamePath(pattern);

  if (parts.length === 0) {
    return { matches: false, score: 0 };
  }

  const symbolParts = symbol.namePath.split("/");

  if (isAbsolute) {
    if (symbolParts.length !== parts.length) {
      return { matches: false, score: 0 };
    }

    for (let i = 0; i < parts.length; i++) {
      if (!matchesPart(symbolParts[i], parts[i], options)) {
        return { matches: false, score: 0 };
      }
    }

    return { matches: true, score: 100 };
  }

  if (parts.length === 1) {
    const targetPart = parts[0];

    if (matchesPart(symbol.name, targetPart, options)) {
      return { matches: true, score: 90 - symbolParts.length * 5 };
    }

    if (options.substringMatch) {
      const pathStr = options.ignoreCase
        ? symbol.namePath.toLowerCase()
        : symbol.namePath;
      const targetStr = options.ignoreCase
        ? targetPart.toLowerCase()
        : targetPart;

      if (pathStr.includes(targetStr)) {
        return { matches: true, score: 50 };
      }
    }

    return { matches: false, score: 0 };
  }

  const patternLen = parts.length;

  if (symbolParts.length >= patternLen) {
    const suffix = symbolParts.slice(-patternLen);
    let allMatch = true;

    for (let i = 0; i < patternLen; i++) {
      if (!matchesPart(suffix[i], parts[i], options)) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      const depthBonus = symbolParts.length === patternLen ? 10 : 0;
      return { matches: true, score: 80 + depthBonus };
    }
  }

  for (let i = 0; i <= symbolParts.length - patternLen; i++) {
    const slice = symbolParts.slice(i, i + patternLen);
    let allMatch = true;

    for (let j = 0; j < patternLen; j++) {
      if (!matchesPart(slice[j], parts[j], options)) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      return { matches: true, score: 60 };
    }
  }

  return { matches: false, score: 0 };
}

export function buildNamePathMap(flatSymbols: Symbol[]): Map<string, Symbol> {
  const map = new Map<string, Symbol>();
  for (const s of flatSymbols) map.set(s.namePath, s);
  return map;
}