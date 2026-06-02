import { describe, it, expect, beforeAll } from "vitest";
import { getToolSelector, TOOL_MATRIX, INTENT_PATTERNS } from "../src/intelligence/tool-selector.js";
import type { IToolSelector } from "../src/intelligence/tool-selector.js";

describe("tool-selector", () => {
  let selector: IToolSelector;

  beforeAll(async () => {
    selector = await getToolSelector();
  });

  describe("TOOL_MATRIX integrity", () => {
    it("has entries for all major categories", () => {
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

    it("every tool has required fields", () => {
      for (const tool of TOOL_MATRIX) {
        expect(tool.name).toBeTruthy();
        expect(tool.category).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(Array.isArray(tool.capabilities)).toBe(true);
        expect(Array.isArray(tool.prerequisites)).toBe(true);
        expect(Array.isArray(tool.alternatives)).toBe(true);
        expect(typeof tool.readOnly).toBe("boolean");
      }
    });

    it("tool names are unique", () => {
      const names = TOOL_MATRIX.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe("recommendTools", () => {
    it("recommends read_text_file for read file intent", () => {
      const recs = selector.recommendTools("read the file content");
      const names = recs.map(r => r.tool);
      expect(names).toContain("read_text_file");
    });

    it("recommends search_content for text search intent", () => {
      const recs = selector.recommendTools("search for pattern in files");
      const names = recs.map(r => r.tool);
      expect(names).toContain("search_content");
    });

    it("recommends find_symbol for symbol lookup intent", () => {
      const recs = selector.recommendTools("find class definition");
      const names = recs.map(r => r.tool);
      expect(names).toContain("find_symbol");
    });

    it("recommends undo for rollback intent", () => {
      const recs = selector.recommendTools("undo last change");
      const names = recs.map(r => r.tool);
      expect(names).toContain("undo");
    });

    it("recommends edit_file for edit intent", () => {
      const recs = selector.recommendTools("edit the function code");
      const names = recs.map(r => r.tool);
      expect(names).toContain("edit_file");
    });

    it("returns fallback for unknown intent", () => {
      const recs = selector.recommendTools("completely random xyz123");
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].confidence).toBeLessThan(0.5);
    });

    it("recommendations have valid tool names", () => {
      const allNames = new Set(TOOL_MATRIX.map(t => t.name));
      const recs = selector.recommendTools("find and read files");
      for (const r of recs) {
        expect(allNames.has(r.tool)).toBe(true);
      }
    });

    it("recommendations have confidence between 0 and 1", () => {
      const recs = selector.recommendTools("search for function");
      for (const r of recs) {
        expect(r.confidence).toBeGreaterThan(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("getToolInfo", () => {
    it("returns info for existing tool", () => {
      const info = selector.getToolInfo("read_text_file");
      expect(info).toBeDefined();
      expect(info!.name).toBe("read_text_file");
      expect(info!.category).toBe("file-read");
      expect(info!.readOnly).toBe(true);
    });

    it("returns undefined for non-existent tool", () => {
      expect(selector.getToolInfo("nonexistent_tool")).toBeUndefined();
    });
  });

  describe("getToolsByCategory", () => {
    it("returns tools for valid category", () => {
      const tools = selector.getToolsByCategory("file-read");
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every(t => t.category === "file-read")).toBe(true);
    });

    it("returns empty for unknown category", () => {
      expect(selector.getToolsByCategory("nonexistent" as any)).toEqual([]);
    });
  });

  describe("generateStatusReport", () => {
    it("includes key info", () => {
      const report = selector.generateStatusReport();
      expect(report).toContain("Tool Selector Status");
      expect(report).toContain("Tools registered");
      expect(report).toContain("Categories");
    });
  });

  describe("INTENT_PATTERNS integrity", () => {
    it("all referenced tool names exist in TOOL_MATRIX", () => {
      const allNames = new Set(TOOL_MATRIX.map(t => t.name));
      for (const { tools } of INTENT_PATTERNS) {
        for (const { name } of tools) {
          expect(allNames.has(name), `Intent references unknown tool: ${name}`).toBe(true);
        }
      }
    });

    it("all patterns are valid regex", () => {
      for (const { pattern } of INTENT_PATTERNS) {
        expect(() => new RegExp(pattern)).not.toThrow();
      }
    });
  });
});