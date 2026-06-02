import { describe, it, expect, vi, beforeEach } from "vitest";
import { TOOL_MATRIX, INTENT_PATTERNS } from "../src/intelligence/tool-selector.js";

describe("tool-selector", () => {
  describe("TOOL_MATRIX", () => {
    it("has entries for all expected categories", () => {
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

    it("every tool has a name and description", () => {
      for (const tool of TOOL_MATRIX) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
      }
    });

    it("every tool has a valid category", () => {
      const valid: string[] = ["file-read", "file-write", "directory", "search", "semantic", "analysis", "editing", "undo"];
      for (const tool of TOOL_MATRIX) {
        expect(valid).toContain(tool.category);
      }
    });

    it("alternative tools reference existing tools", () => {
      const names = new Set(TOOL_MATRIX.map(t => t.name));
      for (const tool of TOOL_MATRIX) {
        for (const alt of tool.alternatives) {
          expect(names.has(alt)).toBe(true);
        }
      }
    });

    it("no duplicate tool names", () => {
      const names = TOOL_MATRIX.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it("read-only tools have readOnly=true", () => {
      const readTools = TOOL_MATRIX.filter(t => t.category === "file-read");
      for (const t of readTools) {
        expect(t.readOnly).toBe(true);
      }
    });
  });

  describe("INTENT_PATTERNS", () => {
    it("has at least 10 intent patterns", () => {
      expect(INTENT_PATTERNS.length).toBeGreaterThanOrEqual(10);
    });

    it("all referenced tools exist in TOOL_MATRIX", () => {
      const names = new Set(TOOL_MATRIX.map(t => t.name));
      for (const { tools } of INTENT_PATTERNS) {
        for (const { name } of tools) {
          expect(names.has(name)).toBe(true);
        }
      }
    });

    it("all patterns are valid regex", () => {
      for (const { pattern } of INTENT_PATTERNS) {
        expect(() => new RegExp(pattern)).not.toThrow();
      }
    });

    it("covers common intents: read, search, edit, undo", () => {
      const patternTexts = INTENT_PATTERNS.map(ip => ip.pattern.source).join(" ");
      expect(/read|view|cat/i.test(patternTexts)).toBe(true);
      expect(/search|find|grep/i.test(patternTexts)).toBe(true);
      expect(/edit|modify|change/i.test(patternTexts)).toBe(true);
      expect(/undo|revert|rollback/i.test(patternTexts)).toBe(true);
    });
  });
});