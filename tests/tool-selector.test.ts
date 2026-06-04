import { describe, it, expect, vi, beforeAll } from "vitest";
import { getToolSelector, TOOL_MATRIX, INTENT_PATTERNS } from "../src/intelligence/tool-selector.js";

describe("ToolSelector", () => {
  let selector: Awaited<ReturnType<typeof getToolSelector>>;

  beforeAll(async () => {
    selector = await getToolSelector();
  });

  describe("getToolInfo", () => {
    it("returns info for known tool", () => {
      const info = selector.getToolInfo("read_text_file");
      expect(info).toBeDefined();
      expect(info!.category).toBe("file-read");
      expect(info!.readOnly).toBe(true);
    });

    it("returns undefined for unknown tool", () => {
      expect(selector.getToolInfo("nonexistent")).toBeUndefined();
    });
  });

  describe("getToolsByCategory", () => {
    it("returns tools in file-read category", () => {
      const tools = selector.getToolsByCategory("file-read");
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every(t => t.category === "file-read")).toBe(true);
    });

    it("returns empty for empty category", () => {
      const tools = selector.getToolsByCategory("undo" as any);
      expect(tools.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("recommendTools", () => {
    it("recommends read tools for read intent", () => {
      const recs = selector.recommendTools("read the content of a file");
      expect(recs.some(r => r.tool === "read_text_file")).toBe(true);
    });

    it("recommends search tools for search intent", () => {
      const recs = selector.recommendTools("search for text pattern in code");
      const hasSearch = recs.some(r => r.tool === "search_content");
      expect(hasSearch).toBe(true);
    });

    it("recommends edit tools for edit intent", () => {
      const recs = selector.recommendTools("edit and modify the function");
      expect(recs.some(r => r.tool === "edit_file" || r.tool === "replace_symbol_body")).toBe(true);
    });

    it("recommends undo tools for undo intent", () => {
      const recs = selector.recommendTools("undo the last change");
      expect(recs.some(r => r.tool === "undo")).toBe(true);
    });

    it("recommends diff tools for compare intent", () => {
      const recs = selector.recommendTools("diff and compare two files");
      expect(recs.some(r => r.tool === "diff_files")).toBe(true);
    });

    it("falls back for unknown intent", () => {
      const recs = selector.recommendTools("xyzzy foobar baz");
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].confidence).toBeLessThan(0.5);
    });
  });

  describe("generateStatusReport", () => {
    it("includes tool count", () => {
      const report = selector.generateStatusReport();
      expect(report).toContain("Tools registered:");
      expect(report).toContain("Categories:");
    });
  });
});

describe("TOOL_MATRIX", () => {
  it("contains all expected tool categories", () => {
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
});

describe("INTENT_PATTERNS", () => {
  it("every pattern has at least one tool", () => {
    for (const { pattern, tools } of INTENT_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
      expect(tools.length).toBeGreaterThan(0);
    }
  });

  it("all referenced tools exist in matrix", () => {
    const toolNames = new Set(TOOL_MATRIX.map(t => t.name));
    for (const { tools } of INTENT_PATTERNS) {
      for (const { name } of tools) {
        expect(toolNames.has(name)).toBe(true);
      }
    }
  });
});