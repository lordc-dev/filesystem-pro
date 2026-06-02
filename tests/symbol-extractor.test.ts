/**
 * Symbol Extractor Tests
 * 
 * Comprehensive tests for the symbol-extractor module including:
 * - Basic extraction for TypeScript, JavaScript, Python
 * - Deep nesting scenarios
 * - Edge cases (empty, unicode, syntax errors)
 * - Performance benchmarks
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, test } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

import {
  extractSymbols,
  extractSymbolsFromFile,
  flattenSymbols,
  getSymbolBody,
  getSymbolText,
} from "../src/semantic/symbol-extractor.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { clearSymbolCaches, getSymbolCacheStats } from "../src/semantic/symbol-cache.js";
import { SymbolKind } from "../src/semantic/types.js";

import {
  measurePerformance,
  createTempTestDir,
  cleanupTempDir,
  assertDefined,
  assertNonEmpty,
} from "./test-helpers.js";
import {
  samples,
  generateLargeTypeScriptFile,
} from "./fixtures/code-samples.js";

describe("Symbol Extractor", () => {
  let testDir: string;

  beforeAll(async () => {
    // Initialize tree-sitter
    await treeSitterManager.initialize();
    
    // Create temp directory for file-based tests
    testDir = await createTempTestDir("symbol-extractor-");
  });

  afterAll(async () => {
    await cleanupTempDir(testDir);
  });

  // ==========================================================================
  // extractSymbols - Basic Extraction
  // ==========================================================================

  describe("extractSymbols", () => {
    describe("TypeScript extraction", () => {
      it("extracts a simple class with methods", async () => {
        const content = `
export class Calculator {
  private value: number = 0;

  add(x: number): this {
    this.value += x;
    return this;
  }

  getResult(): number {
    return this.value;
  }
}`;

        const symbols = await extractSymbols(content, "typescript");

        expect(symbols).toHaveLength(1);
        expect(symbols[0].name).toBe("Calculator");
        expect(symbols[0].kind).toBe(SymbolKind.Class);
        expect(symbols[0].children.length).toBeGreaterThanOrEqual(2);

        // Check methods
        const methodNames = symbols[0].children.map((c) => c.name);
        expect(methodNames).toContain("add");
        expect(methodNames).toContain("getResult");
      });

      it("extracts interfaces", async () => {
        const content = `
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Repository<T> {
  find(id: string): Promise<T>;
  findAll(): Promise<T[]>;
}`;

        const symbols = await extractSymbols(content, "typescript");

        expect(symbols.length).toBeGreaterThanOrEqual(2);
        
        const userInterface = symbols.find((s) => s.name === "User");
        assertDefined(userInterface);
        expect(userInterface.kind).toBe(SymbolKind.Interface);

        const repoInterface = symbols.find((s) => s.name === "Repository");
        assertDefined(repoInterface);
        expect(repoInterface.kind).toBe(SymbolKind.Interface);
      });

      it("extracts functions with various signatures", async () => {
        const content = `
export function regularFunction(x: number): number {
  return x * 2;
}

export async function asyncFunction(): Promise<void> {
  await Promise.resolve();
}

export function* generatorFunction(): Generator<number> {
  yield 1;
  yield 2;
}`;

        const symbols = await extractSymbols(content, "typescript");

        expect(symbols.length).toBeGreaterThanOrEqual(3);

        const regular = symbols.find((s) => s.name === "regularFunction");
        assertDefined(regular);
        expect(regular.kind).toBe(SymbolKind.Function);

        const async = symbols.find((s) => s.name === "asyncFunction");
        assertDefined(async);

        const generator = symbols.find((s) => s.name === "generatorFunction");
        assertDefined(generator);
      });

      it("extracts type aliases", async () => {
        const content = `
export type UserId = string;
export type Status = "active" | "inactive" | "pending";
export type Result<T, E> = { success: true; data: T } | { success: false; error: E };
`;

        const symbols = await extractSymbols(content, "typescript");

        expect(symbols.length).toBeGreaterThanOrEqual(3);
        
        const userId = symbols.find((s) => s.name === "UserId");
        assertDefined(userId);

        const status = symbols.find((s) => s.name === "Status");
        assertDefined(status);

        const result = symbols.find((s) => s.name === "Result");
        assertDefined(result);
      });

      it("extracts enums", async () => {
        const content = `
export enum Color {
  Red = "red",
  Green = "green",
  Blue = "blue",
}

export const enum Direction {
  Up,
  Down,
  Left,
  Right,
}`;

        const symbols = await extractSymbols(content, "typescript");

        expect(symbols.length).toBeGreaterThanOrEqual(2);

        const color = symbols.find((s) => s.name === "Color");
        assertDefined(color);
        expect(color.kind).toBe(SymbolKind.Enum);
      });

      it("extracts arrow functions assigned to variables", async () => {
        const content = `
export const arrowFunc = (x: number): number => x * 2;

export const multiLineArrow = (a: number, b: number): number => {
  const sum = a + b;
  return sum * 2;
};
`;

        const symbols = await extractSymbols(content, "typescript");

        expect(symbols.length).toBeGreaterThanOrEqual(2);

        const arrowFunc = symbols.find((s) => s.name === "arrowFunc");
        assertDefined(arrowFunc);

        const multiLineArrow = symbols.find((s) => s.name === "multiLineArrow");
        assertDefined(multiLineArrow);
      });
    });

    describe("Python extraction", () => {
      it("extracts Python classes and methods", async () => {
        const content = `
class Calculator:
    def __init__(self):
        self.value = 0
    
    def add(self, x):
        self.value += x
        return self
    
    def get_result(self):
        return self.value
`;

        const symbols = await extractSymbols(content, "python");

        expect(symbols.length).toBeGreaterThanOrEqual(1);

        const calculator = symbols.find((s) => s.name === "Calculator");
        assertDefined(calculator);
        expect(calculator.kind).toBe(SymbolKind.Class);
        expect(calculator.children.length).toBeGreaterThanOrEqual(2);
      });

      it("extracts Python functions", async () => {
        const content = `
def helper_function(x):
    return x * 2

async def async_function():
    await asyncio.sleep(1)

def function_with_decorator():
    pass
`;

        const symbols = await extractSymbols(content, "python");

        const helper = symbols.find((s) => s.name === "helper_function");
        assertDefined(helper);
        expect(helper.kind).toBe(SymbolKind.Function);

        const asyncFunc = symbols.find((s) => s.name === "async_function");
        assertDefined(asyncFunc);
      });
    });

    describe("Deep nesting", () => {
      it("extracts nested classes (3+ levels)", async () => {
        const content = `
class Outer {
  outerMethod() {}

  static Inner = class {
    innerMethod() {}

    static Deeper = class {
      deepMethod() {}

      static Deepest = class {
        deepestMethod() {}
      };
    };
  };
}`;

        const symbols = await extractSymbols(content, "typescript");

        expect(symbols.length).toBeGreaterThanOrEqual(1);

        const outer = symbols.find((s) => s.name === "Outer");
        assertDefined(outer);

        // Flatten to check all nested symbols
        const flat = flattenSymbols(symbols);
        expect(flat.length).toBeGreaterThan(1);

        // Check that we have the outerMethod at minimum
        const hasOuterMethod = flat.some((s) => s.name === "outerMethod");
        expect(hasOuterMethod).toBe(true);
      });

      it("extracts nested functions (closures)", async () => {
        const content = `
function outer() {
  function inner() {
    function veryInner() {
      return () => {
        return "deeply nested";
      };
    }
    return veryInner();
  }
  return inner();
}`;

        const symbols = await extractSymbols(content, "typescript");

        const outer = symbols.find((s) => s.name === "outer");
        assertDefined(outer);
        expect(outer.kind).toBe(SymbolKind.Function);

        // Check for nested functions
        const flat = flattenSymbols(symbols);
        expect(flat.length).toBeGreaterThanOrEqual(1);
      });

      it("handles class with methods containing nested functions", async () => {
        const content = `
export class DataProcessor {
  process(data: number[]): number[] {
    const transform = (x: number): number => {
      const helper = (n: number): number => n * 2;
      return helper(x) + 1;
    };
    return data.map(transform);
  }
}`;

        const symbols = await extractSymbols(content, "typescript");

        const processor = symbols.find((s) => s.name === "DataProcessor");
        assertDefined(processor);

        const processMethod = processor.children.find((c) => c.name === "process");
        assertDefined(processMethod);
      });
    });

    describe("Edge cases", () => {
      it("handles empty content", async () => {
        const symbols = await extractSymbols("", "typescript");
        expect(symbols).toEqual([]);
      });

      it("handles content with only comments", async () => {
        const content = `
// This is a comment
/* Multi-line
   comment */
// Another comment
`;
        const symbols = await extractSymbols(content, "typescript");
        expect(symbols).toEqual([]);
      });

      it("handles content with only whitespace", async () => {
        const symbols = await extractSymbols("   \n\n\t\t\n   ", "typescript");
        expect(symbols).toEqual([]);
      });

      it("handles unicode identifiers", async () => {
        const content = `
function grüßen(): string {
  return "Hello";
}

class Événement {
  déclencher() {}
}

const こんにちは = "hello";
`;

        const symbols = await extractSymbols(content, "typescript");

        // Check that unicode identifiers are extracted
        expect(symbols.length).toBeGreaterThan(0);
      });

      it("handles symbols with special characters in strings", async () => {
        const content = `
function getMessage(): string {
  return "Hello, 世界! 🌍";
}

const REGEX = /[a-z]+\\d+/;
`;

        const symbols = await extractSymbols(content, "typescript");

        const getMessage = symbols.find((s) => s.name === "getMessage");
        assertDefined(getMessage);
      });

      it("handles syntax with template literals", async () => {
        const content = `
function formatUser(name: string, age: number): string {
  return \`User: \${name}, Age: \${age}\`;
}
`;

        const symbols = await extractSymbols(content, "typescript");

        const formatUser = symbols.find((s) => s.name === "formatUser");
        assertDefined(formatUser);
      });
    });

    describe("Options", () => {
      it("respects maxDepth option", async () => {
        const content = `
class Outer {
  method() {
    function inner() {
      function veryInner() {}
    }
  }
}`;

        // Depth 0 = only top-level
        const depth0 = await extractSymbols(content, "typescript", { maxDepth: 0 });
        expect(depth0.length).toBe(1);
        expect(depth0[0].children.length).toBe(0);

        // Depth 1 = top-level + direct children
        const depth1 = await extractSymbols(content, "typescript", { maxDepth: 1 });
        expect(depth1.length).toBe(1);
        expect(depth1[0].children.length).toBeGreaterThan(0);
      });

      it("includes metadata when requested", async () => {
        const content = `
export class Service {
  private helper(): void {}
  public static getInstance(): Service { return new Service(); }
}`;

        const symbols = await extractSymbols(content, "typescript", {
          includeMetadata: true,
        });

        const service = symbols.find((s) => s.name === "Service");
        assertDefined(service);
        expect(service.metadata).toBeDefined();
        expect(service.metadata?.isExported).toBe(true);
      });

      it("filters by symbol kind", async () => {
        const content = `
interface User {}
class UserService {}
function createUser() {}
const USER_ID = "123";
`;

        // Only functions
        const functions = await extractSymbols(content, "typescript", {
          kinds: [SymbolKind.Function],
        });

        expect(functions.every((s) => s.kind === SymbolKind.Function)).toBe(true);

        // Only classes
        const classes = await extractSymbols(content, "typescript", {
          kinds: [SymbolKind.Class],
        });

        expect(classes.every((s) => s.kind === SymbolKind.Class)).toBe(true);
      });
    });
  });

  // ==========================================================================
  // extractSymbolsFromFile
  // ==========================================================================

  describe("extractSymbolsFromFile", () => {
    it("extracts symbols and returns result object", async () => {
      const content = `
export function helper() { return 1; }
export class Service {}
`;
      const filePath = path.join(testDir, "test-file.ts");
      await fs.writeFile(filePath, content);

      const result = await extractSymbolsFromFile(filePath, content);

      expect(result.filePath).toBe(filePath);
      expect(result.language).toBe("typescript");
      expect(result.symbols.length).toBeGreaterThanOrEqual(2);
      expect(result.totalSymbolCount).toBeGreaterThanOrEqual(2);
      expect(result.errors).toBeUndefined();
    });

    it("handles unsupported file types", async () => {
      const content = "Some content";
      const filePath = "/path/to/file.unknown";

      const result = await extractSymbolsFromFile(filePath, content);

      expect(result.symbols).toEqual([]);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("determines language from file extension", async () => {
      const tsContent = "function test() {}";
      const pyContent = "def test(): pass";
      const jsContent = "function test() {}";

      const tsResult = await extractSymbolsFromFile("file.ts", tsContent);
      expect(tsResult.language).toBe("typescript");

      const jsResult = await extractSymbolsFromFile("file.js", jsContent);
      expect(jsResult.language).toBe("javascript");

      const pyResult = await extractSymbolsFromFile("file.py", pyContent);
      expect(pyResult.language).toBe("python");
    });
  });

  // ==========================================================================
  // flattenSymbols
  // ==========================================================================

  describe("flattenSymbols", () => {
    it("flattens nested symbol tree", async () => {
      const content = `
class Parent {
  method1() {}
  method2() {}
}

class Child {
  childMethod() {}
}
`;

      const symbols = await extractSymbols(content, "typescript");
      const flat = flattenSymbols(symbols);

      // Should include classes and their methods
      expect(flat.length).toBeGreaterThan(symbols.length);

      // Check that methods are included
      const methodNames = flat.filter((s) => s.kind === SymbolKind.Method).map((s) => s.name);
      expect(methodNames).toContain("method1");
      expect(methodNames).toContain("method2");
    });

    it("handles empty array", () => {
      const flat = flattenSymbols([]);
      expect(flat).toEqual([]);
    });

    it("handles symbols with no children", async () => {
      const content = `
function standalone() {}
const variable = 1;
`;

      const symbols = await extractSymbols(content, "typescript");
      const flat = flattenSymbols(symbols);

      expect(flat.length).toBe(symbols.length);
    });

    it("uses cache for repeated calls", async () => {
      const content = `class A { method() {} }`;
      const symbols = await extractSymbols(content, "typescript");

      const flat1 = flattenSymbols(symbols);
      const flat2 = flattenSymbols(symbols);

      // Should be the same reference due to caching
      expect(flat1).toBe(flat2);
    });
  });

  // ==========================================================================
  // getSymbolBody
  // ==========================================================================

  describe("getSymbolBody", () => {
    it("extracts function body", async () => {
      const content = `
function add(a: number, b: number): number {
  const sum = a + b;
  return sum;
}`;

      const symbols = await extractSymbols(content, "typescript");
      const addFunc = symbols.find((s) => s.name === "add");
      assertDefined(addFunc);

      const body = getSymbolBody(addFunc, content);

      expect(body).toContain("const sum = a + b");
      expect(body).toContain("return sum");
    });

    it("extracts class body", async () => {
      const content = `
class Calculator {
  private value: number = 0;

  add(x: number): void {
    this.value += x;
  }
}`;

      const symbols = await extractSymbols(content, "typescript");
      const calculator = symbols.find((s) => s.name === "Calculator");
      assertDefined(calculator);

      const body = getSymbolBody(calculator, content);

      expect(body).toContain("private value");
      expect(body).toContain("add(x: number)");
    });

    it("extracts method body", async () => {
      const content = `
class Service {
  process(data: string): string {
    const result = data.trim();
    return result.toUpperCase();
  }
}`;

      const symbols = await extractSymbols(content, "typescript");
      const service = symbols.find((s) => s.name === "Service");
      assertDefined(service);

      const processMethod = service.children.find((c) => c.name === "process");
      assertDefined(processMethod);

      const body = getSymbolBody(processMethod, content);

      expect(body).toContain("const result = data.trim()");
    });
  });

  // ==========================================================================
  // getSymbolText
  // ==========================================================================

  describe("getSymbolText", () => {
    it("gets full function text including signature", async () => {
      const content = `
function greet(name: string): string {
  return "Hello, " + name;
}`;

      const symbols = await extractSymbols(content, "typescript");
      const greet = symbols.find((s) => s.name === "greet");
      assertDefined(greet);

      const text = getSymbolText(greet, content);

      expect(text).toContain("function greet(name: string): string");
      expect(text).toContain("return \"Hello, \" + name");
    });

    it("gets full class text", async () => {
      const content = `
export class User {
  constructor(public name: string) {}

  greet(): string {
    return "Hi, I'm " + this.name;
  }
}`;

      const symbols = await extractSymbols(content, "typescript");
      const user = symbols.find((s) => s.name === "User");
      assertDefined(user);

      const text = getSymbolText(user, content);

      expect(text).toContain("class User");
      expect(text).toContain("constructor");
      expect(text).toContain("greet()");
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe("Performance", () => {
    beforeEach(() => {
      clearSymbolCaches();
    });

    it("extracts 500-line file under 500ms (cold)", async () => {
      const content = generateLargeTypeScriptFile(500);

      const { result, elapsed } = await measurePerformance(
        "extract-500-lines-cold",
        () => extractSymbols(content, "typescript"),
        500
      );

      expect(result.length).toBeGreaterThan(0);
      console.log(`Cold extraction: ${elapsed.toFixed(2)}ms, ${result.length} top-level symbols`);
    });

    it("extracts 500-line file under 50ms (cached)", async () => {
      const content = generateLargeTypeScriptFile(500);

      // First call to populate cache
      await extractSymbols(content, "typescript");

      // Second call should be cached
      const { result, elapsed } = await measurePerformance(
        "extract-500-lines-cached",
        () => extractSymbols(content, "typescript"),
        50
      );

      expect(result.length).toBeGreaterThan(0);
      console.log(`Cached extraction: ${elapsed.toFixed(2)}ms`);
    });

    it("extracts 1000-line file under 1000ms", async () => {
      const content = generateLargeTypeScriptFile(1000);

      const { result, elapsed } = await measurePerformance(
        "extract-1000-lines",
        () => extractSymbols(content, "typescript"),
        1000
      );

      expect(result.length).toBeGreaterThan(0);
      console.log(`1000-line extraction: ${elapsed.toFixed(2)}ms, ${result.length} top-level symbols`);
    });

    it("flattens large symbol tree efficiently", async () => {
      const content = generateLargeTypeScriptFile(500);
      const symbols = await extractSymbols(content, "typescript");

      const { result, elapsed } = await measurePerformance(
        "flatten-symbols",
        async () => flattenSymbols(symbols),
        50
      );

      expect(result.length).toBeGreaterThanOrEqual(symbols.length);
      console.log(`Flatten: ${elapsed.toFixed(2)}ms, ${result.length} total symbols`);
    });

    it("handles batch extraction efficiently", async () => {
      const files = Array.from({ length: 10 }, (_, i) => ({
        content: `
function file${i}Function() { return ${i}; }
class File${i}Class {
  method() { return ${i}; }
}
`,
      }));

      const { elapsed } = await measurePerformance(
        "batch-extract-10-files",
        async () => {
          const results = await Promise.all(
            files.map((f) => extractSymbols(f.content, "typescript"))
          );
          return results;
        },
        500
      );

      console.log(`Batch extraction (10 files): ${elapsed.toFixed(2)}ms`);
    });
  });

  // ==========================================================================
  // Cache Tests
  // ==========================================================================

  describe("Caching", () => {
    beforeEach(() => {
      clearSymbolCaches();
    });

    it("caches extraction results", async () => {
      const content = `class Test { method() {} }`;

      const statsBefore = getSymbolCacheStats();
      expect(statsBefore.symbolCache.size).toBe(0);

      await extractSymbols(content, "typescript");

      const statsAfter = getSymbolCacheStats();
      expect(statsAfter.symbolCache.size).toBe(1);
    });

    it("returns same results for same content", async () => {
      const content = `function test() { return 42; }`;

      const result1 = await extractSymbols(content, "typescript");
      const result2 = await extractSymbols(content, "typescript");

      // Results should be equal (from cache)
      expect(result1).toEqual(result2);
    });

    it("different content produces different cache entries", async () => {
      const content1 = `function a() {}`;
      const content2 = `function b() {}`;

      await extractSymbols(content1, "typescript");
      await extractSymbols(content2, "typescript");

      const stats = getSymbolCacheStats();
      expect(stats.symbolCache.size).toBe(2);
    });

    it("clearSymbolCaches empties the cache", async () => {
      const content = `class Test {}`;

      await extractSymbols(content, "typescript");
      expect(getSymbolCacheStats().symbolCache.size).toBe(1);

      clearSymbolCaches();
      expect(getSymbolCacheStats().symbolCache.size).toBe(0);
    });
  });

  // ==========================================================================
  // Real-world Code Samples
  // ==========================================================================

  describe("Real-world samples", () => {
    it("extracts from simpleClass sample", async () => {
      const symbols = await extractSymbols(samples.simpleClass, "typescript");

      const calculator = symbols.find((s) => s.name === "Calculator");
      assertDefined(calculator);
      expect(calculator.kind).toBe(SymbolKind.Class);
      expect(calculator.children.length).toBeGreaterThanOrEqual(4);
    });

    it("extracts from nestedClass sample", async () => {
      const symbols = await extractSymbols(samples.nestedClass, "typescript");

      const outer = symbols.find((s) => s.name === "Outer");
      assertDefined(outer);

      const flat = flattenSymbols(symbols);
      expect(flat.length).toBeGreaterThan(1);
    });

    it("extracts from functionVariants sample", async () => {
      const symbols = await extractSymbols(samples.functionVariants, "typescript");

      // Should have multiple function types
      expect(symbols.length).toBeGreaterThanOrEqual(5);

      const names = symbols.map((s) => s.name);
      expect(names).toContain("regularFunction");
      expect(names).toContain("asyncFunction");
    });

    it("extracts from interfacesAndTypes sample", async () => {
      const symbols = await extractSymbols(samples.interfacesAndTypes, "typescript");

      // Should have interfaces and types
      expect(symbols.length).toBeGreaterThanOrEqual(4);

      const user = symbols.find((s) => s.name === "User");
      assertDefined(user);
      expect(user.kind).toBe(SymbolKind.Interface);
    });

    it("extracts from Python sample", async () => {
      const symbols = await extractSymbols(samples.pythonSample, "python");

      // Should have classes and functions
      expect(symbols.length).toBeGreaterThanOrEqual(3);

      const userClass = symbols.find((s) => s.name === "User");
      assertDefined(userClass);

      const userService = symbols.find((s) => s.name === "UserService");
      assertDefined(userService);
    });
  });

  // ==========================================================================
  // Location Accuracy
  // ==========================================================================

  describe("Location accuracy", () => {
    it("provides accurate line numbers", async () => {
      const content = `// Line 1
// Line 2
function test() { // Line 3
  return 42;      // Line 4
}                 // Line 5
`;

      const symbols = await extractSymbols(content, "typescript");
      const test = symbols.find((s) => s.name === "test");
      assertDefined(test);

      // Function starts on line 3 (0-indexed = 2)
      expect(test.location.startLine).toBe(2);
    });

    it("provides accurate column positions", async () => {
      const content = `    function indented() {}`;

      const symbols = await extractSymbols(content, "typescript");
      const indented = symbols.find((s) => s.name === "indented");
      assertDefined(indented);

      // Function starts at column 4 (0-indexed)
      expect(indented.location.startColumn).toBe(4);
    });

    it("provides accurate byte offsets", async () => {
      const content = `function first() {}\nfunction second() {}`;

      const symbols = await extractSymbols(content, "typescript");

      expect(symbols.length).toBe(2);

      const first = symbols.find((s) => s.name === "first");
      const second = symbols.find((s) => s.name === "second");

      assertDefined(first);
      assertDefined(second);

      // First function starts at offset 0
      expect(first.location.startOffset).toBe(0);

      // Second function starts after first function + newline
      expect(second.location.startOffset).toBe(20);
    });
  });
});
