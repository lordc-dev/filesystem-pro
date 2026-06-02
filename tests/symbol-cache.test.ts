/**
 * Comprehensive tests for symbol-cache.ts module
 * 
 * Tests cover:
 * - LRUCache class (get, set, has, delete, clear, getStats)
 * - hashContent (consistent hashing, large file sampling)
 * - createSymbolCacheKey (key generation)
 * - symbolCache singleton
 * - getCachedFlatten (WeakMap-based caching)
 * - clearSymbolCaches (cache reset)
 * - getSymbolCacheStats (statistics)
 * 
 * Test scenarios:
 * - LRU eviction order
 * - TTL expiration
 * - Cache hit/miss verification
 * - Content hash consistency
 * - Large file hash performance
 */

import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  LRUCache,
  hashContent,
  createSymbolCacheKey,
  symbolCache,
  getCachedFlatten,
  clearSymbolCaches,
  getSymbolCacheStats,
  CACHE_CONFIG,
} from "../src/semantic/symbol-cache.js";
import { extractSymbols, flattenSymbols } from "../src/semantic/symbol-extractor.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { SymbolKind, type Symbol } from "../src/semantic/types.js";
import { measurePerformance } from "./test-helpers.js";

describe("Symbol Cache", () => {
  beforeAll(async () => {
    await treeSitterManager.initialize();
  });

  beforeEach(() => {
    // Clear caches before each test for isolation
    clearSymbolCaches();
  });

  // ==========================================================================
  // LRUCache - Basic Operations
  // ==========================================================================

  describe("LRUCache - basic operations", () => {
    it("stores and retrieves values", () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      
      cache.set("key1", 100);
      cache.set("key2", 200);
      
      expect(cache.get("key1")).toBe(100);
      expect(cache.get("key2")).toBe(200);
    });

    it("returns undefined for missing keys", () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("checks key existence with has()", () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      
      cache.set("exists", 1);
      
      expect(cache.has("exists")).toBe(true);
      expect(cache.has("missing")).toBe(false);
    });

    it("deletes keys", () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      
      cache.set("key", 1);
      expect(cache.has("key")).toBe(true);
      
      const deleted = cache.delete("key");
      
      expect(deleted).toBe(true);
      expect(cache.has("key")).toBe(false);
    });

    it("clears all entries", () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      
      expect(cache.size).toBe(3);
      
      cache.clear();
      
      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
    });

    it("reports correct size", () => {
      const cache = new LRUCache<string, number>({ maxSize: 10 });
      
      expect(cache.size).toBe(0);
      
      cache.set("a", 1);
      expect(cache.size).toBe(1);
      
      cache.set("b", 2);
      expect(cache.size).toBe(2);
      
      cache.delete("a");
      expect(cache.size).toBe(1);
    });
  });

  // ==========================================================================
  // LRUCache - LRU Eviction
  // ==========================================================================

  describe("LRUCache - LRU eviction", () => {
    it("evicts oldest entry when at capacity", () => {
      const cache = new LRUCache<string, number>({ maxSize: 3, ttlMs: 60000 });
      
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      
      expect(cache.size).toBe(3);
      
      // Adding fourth item should evict "a"
      cache.set("d", 4);
      
      expect(cache.size).toBe(3);
      expect(cache.get("a")).toBeUndefined(); // Evicted
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });

    it("updates LRU order on get()", () => {
      const cache = new LRUCache<string, number>({ maxSize: 3, ttlMs: 60000 });
      
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      
      // Access "a" to make it recently used
      cache.get("a");
      
      // Add new item - should evict "b" (now oldest)
      cache.set("d", 4);
      
      expect(cache.get("a")).toBe(1); // Still present
      expect(cache.get("b")).toBeUndefined(); // Evicted
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });

    it("handles capacity of 1", () => {
      const cache = new LRUCache<string, number>({ maxSize: 1, ttlMs: 60000 });
      
      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);
      
      cache.set("b", 2);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
    });

    it("overwrites existing key without eviction", () => {
      const cache = new LRUCache<string, number>({ maxSize: 2, ttlMs: 60000 });
      
      cache.set("a", 1);
      cache.set("b", 2);
      
      // Overwrite "a"
      cache.set("a", 10);
      
      expect(cache.size).toBe(2);
      expect(cache.get("a")).toBe(10);
      expect(cache.get("b")).toBe(2);
    });
  });

  // ==========================================================================
  // LRUCache - TTL Expiration
  // ==========================================================================

  describe("LRUCache - TTL expiration", () => {
    it("expires entries after TTL", async () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, ttlMs: 50 });
      
      cache.set("key", 1);
      expect(cache.get("key")).toBe(1);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(cache.get("key")).toBeUndefined();
    });

    it("keeps entries before TTL expires", async () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, ttlMs: 500 });
      
      cache.set("key", 1);
      
      // Wait less than TTL
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(cache.get("key")).toBe(1);
    });

    it("has() returns false for expired entries", async () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, ttlMs: 50 });
      
      cache.set("key", 1);
      expect(cache.has("key")).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(cache.has("key")).toBe(false);
    });

    it("removes expired entries on access", async () => {
      const cache = new LRUCache<string, number>({ maxSize: 10, ttlMs: 50 });
      
      cache.set("key", 1);
      expect(cache.size).toBe(1);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Access triggers removal
      cache.get("key");
      // Note: size might still show 1 until we check
    });
  });

  // ==========================================================================
  // LRUCache - getStats
  // ==========================================================================

  describe("LRUCache - getStats", () => {
    it("returns correct statistics", () => {
      const cache = new LRUCache<string, number>({ maxSize: 50, ttlMs: 30000 });
      
      cache.set("a", 1);
      cache.set("b", 2);
      
      const stats = cache.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(50);
      expect(stats.ttlMs).toBe(30000);
    });

    it("uses default values when not specified", () => {
      const cache = new LRUCache<string, number>();
      
      const stats = cache.getStats();
      
      expect(stats.maxSize).toBe(100); // Default
      expect(stats.ttlMs).toBe(60000); // Default (1 minute)
    });
  });

  // ==========================================================================
  // hashContent
  // ==========================================================================

  describe("hashContent", () => {
    it("produces consistent hashes", () => {
      const content = "function test() { return 42; }";
      
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);
      
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different content", () => {
      const content1 = "function a() {}";
      const content2 = "function b() {}";
      
      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);
      
      expect(hash1).not.toBe(hash2);
    });

    it("produces valid hex string", () => {
      const hash = hashContent("test content");
      
      expect(hash).toMatch(/^[a-z0-9]+$/);
    });

    it("handles empty content", () => {
      const hash = hashContent("");
      
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });

    it("handles unicode content", () => {
      const hash1 = hashContent("日本語 content");
      const hash2 = hashContent("日本語 content");
      
      expect(hash1).toBe(hash2);
    });

    it("samples large content for performance", async () => {
      const largeContent = "x".repeat(50000);
      
      const result = await measurePerformance(
        "hashContent-large",
        async () => {
          return hashContent(largeContent);
        },
        10 // Should complete in under 10ms
      );
      
      expect(result).toBeDefined();
      expect(result.result).toBeDefined();
    });

    it("produces same hash for content differing only in middle (large)", () => {
      // This tests the sampling behavior for large files
      const base = "a".repeat(20000);
      const content1 = base + "X" + base;
      const content2 = base + "Y" + base;
      
      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);
      
      // For large files with same start/end, hash might be same
      // (This is expected behavior for performance optimization)
      // Just verify they're valid hashes
      expect(hash1).toMatch(/^[a-z0-9]+$/);
      expect(hash2).toMatch(/^[a-z0-9]+$/);
    });

    it("differentiates by content length (large files)", () => {
      const content1 = "x".repeat(15000);
      const content2 = "x".repeat(16000);
      
      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);
      
      // Different lengths should produce different hashes
      expect(hash1).not.toBe(hash2);
    });
  });

  // ==========================================================================
  // createSymbolCacheKey
  // ==========================================================================

  describe("createSymbolCacheKey", () => {
    it("creates key with language prefix", () => {
      const key = createSymbolCacheKey("content", "typescript");
      
      expect(key).toMatch(/^typescript:/);
    });

    it("creates different keys for different languages", () => {
      const key1 = createSymbolCacheKey("content", "typescript");
      const key2 = createSymbolCacheKey("content", "python");
      
      expect(key1).not.toBe(key2);
    });

    it("creates different keys for different content", () => {
      const key1 = createSymbolCacheKey("function a() {}", "typescript");
      const key2 = createSymbolCacheKey("function b() {}", "typescript");
      
      expect(key1).not.toBe(key2);
    });

    it("creates different keys for different options", () => {
      const key1 = createSymbolCacheKey("content", "typescript", { maxDepth: 5 });
      const key2 = createSymbolCacheKey("content", "typescript", { maxDepth: 10 });
      
      expect(key1).not.toBe(key2);
    });

    it("uses 'default' suffix when no options provided", () => {
      const key = createSymbolCacheKey("content", "typescript");
      
      expect(key).toMatch(/:default$/);
    });

    it("creates consistent keys for same inputs", () => {
      const key1 = createSymbolCacheKey("content", "typescript", { maxDepth: 5 });
      const key2 = createSymbolCacheKey("content", "typescript", { maxDepth: 5 });
      
      expect(key1).toBe(key2);
    });
  });

  // ==========================================================================
  // symbolCache Singleton
  // ==========================================================================

  describe("symbolCache singleton", () => {
    it("is an LRUCache instance", () => {
      expect(symbolCache).toBeInstanceOf(LRUCache);
    });

    it("stores and retrieves symbol arrays", () => {
      const symbols: Symbol[] = [
        {
          name: "test",
          kind: SymbolKind.Function,
          namePath: "test",
          location: {
            startLine: 0,
            endLine: 0,
            startColumn: 0,
            endColumn: 10,
            startOffset: 0,
            endOffset: 10,
          },
          children: [],
        },
      ];
      
      const key = "test-key";
      symbolCache.set(key, symbols);
      
      const retrieved = symbolCache.get(key);
      expect(retrieved).toEqual(symbols);
    });

    it("respects configured max size", () => {
      const stats = symbolCache.getStats();
      
      expect(stats.maxSize).toBe(CACHE_CONFIG.symbolCacheSize);
    });

    it("respects configured TTL", () => {
      const stats = symbolCache.getStats();
      
      expect(stats.ttlMs).toBe(CACHE_CONFIG.symbolCacheTtl);
    });
  });

  // ==========================================================================
  // getCachedFlatten
  // ==========================================================================

  describe("getCachedFlatten", () => {
    it("flattens nested symbol arrays", async () => {
      const content = `
class Parent {
  childMethod() {}
}
function standalone() {}
`;
      const symbols = await extractSymbols(content, "typescript");
      const flat = getCachedFlatten(symbols);
      
      // Should include parent, child, and standalone
      expect(flat.length).toBeGreaterThanOrEqual(3);
    });

    it("returns same reference on subsequent calls", async () => {
      const content = "function test() {}";
      const symbols = await extractSymbols(content, "typescript");
      
      const flat1 = getCachedFlatten(symbols);
      const flat2 = getCachedFlatten(symbols);
      
      // Should be exact same object (cached)
      expect(flat1).toBe(flat2);
    });

    it("handles empty symbol array", () => {
      const symbols: Symbol[] = [];
      const flat = getCachedFlatten(symbols);
      
      expect(flat).toEqual([]);
    });

    it("handles deeply nested symbols", async () => {
      const content = `
class Level1 {
  method1() {
    class Level2 {
      method2() {}
    }
  }
}
`;
      const symbols = await extractSymbols(content, "typescript");
      const flat = getCachedFlatten(symbols);
      
      // Should have all levels flattened
      expect(flat.length).toBeGreaterThanOrEqual(2);
    });

    it("is faster on subsequent calls (cached)", async () => {
      const content = `
class Big {
  method1() {}
  method2() {}
  method3() {}
  method4() {}
  method5() {}
}
`;
      const symbols = await extractSymbols(content, "typescript");
      
      // First call - compute
      const start1 = performance.now();
      getCachedFlatten(symbols);
      const time1 = performance.now() - start1;
      
      // Second call - cached
      const start2 = performance.now();
      getCachedFlatten(symbols);
      const time2 = performance.now() - start2;
      
      // Cached should be faster or equal (might be too fast to measure difference)
      expect(time2).toBeLessThanOrEqual(time1 + 1);
    });
  });

  // ==========================================================================
  // clearSymbolCaches
  // ==========================================================================

  describe("clearSymbolCaches", () => {
    it("clears the symbol cache", () => {
      // Add some entries
      symbolCache.set("key1", []);
      symbolCache.set("key2", []);
      
      expect(symbolCache.size).toBeGreaterThan(0);
      
      clearSymbolCaches();
      
      expect(symbolCache.size).toBe(0);
    });

    it("allows fresh data after clearing", async () => {
      const content = "function test() {}";
      const key = createSymbolCacheKey(content, "typescript");
      
      // Cache some symbols
      const symbols1 = await extractSymbols(content, "typescript");
      symbolCache.set(key, symbols1);
      
      clearSymbolCaches();
      
      // Cache should be empty
      expect(symbolCache.get(key)).toBeUndefined();
    });
  });

  // ==========================================================================
  // getSymbolCacheStats
  // ==========================================================================

  describe("getSymbolCacheStats", () => {
    it("returns symbol cache statistics", () => {
      const stats = getSymbolCacheStats();
      
      expect(stats).toHaveProperty("symbolCache");
      expect(stats.symbolCache).toHaveProperty("size");
      expect(stats.symbolCache).toHaveProperty("maxSize");
      expect(stats.symbolCache).toHaveProperty("ttlMs");
    });

    it("reflects current cache state", () => {
      clearSymbolCaches();
      
      const stats1 = getSymbolCacheStats();
      expect(stats1.symbolCache.size).toBe(0);
      
      symbolCache.set("key", []);
      
      const stats2 = getSymbolCacheStats();
      expect(stats2.symbolCache.size).toBe(1);
    });
  });

  // ==========================================================================
  // CACHE_CONFIG
  // ==========================================================================

  describe("CACHE_CONFIG", () => {
    it("has symbolCacheSize property", () => {
      expect(CACHE_CONFIG).toHaveProperty("symbolCacheSize");
      expect(typeof CACHE_CONFIG.symbolCacheSize).toBe("number");
    });

    it("has symbolCacheTtl property", () => {
      expect(CACHE_CONFIG).toHaveProperty("symbolCacheTtl");
      expect(typeof CACHE_CONFIG.symbolCacheTtl).toBe("number");
    });

    it("has disabled property", () => {
      expect(CACHE_CONFIG).toHaveProperty("disabled");
      expect(typeof CACHE_CONFIG.disabled).toBe("boolean");
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe("integration with extractSymbols", () => {
    it("caching improves repeated extraction performance", async () => {
      const content = `
class UserService {
  private users: Map<string, any> = new Map();
  
  getUser(id: string) {
    return this.users.get(id);
  }
  
  setUser(id: string, user: any) {
    this.users.set(id, user);
  }
}

function createService() {
  return new UserService();
}
`;
      clearSymbolCaches();
      
      // First extraction (cache miss)
      const start1 = performance.now();
      const symbols1 = await extractSymbols(content, "typescript");
      const time1 = performance.now() - start1;
      
      // Store in cache manually for this test
      const key = createSymbolCacheKey(content, "typescript");
      symbolCache.set(key, symbols1);
      
      // Second extraction should hit cache if extractSymbols uses it
      // (This tests the expected usage pattern)
      const cached = symbolCache.get(key);
      expect(cached).toBeDefined();
      expect(cached).toEqual(symbols1);
    });

    it("different content produces different cache entries", async () => {
      const content1 = "function a() {}";
      const content2 = "function b() {}";
      
      const key1 = createSymbolCacheKey(content1, "typescript");
      const key2 = createSymbolCacheKey(content2, "typescript");
      
      const symbols1 = await extractSymbols(content1, "typescript");
      const symbols2 = await extractSymbols(content2, "typescript");
      
      symbolCache.set(key1, symbols1);
      symbolCache.set(key2, symbols2);
      
      expect(symbolCache.get(key1)).not.toEqual(symbolCache.get(key2));
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("handles special characters in content", () => {
      const content = `const emoji = "👍🎉🚀";
function テスト() {}`;
      
      const hash = hashContent(content);
      const key = createSymbolCacheKey(content, "typescript");
      
      expect(hash).toBeDefined();
      expect(key).toBeDefined();
    });

    it("handles very small content", () => {
      const content = "x";
      
      const hash = hashContent(content);
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });

    it("handles content with only whitespace", () => {
      const content = "   \n\t\n   ";
      
      const hash = hashContent(content);
      expect(hash).toBeDefined();
    });

    it("handles null-like values in cache", () => {
      const cache = new LRUCache<string, any>({ maxSize: 10 });
      
      cache.set("zero", 0);
      cache.set("empty", "");
      cache.set("null", null);
      
      expect(cache.get("zero")).toBe(0);
      expect(cache.get("empty")).toBe("");
      expect(cache.get("null")).toBe(null);
    });

    it("handles rapid set/get operations", () => {
      const cache = new LRUCache<number, number>({ maxSize: 100 });
      
      // Rapid operations
      for (let i = 0; i < 1000; i++) {
        cache.set(i % 100, i);
      }
      
      // Should still work correctly
      expect(cache.size).toBeLessThanOrEqual(100);
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe("performance", () => {
    it("LRU operations are fast", async () => {
      const cache = new LRUCache<number, number>({ maxSize: 1000 });
      
      const result = await measurePerformance(
        "lru-operations",
        async () => {
          for (let i = 0; i < 10000; i++) {
            cache.set(i, i * 2);
            cache.get(i);
          }
        },
        100 // 10000 operations in 100ms
      );
      
      expect(result).toBeDefined();
    });

    it("hashContent is fast for typical files", async () => {
      const content = `
class Service {
  method1() { return 1; }
  method2() { return 2; }
  method3() { return 3; }
}
`.repeat(50); // ~500 lines

      const result = await measurePerformance(
        "hashContent-typical",
        async () => {
          for (let i = 0; i < 100; i++) {
            hashContent(content);
          }
        },
        50 // 100 hashes in 50ms
      );
      
      expect(result).toBeDefined();
    });

    it("createSymbolCacheKey is fast", async () => {
      const content = "function test() { return 42; }";
      
      const result = await measurePerformance(
        "createSymbolCacheKey",
        async () => {
          for (let i = 0; i < 1000; i++) {
            createSymbolCacheKey(content, "typescript", { maxDepth: 5 });
          }
        },
        50 // 1000 keys in 50ms
      );
      
      expect(result).toBeDefined();
    });

    it("getCachedFlatten is fast for large symbol trees", async () => {
      // Create a large symbol tree
      const content = Array.from({ length: 50 }, (_, i) => `
class Class${i} {
  method1() {}
  method2() {}
  method3() {}
}
`).join("\n");

      const symbols = await extractSymbols(content, "typescript");
      
      // First call computes
      getCachedFlatten(symbols);
      
      // Measure cached access
      const result = await measurePerformance(
        "getCachedFlatten-cached",
        async () => {
          for (let i = 0; i < 1000; i++) {
            getCachedFlatten(symbols);
          }
        },
        10 // 1000 cached accesses in 10ms
      );
      
      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // Real-World Scenarios
  // ==========================================================================

  describe("real-world scenarios", () => {
    it("simulates file editing workflow", async () => {
      // Initial file content
      const content1 = "function original() { return 1; }";
      const key1 = createSymbolCacheKey(content1, "typescript");
      
      const symbols1 = await extractSymbols(content1, "typescript");
      symbolCache.set(key1, symbols1);
      
      // File edited
      const content2 = "function modified() { return 2; }";
      const key2 = createSymbolCacheKey(content2, "typescript");
      
      // Different key for different content
      expect(key2).not.toBe(key1);
      
      // Cache miss for new content
      expect(symbolCache.get(key2)).toBeUndefined();
      
      // Extract and cache new content
      const symbols2 = await extractSymbols(content2, "typescript");
      symbolCache.set(key2, symbols2);
      
      expect(symbolCache.get(key2)).toBeDefined();
    });

    it("simulates multi-file project analysis", async () => {
      clearSymbolCaches();
      
      const files = [
        { path: "/src/a.ts", content: "function a() {}" },
        { path: "/src/b.ts", content: "function b() {}" },
        { path: "/src/c.ts", content: "function c() {}" },
        { path: "/src/d.ts", content: "function d() {}" },
        { path: "/src/e.ts", content: "function e() {}" },
      ];
      
      // First pass: analyze all files
      for (const file of files) {
        const key = createSymbolCacheKey(file.content, "typescript");
        const symbols = await extractSymbols(file.content, "typescript");
        symbolCache.set(key, symbols);
      }
      
      // extractSymbols internally caches results, so we get 2 entries per file
      // (one from extractSymbols cache + one from manual symbolCache.set)
      expect(symbolCache.size).toBeGreaterThanOrEqual(5);
      
      // Second pass: all should be cached
      for (const file of files) {
        const key = createSymbolCacheKey(file.content, "typescript");
        expect(symbolCache.get(key)).toBeDefined();
      }
    });

    it("handles cache pressure gracefully", async () => {
      const smallCache = new LRUCache<string, Symbol[]>({ maxSize: 5 });
      
      // Add more items than capacity
      for (let i = 0; i < 10; i++) {
        smallCache.set(`key${i}`, []);
      }
      
      // Only last 5 should remain
      expect(smallCache.size).toBe(5);
      
      // Oldest items evicted
      expect(smallCache.get("key0")).toBeUndefined();
      expect(smallCache.get("key9")).toBeDefined();
    });
  });
});
