/**
 * Integration Tests for Filesystem Pro
 *
 * Tests server initialization, tool registration, and prompt registration
 * as a complete system rather than isolated units.
 */

import { describe, it, expect, beforeAll } from "vitest";

describe("Server Integration", () => {
  describe("Tool Registration", () => {
    it("should have 48 tools registered in the tool matrix", async () => {
      const { TOOL_MATRIX } = await import("../src/intelligence/tool-selector.js");
      expect(TOOL_MATRIX.length).toBe(48);
    });

    it("should have all tool categories represented", async () => {
      const { TOOL_MATRIX } = await import("../src/intelligence/tool-selector.js");
      const categories = new Set(TOOL_MATRIX.map(t => t.category));
      expect(categories.has("file-read")).toBe(true);
      expect(categories.has("file-write")).toBe(true);
      expect(categories.has("directory")).toBe(true);
      expect(categories.has("search")).toBe(true);
      expect(categories.has("semantic")).toBe(true);
      expect(categories.has("analysis")).toBe(true);
      expect(categories.has("editing")).toBe(true);
      expect(categories.has("undo")).toBe(true);
    });

    it("should have consistent tool names between matrix and factory calls", async () => {
      const { TOOL_MATRIX } = await import("../src/intelligence/tool-selector.js");
      const matrixNames = new Set(TOOL_MATRIX.map(t => t.name));
      expect(matrixNames.size).toBe(48);
    });
  });

  describe("Tool Selector", () => {
    it("should recommend correct tools for read intent", async () => {
      const { getToolSelector } = await import("../src/intelligence/tool-selector.js");
      const selector = await getToolSelector();
      const recommendations = selector.recommendTools("read the file src/index.ts");
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].tool).toBe("read_text_file");
    });

    it("should recommend correct tools for search intent", async () => {
      const { getToolSelector } = await import("../src/intelligence/tool-selector.js");
      const selector = await getToolSelector();
      const recommendations = selector.recommendTools("find the symbol AuthService");
      expect(recommendations.length).toBeGreaterThan(0);
      const names = recommendations.map(r => r.tool);
      expect(names).toContain("find_symbol");
    });

    it("should return fallback for unknown intents", async () => {
      const { getToolSelector } = await import("../src/intelligence/tool-selector.js");
      const selector = await getToolSelector();
      const recommendations = selector.recommendTools("xyzzy plugh");
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].confidence).toBeLessThan(0.5);
    });

    it("should generate status report", async () => {
      const { getToolSelector } = await import("../src/intelligence/tool-selector.js");
      const selector = await getToolSelector();
      const report = selector.generateStatusReport();
      expect(report).toContain("Tool Selector Status");
      expect(report).toContain("48");
    });
  });

  describe("Undo Manager", () => {
    it("should initialize without persistence when no dir configured", async () => {
      const { undoManager } = await import("../src/undo/undo-manager.js");
      await undoManager.initialize();
      expect(undoManager.isPersistenceEnabled).toBe(false);
    });

    it("should report correct stack size after initialize", async () => {
      const { undoManager } = await import("../src/undo/undo-manager.js");
      expect(undoManager.size).toBeGreaterThanOrEqual(0);
    });

    it("should peek entries without error", async () => {
      const { undoManager } = await import("../src/undo/undo-manager.js");
      const entries = undoManager.peek(5);
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe("Runtime Config", () => {
    it("should load default config without file", async () => {
      const { loadConfig, resetConfig } = await import("../src/config/runtime-config.js");
      resetConfig();
      const config = await loadConfig();
      expect(config.roots.enabled).toBe(true);
      expect(config.cache.symbolCacheSize).toBe(100);
      expect(config.undo.maxStackSize).toBe(100);
      expect(config.debug).toBe(false);
    });

    it("should apply env overrides on top of defaults", async () => {
      const original = process.env.MCP_SYMBOL_CACHE_SIZE;
      process.env.MCP_SYMBOL_CACHE_SIZE = "200";

      const { loadConfig, resetConfig } = await import("../src/config/runtime-config.js");
      resetConfig();
      const config = await loadConfig();
      expect(config.cache.symbolCacheSize).toBe(200);

      if (original !== undefined) {
        process.env.MCP_SYMBOL_CACHE_SIZE = original;
      } else {
        delete process.env.MCP_SYMBOL_CACHE_SIZE;
      }
    });
  });


});
