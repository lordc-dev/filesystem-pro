import { describe, it, expect } from "vitest";
import {
  PathSchema,
  ExcludePatternsSchema,
  PatternSchema,
  SuccessSchema,
  PathSuccessSchema,
  DualPathSuccessSchema,
  SymbolKindSchema,
  SymbolLocationSchema,
  ImportInfoSchema,
  ImportSpecifierSchema,
  DependentFileSchema,
  RelatedTestFileSchema,
  UnusedImportSchema,
  CallerInfoSchema,
  CalleeInfoSchema,
  LineStatsSchema,
  SymbolStatsSchema,
  CodeFileStatsSchema,
  ContentSearchSubmatchSchema,
  ProjectPatternSchema,
  PatternVariableSchema,
} from "../src/schemas/index.js";

describe("schemas", () => {
  describe("base input schemas", () => {
    it("PathSchema accepts string", () => {
      expect(PathSchema.parse("/foo/bar")).toBe("/foo/bar");
    });

    it("ExcludePatternsSchema defaults to empty array", () => {
      expect(ExcludePatternsSchema.parse(undefined)).toEqual([]);
    });

    it("PatternSchema accepts string", () => {
      expect(PatternSchema.parse("TODO")).toBe("TODO");
    });
  });

  describe("output schemas", () => {
    it("SuccessSchema validates", () => {
      expect(SuccessSchema.parse({ success: true, message: "ok" })).toEqual({ success: true, message: "ok" });
    });

    it("PathSuccessSchema validates", () => {
      expect(PathSuccessSchema.parse({ success: true, message: "ok", path: "/a" })).toEqual({
        success: true, message: "ok", path: "/a",
      });
    });

    it("DualPathSuccessSchema validates", () => {
      expect(DualPathSuccessSchema.parse({ success: true, message: "ok", source: "/a", destination: "/b" })).toEqual({
        success: true, message: "ok", source: "/a", destination: "/b",
      });
    });
  });

  describe("semantic schemas", () => {
    it("SymbolKindSchema accepts valid enum values", () => {
      expect(SymbolKindSchema.parse("Class")).toBe("Class");
      expect(SymbolKindSchema.parse("Function")).toBe("Function");
    });

    it("SymbolKindSchema rejects invalid values", () => {
      expect(() => SymbolKindSchema.parse("InvalidKind")).toThrow();
    });

    it("SymbolLocationSchema validates", () => {
      const loc = { startLine: 1, endLine: 10, startColumn: 0, endColumn: 5 };
      expect(SymbolLocationSchema.parse(loc)).toEqual(loc);
    });
  });

  describe("import/dependency schemas", () => {
    it("ImportSpecifierSchema validates", () => {
      const spec = { name: "foo", alias: "bar" };
      expect(ImportSpecifierSchema.parse(spec)).toEqual({ name: "foo", alias: "bar", isTypeOnly: undefined });
    });

    it("ImportInfoSchema validates full import", () => {
      const imp = {
        source: "./utils",
        specifiers: [{ name: "foo" }],
        isDefault: false,
        isNamespace: false,
        isTypeOnly: false,
        isSideEffect: false,
        location: { startLine: 1, endLine: 1 },
        rawText: 'import { foo } from "./utils"',
      };
      expect(ImportInfoSchema.parse(imp)).toEqual(imp);
    });

    it("DependentFileSchema validates", () => {
      const dep = { filePath: "/src/foo.ts", importStatement: 'import { x } from "./y"', line: 1 };
      expect(DependentFileSchema.parse(dep)).toEqual(dep);
    });

    it("RelatedTestFileSchema validates", () => {
      const test = { filePath: "/src/foo.test.ts", patternType: "test" };
      expect(RelatedTestFileSchema.parse(test)).toEqual(test);
    });

    it("UnusedImportSchema validates", () => {
      const unused = { source: "./a", unusedSpecifiers: ["x"], isFullyUnused: false, line: 5 };
      expect(UnusedImportSchema.parse(unused)).toEqual(unused);
    });
  });

  describe("call hierarchy schemas", () => {
    it("CallerInfoSchema validates", () => {
      const caller = {
        filePath: "/a.ts",
        callerSymbol: "main",
        location: { startLine: 1, endLine: 1, startColumn: 0, endColumn: 10 },
        context: "main()",
      };
      expect(CallerInfoSchema.parse(caller)).toEqual(caller);
    });

    it("CalleeInfoSchema validates", () => {
      const callee = {
        name: "helper",
        location: { startLine: 5, endLine: 5, startColumn: 2, endColumn: 15 },
        isMethodCall: true,
        receiver: "obj",
      };
      expect(CalleeInfoSchema.parse(callee)).toEqual(callee);
    });
  });

  describe("file stats schemas", () => {
    it("LineStatsSchema validates", () => {
      const stats = { total: 100, code: 70, blank: 15, comment: 15 };
      expect(LineStatsSchema.parse(stats)).toEqual(stats);
    });

    it("SymbolStatsSchema validates", () => {
      const stats = { functions: 5, classes: 2, interfaces: 1, types: 0, variables: 3, constants: 1, enums: 0, methods: 4, total: 16 };
      expect(SymbolStatsSchema.parse(stats)).toEqual(stats);
    });

    it("CodeFileStatsSchema validates", () => {
      const stat = {
        path: "/a.ts",
        language: "typescript",
        lines: { total: 50, code: 30, blank: 10, comment: 10 },
        symbols: { functions: 3, classes: 1, interfaces: 0, types: 0, variables: 2, constants: 0, enums: 0, methods: 2, total: 8 },
        imports: { count: 2, sources: ["react", "./utils"] },
        exports: { count: 1, names: ["default"] },
      };
      expect(CodeFileStatsSchema.parse(stat)).toEqual(stat);
    });
  });

  describe("search result schemas", () => {
    it("ContentSearchSubmatchSchema validates", () => {
      const sm = { text: "foo", start: 0, end: 3 };
      expect(ContentSearchSubmatchSchema.parse(sm)).toEqual(sm);
    });
  });

  describe("project pattern schemas", () => {
    it("PatternVariableSchema validates", () => {
      const v = { name: "ServiceName", description: "Name of service" };
      expect(PatternVariableSchema.parse(v)).toEqual(v);
    });

    it("ProjectPatternSchema validates minimal", () => {
      const p = { name: "test", pattern: "code here", type: "code" as const };
      expect(ProjectPatternSchema.parse(p)).toEqual(p);
    });

    it("ProjectPatternSchema validates full", () => {
      const p = {
        name: "service",
        description: "desc",
        pattern: "class X {}",
        type: "code" as const,
        language: "kotlin",
        tags: ["arch"],
        category: "backend",
        variables: [{ name: "X", description: "class name" }],
        metadata: { priority: "high" },
      };
      expect(ProjectPatternSchema.parse(p)).toEqual(p);
    });
  });
});