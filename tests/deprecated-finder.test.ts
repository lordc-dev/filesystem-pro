/**
 * Tests for deprecated symbol usage detection
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import {
  findDeprecatedSymbolsInFile,
  findAllDeprecatedSymbols,
  findDeprecatedUsages,
  findDeprecatedUsagesInFile,
  formatDeprecatedUsagesReport,
  initializeSemanticModule,
} from "../src/semantic/index.js";

describe("deprecated-finder", () => {
  let testDir: string;

  beforeAll(async () => {
    await initializeSemanticModule();
    // Create a temp directory for test files
    testDir = path.join(tmpdir(), `deprecated-finder-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("findDeprecatedSymbolsInFile", () => {
    it("should find deprecated functions", async () => {
      const content = `
/**
 * @deprecated Use newFunction instead
 */
export function oldFunction() {
  return "old";
}

export function newFunction() {
  return "new";
}
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("oldFunction");
      expect(result[0].deprecationReason).toBe("Use newFunction instead");
    });

    it("should find deprecated classes", async () => {
      const content = `
/**
 * @deprecated This class is no longer maintained
 */
export class OldService {
  run() {}
}

export class NewService {
  run() {}
}
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("OldService");
      expect(result[0].deprecationReason).toBe("This class is no longer maintained");
    });

    it("should find deprecated methods", async () => {
      const content = `
export class MyService {
  /**
   * @deprecated Use newMethod instead
   */
  oldMethod() {
    return "old";
  }

  newMethod() {
    return "new";
  }
}
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("oldMethod");
      expect(result[0].namePath).toBe("MyService/oldMethod");
    });

    it("should find deprecated interfaces", async () => {
      const content = `
/**
 * @deprecated Use NewConfig instead
 */
export interface OldConfig {
  value: string;
}

export interface NewConfig {
  value: string;
  version: number;
}
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("OldConfig");
    });

    it("should find multiple deprecated symbols", async () => {
      const content = `
/** @deprecated */
export function oldFn1() {}

/** @deprecated */
export function oldFn2() {}

export function newFn() {}
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.name)).toContain("oldFn1");
      expect(result.map(s => s.name)).toContain("oldFn2");
    });

    it("should return empty array for files without deprecated symbols", async () => {
      const content = `
export function normalFunction() {
  return "normal";
}
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(0);
    });

    it("should handle deprecated with multi-line reason", async () => {
      const content = `
/**
 * @deprecated This function is deprecated because
 * it uses an old API that will be removed in v2.0.
 * Use the new API instead.
 */
export function legacyFunction() {}
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(1);
      expect(result[0].deprecationReason).toContain("old API");
    });

    it("should handle deprecated without reason", async () => {
      const content = `
/** @deprecated */
export const OLD_VALUE = "old";
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("OLD_VALUE");
      expect(result[0].deprecationReason).toBe("");
    });
  });

  describe("findAllDeprecatedSymbols", () => {
    it("should find deprecated symbols across multiple files", async () => {
      // Create test files
      const file1 = path.join(testDir, "lib1.ts");
      const file2 = path.join(testDir, "lib2.ts");

      await writeFile(
        file1,
        `
/** @deprecated Use newMethod */
export function oldMethod() {}
`
      );

      await writeFile(
        file2,
        `
/** @deprecated */
export class LegacyClass {}
`
      );

      const result = await findAllDeprecatedSymbols(testDir);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some(s => s.name === "oldMethod")).toBe(true);
      expect(result.some(s => s.name === "LegacyClass")).toBe(true);
    });
  });

  describe("findDeprecatedUsages", () => {
    it("should find usages of deprecated functions", async () => {
      // Create deprecated library file
      const libFile = path.join(testDir, "deprecated-lib.ts");
      await writeFile(
        libFile,
        `
/** @deprecated Use newApi instead */
export function deprecatedApi() {
  return "deprecated";
}

export function newApi() {
  return "new";
}
`
      );

      // Create consumer file that uses the deprecated function
      const consumerFile = path.join(testDir, "consumer.ts");
      await writeFile(
        consumerFile,
        `
import { deprecatedApi, newApi } from "./deprecated-lib";

// This should be flagged
const result = deprecatedApi();

// This is fine
const result2 = newApi();
`
      );

      const report = await findDeprecatedUsages(testDir, {
        includeDefinitions: false,
      });

      // Should find the deprecatedApi usage in consumer.ts
      const deprecatedUsages = report.usages.filter(
        u => u.symbol.name === "deprecatedApi"
      );

      expect(deprecatedUsages.length).toBeGreaterThanOrEqual(1);
      
      // At least one usage should be in consumer.ts (the call site)
      const consumerUsages = deprecatedUsages.filter(
        u => u.reference.filePath.includes("consumer")
      );
      expect(consumerUsages.length).toBeGreaterThanOrEqual(1);
    });

    it("should not include definitions by default", async () => {
      const libFile = path.join(testDir, "only-deprecated.ts");
      await writeFile(
        libFile,
        `
/** @deprecated */
export function onlyDeprecated() {}
`
      );

      const report = await findDeprecatedUsages(testDir, {
        includeDefinitions: false,
      });

      // The definition should not be in usages when includeDefinitions is false
      const defUsages = report.usages.filter(
        u => u.symbol.name === "onlyDeprecated" && u.reference.isDefinition
      );
      expect(defUsages).toHaveLength(0);
    });

    it("should include definitions when requested", async () => {
      const libFile = path.join(testDir, "with-def.ts");
      await writeFile(
        libFile,
        `
/** @deprecated */
export function deprecatedWithDef() {}
`
      );

      const report = await findDeprecatedUsages(testDir, {
        includeDefinitions: true,
      });

      // Should include the definition
      const defUsages = report.usages.filter(
        u => u.symbol.name === "deprecatedWithDef" && u.reference.isDefinition
      );
      expect(defUsages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("formatDeprecatedUsagesReport", () => {
    it("should format empty report correctly", () => {
      const report = {
        deprecatedSymbols: [],
        usages: [],
        usagesByFile: new Map(),
        totalUsageCount: 0,
        filesScanned: 10,
      };

      const formatted = formatDeprecatedUsagesReport(report);

      expect(formatted).toContain("0 deprecated symbol(s)");
      expect(formatted).toContain("0 usage(s)");
      expect(formatted).toContain("No deprecated symbol usages found");
    });

    it("should format report with usages", () => {
      const report = {
        deprecatedSymbols: [
          {
            name: "oldFn",
            namePath: "oldFn",
            definitionFile: "/src/lib.ts",
            definitionLocation: {
              startLine: 5,
              endLine: 7,
              startColumn: 0,
              endColumn: 1,
              startOffset: 0,
              endOffset: 50,
            },
            deprecationNote: "/** @deprecated Use newFn */",
            deprecationReason: "Use newFn",
          },
        ],
        usages: [
          {
            symbol: {
              name: "oldFn",
              namePath: "oldFn",
              definitionFile: "/src/lib.ts",
              definitionLocation: {
                startLine: 5,
                endLine: 7,
                startColumn: 0,
                endColumn: 1,
                startOffset: 0,
                endOffset: 50,
              },
              deprecationNote: "/** @deprecated Use newFn */",
              deprecationReason: "Use newFn",
            },
            reference: {
              filePath: "/src/consumer.ts",
              location: {
                startLine: 10,
                startColumn: 5,
                endLine: 10,
                endColumn: 10,
                startOffset: 100,
                endOffset: 105,
              },
              text: "oldFn",
              context: "const x = oldFn();",
              isDefinition: false,
              referenceType: "call" as const,
            },
          },
        ],
        usagesByFile: new Map([["/src/consumer.ts", []]]),
        totalUsageCount: 1,
        filesScanned: 5,
      };

      const formatted = formatDeprecatedUsagesReport(report);

      expect(formatted).toContain("1 deprecated symbol(s)");
      expect(formatted).toContain("1 usage(s)");
      expect(formatted).toContain("oldFn");
      expect(formatted).toContain("Use newFn");
      expect(formatted).toContain("consumer.ts");
    });
  });

  describe("findDeprecatedUsagesInFile", () => {
    it("should find deprecated usages in a specific file", async () => {
      // Create deprecated library
      const libFile = path.join(testDir, "specific-lib.ts");
      await writeFile(
        libFile,
        `
/** @deprecated Use newSpecific instead */
export function oldSpecific() {}
`
      );

      // Create consumer file
      const consumerFile = path.join(testDir, "specific-consumer.ts");
      const consumerContent = `
import { oldSpecific } from "./specific-lib";

// Using deprecated function
oldSpecific();
`;
      await writeFile(consumerFile, consumerContent);

      const usages = await findDeprecatedUsagesInFile(
        consumerFile,
        consumerContent,
        testDir
      );

      // Should find the usage of oldSpecific
      const specificUsages = usages.filter(u => u.symbol.name === "oldSpecific");
      expect(specificUsages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("edge cases", () => {
    it("should handle unsupported file types", async () => {
      const result = await findDeprecatedSymbolsInFile("test.txt", "some text");
      expect(result).toHaveLength(0);
    });

    it("should handle empty files", async () => {
      const result = await findDeprecatedSymbolsInFile("test.ts", "");
      expect(result).toHaveLength(0);
    });

    it("should handle files with only comments", async () => {
      const content = `
// Just a comment
/* Another comment */
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);
      expect(result).toHaveLength(0);
    });

    it("should handle deprecated in block comment correctly", async () => {
      const content = `
/**
 * Some function
 * @deprecated Since v2.0
 * @param x The parameter
 */
export function fn(x: number) {}
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(1);
      expect(result[0].deprecationReason).toContain("Since v2.0");
    });

    it("should handle case-insensitive @Deprecated", async () => {
      const content = `
/**
 * @DEPRECATED Use newFn
 */
export function oldFn() {}
`;
      const result = await findDeprecatedSymbolsInFile("test.ts", content);

      expect(result).toHaveLength(1);
    });
  });
});
