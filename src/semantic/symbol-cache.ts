/**
 * Symbol Cache - LRU Cache for parsed symbols and ASTs
 * 
 * Provides performance optimization by caching:
 * - Extracted symbols (keyed by content hash + options)
 * - Flattened symbol arrays (WeakMap for automatic cleanup)
 * 
 * Cache is automatically invalidated when content changes.
 */

import type { Symbol } from "./types.js";
import type { ExtractionOptions } from "./symbol-extractor.js";
import { getCacheTTL, getCacheSize, isCacheDisabled, CONTENT_THRESHOLDS } from "../constants.js";
import { fnv1aBase36 } from "../utils/hash-utils.js";
import { observeHistogram } from "../utils/metrics.js";

// ============================================================================
// LRU CACHE IMPLEMENTATION
// ============================================================================

/**
 * Simple LRU (Least Recently Used) cache with TTL support
 */
export class LRUCache<K, V> {
  private cache: Map<K, { value: V; timestamp: number }> = new Map();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private _hits = 0;
  private _misses = 0;

  constructor(options: { maxSize?: number; ttlMs?: number } = {}) {
    this.maxSize = options.maxSize ?? getCacheSize().SYMBOL_CACHE;
    this.ttlMs = options.ttlMs ?? getCacheTTL().SYMBOL_CACHE_MS;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this._misses++;
      this.cache.delete(key);
      return undefined;
    }

    this._hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this._hits = 0;
    this._misses = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get hits(): number {
    return this._hits;
  }

  get misses(): number {
    return this._misses;
  }

  get hitRate(): number {
    const total = this._hits + this._misses;
    return total > 0 ? this._hits / total : 0;
  }

  getStats(): { size: number; maxSize: number; ttlMs: number; hits: number; misses: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      hits: this._hits,
      misses: this._misses,
      hitRate: this.hitRate,
    };
  }
}

// ============================================================================
// CONTENT HASHING
// ============================================================================

/**
 * Create a fast hash of content for cache keys
 * Uses first/last chunks + length for speed on large files
 */
export function hashContent(content: string): string {
  if (content.length < CONTENT_THRESHOLDS.SMALL_FILE_BYTES) {
    return fnv1aBase36(content);
  }
  const sampleSize = CONTENT_THRESHOLDS.SAMPLE_SIZE_BYTES;
  const midStart = Math.floor((content.length - sampleSize) / 2);
  const sample =
    content.slice(0, sampleSize) +
    content.slice(midStart, midStart + sampleSize) +
    content.slice(-sampleSize) +
    content.length.toString();
  return fnv1aBase36(sample);
}

/**
 * Create a cache key from content, language, and options
 */
export function createSymbolCacheKey(
  content: string,
  language: string,
  options?: ExtractionOptions
): string {
  const contentHash = hashContent(content);
  const optionsHash = options 
    ? fnv1aBase36(JSON.stringify(options)).slice(0, 8)
    : "default";
  
  return `${language}:${contentHash}:${optionsHash}`;
}

// ============================================================================
// SYMBOL CACHE SINGLETON
// ============================================================================

// ============================================================================
// CACHE CONFIGURATION (via constants.ts SSOT)
// ============================================================================

/**
 * Cache configuration (uses centralized constants from constants.ts)
 * 
 * Environment Variables (processed in constants.ts):
 * - MCP_SYMBOL_CACHE_SIZE: Max cached symbol sets (default: 100)
 * - MCP_SYMBOL_CACHE_TTL: TTL in milliseconds (default: 60000)
 * - MCP_isCacheDisabled(): Set to "true" to disable caching
 */
export const CACHE_CONFIG = {
  symbolCacheSize: getCacheSize().SYMBOL_CACHE,
  symbolCacheTtl: getCacheTTL().SYMBOL_CACHE_MS,
  disabled: isCacheDisabled(),
};

/**
 * Global symbol cache instance
 * 
 * Configuration via environment (see constants.ts for SSOT):
 * - MCP_SYMBOL_CACHE_SIZE=100 (increase for large projects)
 * - MCP_SYMBOL_CACHE_TTL=60000 (increase for stable codebases)
 * - MCP_isCacheDisabled()=true (disable for debugging)
 */
export const symbolCache = new LRUCache<string, Symbol[]>({
  maxSize: getCacheSize().SYMBOL_CACHE,
  ttlMs: getCacheTTL().SYMBOL_CACHE_MS,
});

// ============================================================================
// FLATTEN CACHE (WeakMap for automatic cleanup)
// ============================================================================

/**
 * WeakMap cache for flattened symbols
 * Automatically cleaned up when symbol array is garbage collected
 */
const flattenCache = new WeakMap<Symbol[], Symbol[]>();

/**
 * Get or compute flattened symbols with caching
 */
export function getCachedFlatten(symbols: Symbol[]): Symbol[] {
  const cached = flattenCache.get(symbols);
  if (cached) return cached;

  // Compute flatten
  const flat: Symbol[] = [];
  function traverse(syms: Symbol[]) {
    for (const sym of syms) {
      flat.push(sym);
      if (sym.children.length > 0) {
        traverse(sym.children);
      }
    }
  }
  traverse(symbols);

  flattenCache.set(symbols, flat);
  return flat;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all symbol caches
 * Call this when you need to ensure fresh data
 */
export function clearSymbolCaches(): void {
  symbolCache.clear();
  // WeakMap clears automatically via GC
}

/**
 * Get cache statistics for debugging
 */
export function getSymbolCacheStats(): {
  symbolCache: { size: number; maxSize: number; ttlMs: number; hits: number; misses: number; hitRate: number };
} {
  return {
    symbolCache: symbolCache.getStats(),
  };
}
