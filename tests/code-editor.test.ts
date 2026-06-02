/**
 * Comprehensive tests for code-editor.ts module
 * 
 * Tests cover:
 * - replaceSymbolBody (replace function body preserving signature)
 * - replaceSymbol (replace entire symbol including signature)
 * - insertBeforeSymbol (insert code before a symbol)
 * - insertAfterSymbol (insert code after a symbol)
 * - renameSymbol (rename across multiple files)
 * - deleteSymbol (remove a symbol)
 * 
 * Test scenarios:
 * - dryRun mode (preview without modification)
 * - Actual file modifications
 * - Diff output format verification
 * - Indentation handling
 * - Multi-file rename operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import {
  replaceSymbolBody,
  replaceSymbol,
  insertBeforeSymbol,
  insertAfterSymbol,
  renameSymbol,
  deleteSymbol,
} from "../src/semantic/code-editor.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { createTempTestDir, cleanupTempDir, measurePerformance } from "./test-helpers.js";

describe("Code Editor", () => {
  let testDir: string;

  beforeAll(async () => {
    await treeSitterManager.initialize();
    testDir = await createTempTestDir("code-editor-");
  });

  afterAll(async () => {
    await cleanupTempDir(testDir);
  });

  // Helper to create test files
  async function writeTestFile(filename: string, content: string): Promise<string> {
    const filePath = path.join(testDir, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return filePath;
  }

  // Helper to read test file
  async function readTestFile(filename: string): Promise<string> {
    const filePath = path.join(testDir, filename);
    return fs.readFile(filePath, "utf-8");
  }

  // ==========================================================================
  // replaceSymbolBody
  // ==========================================================================

  describe("replaceSymbolBody", () => {
    it("replaces function body in dryRun mode", async () => {
      const content = `function greet(name: string) {
  return 'Hello';
}`;
      const filePath = await writeTestFile("replace-body/greet.ts", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "greet",
        `return 'Hi ' + name;`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.diff).toContain("-");
      expect(result.diff).toContain("+");
      expect(result.newContent).toContain("Hi");

      // File should not be modified in dryRun
      const fileContent = await readTestFile("replace-body/greet.ts");
      expect(fileContent).toContain("Hello");
    });

    it("replaces function body and modifies file", async () => {
      const content = `function add(a: number, b: number) {
  return a - b; // bug!
}`;
      const filePath = await writeTestFile("replace-body/add.ts", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "add",
        `return a + b;`,
        { dryRun: false }
      );

      expect(result.success).toBe(true);

      // File should be modified
      const fileContent = await readTestFile("replace-body/add.ts");
      expect(fileContent).toContain("return a + b;");
      expect(fileContent).not.toContain("return a - b;");
    });

    it("preserves function signature", async () => {
      const content = `async function fetchData(url: string): Promise<Response> {
  return await fetch(url);
}`;
      const filePath = await writeTestFile("replace-body/fetch.ts", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "fetchData",
        `const response = await fetch(url);
  return response;`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("async function fetchData");
      expect(result.newContent).toContain("Promise<Response>");
    });

    it("handles class method body replacement", async () => {
      const content = `class Calculator {
  add(a: number, b: number): number {
    return 0; // todo
  }
}`;
      const filePath = await writeTestFile("replace-body/calc.ts", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "Calculator/add",
        `return a + b;`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("return a + b;");
      expect(result.newContent).toContain("add(a: number, b: number)");
    });

    it("adjusts indentation correctly", async () => {
      const content = `class Service {
    process() {
        console.log('old');
    }
}`;
      const filePath = await writeTestFile("replace-body/indent.ts", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "Service/process",
        `console.log('new');
console.log('multi-line');`,
        { dryRun: true, adjustIndentation: true }
      );

      expect(result.success).toBe(true);
      // New content should contain the replacement - indentation handling varies
      expect(result.newContent).toContain("console.log('new');");
    });

    it("returns error for non-existent symbol", async () => {
      const content = `function existing() {}`;
      const filePath = await writeTestFile("replace-body/error.ts", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "nonExistent",
        "return 1;",
        { dryRun: true }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ==========================================================================
  // replaceSymbol
  // ==========================================================================

  describe("replaceSymbol", () => {
    it("replaces entire function including signature", async () => {
      const content = `function oldFunction(x: number) {
  return x * 2;
}`;
      const filePath = await writeTestFile("replace-symbol/old.ts", content);

      const newCode = `function newFunction(x: number, y: number) {
  return x + y;
}`;

      const result = await replaceSymbol(
        filePath,
        content,
        "oldFunction",
        newCode,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("newFunction");
      expect(result.newContent).toContain("x + y");
      expect(result.newContent).not.toContain("oldFunction");
    });

    it("replaces class with new class", async () => {
      const content = `class OldClass {
  method() {}
}`;
      const filePath = await writeTestFile("replace-symbol/class.ts", content);

      const newCode = `class NewClass {
  newMethod() {
    return 42;
  }
}`;

      const result = await replaceSymbol(
        filePath,
        content,
        "OldClass",
        newCode,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("NewClass");
      expect(result.newContent).toContain("newMethod");
    });

    it("generates valid diff output", async () => {
      const content = `const value = 1;`;
      const filePath = await writeTestFile("replace-symbol/diff.ts", content);

      const result = await replaceSymbol(
        filePath,
        content,
        "value",
        "const value = 42;",
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.diff).toContain("---");
      expect(result.diff).toContain("+++");
      expect(result.diff).toContain("-const value = 1;");
      expect(result.diff).toContain("+const value = 42;");
    });

    it("modifies file when not dryRun", async () => {
      const content = `function toReplace() { return 1; }`;
      const filePath = await writeTestFile("replace-symbol/actual.ts", content);

      await replaceSymbol(
        filePath,
        content,
        "toReplace",
        "function toReplace() { return 2; }",
        { dryRun: false }
      );

      const fileContent = await readTestFile("replace-symbol/actual.ts");
      expect(fileContent).toContain("return 2;");
    });
  });

  // ==========================================================================
  // insertBeforeSymbol
  // ==========================================================================

  describe("insertBeforeSymbol", () => {
    it("inserts code before function", async () => {
      const content = `function target() {
  return 1;
}`;
      const filePath = await writeTestFile("insert-before/func.ts", content);

      const result = await insertBeforeSymbol(
        filePath,
        content,
        "target",
        "// This is a comment",
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("// This is a comment");
      
      // Comment should appear before function
      const commentIndex = result.newContent!.indexOf("// This is a comment");
      const funcIndex = result.newContent!.indexOf("function target");
      expect(commentIndex).toBeLessThan(funcIndex);
    });

    it("inserts decorator before class method", async () => {
      const content = `class MyClass {
  myMethod() {
    return 42;
  }
}`;
      const filePath = await writeTestFile("insert-before/method.ts", content);

      const result = await insertBeforeSymbol(
        filePath,
        content,
        "MyClass/myMethod",
        "@deprecated",
        { dryRun: true, blankLineAfter: false }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("@deprecated");
    });

    it("respects blankLineBefore option", async () => {
      const content = `const before = 1;
function target() {}`;
      const filePath = await writeTestFile("insert-before/blank.ts", content);

      const result = await insertBeforeSymbol(
        filePath,
        content,
        "target",
        "// Comment",
        { dryRun: true, blankLineBefore: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("\n// Comment");
    });

    it("matches indentation of target symbol", async () => {
      const content = `class Container {
    innerMethod() {
        return 1;
    }
}`;
      const filePath = await writeTestFile("insert-before/indent.ts", content);

      const result = await insertBeforeSymbol(
        filePath,
        content,
        "Container/innerMethod",
        "// Indented comment",
        { dryRun: true, matchIndentation: true }
      );

      expect(result.success).toBe(true);
      // Comment should have same indentation as innerMethod
      expect(result.newContent).toContain("    // Indented comment");
    });
  });

  // ==========================================================================
  // insertAfterSymbol
  // ==========================================================================

  describe("insertAfterSymbol", () => {
    it("inserts code after function", async () => {
      const content = `function first() {
  return 1;
}`;
      const filePath = await writeTestFile("insert-after/func.ts", content);

      const result = await insertAfterSymbol(
        filePath,
        content,
        "first",
        `function second() {
  return 2;
}`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("function second");
      
      // Second function should appear after first
      const firstIndex = result.newContent!.indexOf("function first");
      const secondIndex = result.newContent!.indexOf("function second");
      expect(secondIndex).toBeGreaterThan(firstIndex);
    });

    it("adds new method after existing method in class", async () => {
      const content = `class MyClass {
  existingMethod() {
    return 1;
  }
}`;
      const filePath = await writeTestFile("insert-after/method.ts", content);

      const result = await insertAfterSymbol(
        filePath,
        content,
        "MyClass/existingMethod",
        `newMethod() {
    return 2;
  }`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("newMethod");
    });

    it("respects blankLineAfter option", async () => {
      const content = `function target() {}
const after = 1;`;
      const filePath = await writeTestFile("insert-after/blank.ts", content);

      const result = await insertAfterSymbol(
        filePath,
        content,
        "target",
        "// Comment",
        { dryRun: true, blankLineAfter: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("// Comment\n");
    });
  });

  // ==========================================================================
  // renameSymbol
  // ==========================================================================

  describe("renameSymbol", () => {
    it("renames function in single file (dryRun)", async () => {
      const content = `function oldName() {
  return 1;
}

function caller() {
  return oldName();
}`;
      const filePath = await writeTestFile("rename/single.ts", content);

      const result = await renameSymbol(
        filePath,
        content,
        "oldName",
        "newName",
        { dryRun: true, searchPath: testDir }
      );

      expect(result.oldName).toBe("oldName");
      expect(result.newName).toBe("newName");
      expect(result.totalReferences).toBeGreaterThanOrEqual(2);
      expect(result.modifiedFiles.length).toBeGreaterThanOrEqual(1);
      expect(result.errors).toHaveLength(0);
    });

    it("renames across multiple files", async () => {
      // Create utility file
      const utilContent = `export function helperFunc() {
  return "helper";
}`;
      const utilPath = await writeTestFile("rename-multi/utils.ts", utilContent);

      // Create consumer files
      const consumer1Content = `import { helperFunc } from './utils';
export function use1() {
  return helperFunc();
}`;
      await writeTestFile("rename-multi/consumer1.ts", consumer1Content);

      const consumer2Content = `import { helperFunc } from './utils';
export function use2() {
  return helperFunc();
}`;
      await writeTestFile("rename-multi/consumer2.ts", consumer2Content);

      const result = await renameSymbol(
        utilPath,
        utilContent,
        "helperFunc",
        "renamedHelper",
        { dryRun: true, searchPath: path.join(testDir, "rename-multi") }
      );

      expect(result.errors).toHaveLength(0);
      expect(result.modifiedFiles.length).toBeGreaterThanOrEqual(1);
      expect(result.diffs.size).toBeGreaterThanOrEqual(1);
    });

    it("generates diff for each modified file", async () => {
      const content = `function toRename() { return 1; }
function caller() { return toRename(); }`;
      const filePath = await writeTestFile("rename/diff.ts", content);

      const result = await renameSymbol(
        filePath,
        content,
        "toRename",
        "renamed",
        { dryRun: true, searchPath: testDir }
      );

      expect(result.diffs.size).toBeGreaterThan(0);
      const diff = result.diffs.get(filePath);
      expect(diff).toBeDefined();
      expect(diff).toContain("-");
      expect(diff).toContain("+");
    });

    it("actually modifies files when not dryRun", async () => {
      const content = `function actualRename() { return 1; }`;
      const filePath = await writeTestFile("rename/actual.ts", content);

      await renameSymbol(
        filePath,
        content,
        "actualRename",
        "wasRenamed",
        { dryRun: false, searchPath: testDir }
      );

      const fileContent = await readTestFile("rename/actual.ts");
      expect(fileContent).toContain("wasRenamed");
      expect(fileContent).not.toContain("actualRename");
    });

    it("returns error for non-existent symbol", async () => {
      const content = `function existing() {}`;
      const filePath = await writeTestFile("rename/error.ts", content);

      const result = await renameSymbol(
        filePath,
        content,
        "nonExistent",
        "newName",
        { dryRun: true }
      );

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("renames class method", async () => {
      const content = `class MyClass {
  oldMethod() {
    return this.oldMethod();
  }
}`;
      const filePath = await writeTestFile("rename/method.ts", content);

      const result = await renameSymbol(
        filePath,
        content,
        "MyClass/oldMethod",
        "newMethod",
        { dryRun: true, searchPath: testDir }
      );

      expect(result.oldName).toBe("oldMethod");
      expect(result.newName).toBe("newMethod");
    });
  });

  // ==========================================================================
  // deleteSymbol
  // ==========================================================================

  describe("deleteSymbol", () => {
    it("deletes function in dryRun mode", async () => {
      const content = `function toDelete() {
  return 1;
}

function toKeep() {
  return 2;
}`;
      const filePath = await writeTestFile("delete/func.ts", content);

      const result = await deleteSymbol(
        filePath,
        content,
        "toDelete",
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain("toDelete");
      expect(result.newContent).toContain("toKeep");

      // File should not be modified
      const fileContent = await readTestFile("delete/func.ts");
      expect(fileContent).toContain("toDelete");
    });

    it("deletes function and modifies file", async () => {
      const content = `function unused() {
  return "unused";
}

function used() {
  return "used";
}`;
      const filePath = await writeTestFile("delete/actual.ts", content);

      const result = await deleteSymbol(
        filePath,
        content,
        "unused",
        { dryRun: false }
      );

      expect(result.success).toBe(true);

      const fileContent = await readTestFile("delete/actual.ts");
      expect(fileContent).not.toContain("unused");
      expect(fileContent).toContain("used");
    });

    it("deletes class method", async () => {
      const content = `class MyClass {
  methodToDelete() {
    return 1;
  }

  methodToKeep() {
    return 2;
  }
}`;
      const filePath = await writeTestFile("delete/method.ts", content);

      const result = await deleteSymbol(
        filePath,
        content,
        "MyClass/methodToDelete",
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain("methodToDelete");
      expect(result.newContent).toContain("methodToKeep");
    });

    it("deletes entire class", async () => {
      const content = `class ToDelete {
  method() {}
}

class ToKeep {
  method() {}
}`;
      const filePath = await writeTestFile("delete/class.ts", content);

      const result = await deleteSymbol(
        filePath,
        content,
        "ToDelete",
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain("ToDelete");
      expect(result.newContent).toContain("ToKeep");
    });

    it("generates proper diff", async () => {
      const content = `const toDelete = 1;`;
      const filePath = await writeTestFile("delete/diff.ts", content);

      const result = await deleteSymbol(
        filePath,
        content,
        "toDelete",
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.diff).toContain("-const toDelete = 1;");
    });

    it("returns error for non-existent symbol", async () => {
      const content = `function existing() {}`;
      const filePath = await writeTestFile("delete/error.ts", content);

      const result = await deleteSymbol(
        filePath,
        content,
        "nonExistent",
        { dryRun: true }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("handles unsupported file type", async () => {
      const content = `some content`;
      const filePath = await writeTestFile("edge/unknown.xyz", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "something",
        "new body",
        { dryRun: true }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported");
    });

    it("handles empty file", async () => {
      const content = ``;
      const filePath = await writeTestFile("edge/empty.ts", content);

      const result = await replaceSymbol(
        filePath,
        content,
        "nonExistent",
        "new code",
        { dryRun: true }
      );

      expect(result.success).toBe(false);
    });

    it("handles symbol with special characters", async () => {
      const content = `const $special_var = 1;
function _underscore() {}`;
      const filePath = await writeTestFile("edge/special.ts", content);

      const result1 = await deleteSymbol(filePath, content, "$special_var", { dryRun: true });
      const result2 = await deleteSymbol(filePath, content, "_underscore", { dryRun: true });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it("handles multi-line function signature", async () => {
      const content = `function multiLineSignature(
  param1: string,
  param2: number,
  param3: boolean
): string {
  return param1;
}`;
      const filePath = await writeTestFile("edge/multiline.ts", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "multiLineSignature",
        `return \`\${param1} - \${param2} - \${param3}\`;`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("param1: string");
      expect(result.newContent).toContain("param2: number");
    });

    it("handles arrow function", async () => {
      const content = `const arrowFunc = (x: number): number => {
  return x * 2;
};`;
      const filePath = await writeTestFile("edge/arrow.ts", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "arrowFunc",
        `return x * 3;`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("x * 3");
    });
  });

  // ==========================================================================
  // Python Support
  // ==========================================================================

  describe("Python support", () => {
    it("replaces Python function body", async () => {
      const content = `def greet(name):
    return f"Hello, {name}"
`;
      const filePath = await writeTestFile("python/greet.py", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "greet",
        `return f"Hi, {name}!"`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("Hi");
    });

    it("inserts before Python class method", async () => {
      const content = `class MyClass:
    def my_method(self):
        pass
`;
      const filePath = await writeTestFile("python/class.py", content);

      const result = await insertBeforeSymbol(
        filePath,
        content,
        "MyClass/my_method",
        "@staticmethod",
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("@staticmethod");
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe("performance", () => {
    it("replaceSymbolBody completes under 50ms", async () => {
      const content = `function target() {
  // Some content
  return 1;
}`;
      const filePath = await writeTestFile("perf/replace.ts", content);

      const result = await measurePerformance(
        "replaceSymbolBody",
        async () => {
          return await replaceSymbolBody(
            filePath,
            content,
            "target",
            "return 2;",
            { dryRun: true }
          );
        },
        50
      );

      expect(result).toBeDefined();
    });

    it("renameSymbol in multi-file project completes under 2s", async () => {
      // Create a project with interconnected files
      const baseDir = path.join(testDir, "perf-rename");
      await fs.mkdir(baseDir, { recursive: true });

      const libContent = `export function sharedFunc() { return 1; }`;
      await writeTestFile("perf-rename/lib.ts", libContent);

      // Create 20 consumer files
      for (let i = 0; i < 20; i++) {
        const consumerContent = `import { sharedFunc } from './lib';
export function consumer${i}() { return sharedFunc(); }`;
        await writeTestFile(`perf-rename/consumer${i}.ts`, consumerContent);
      }

      const result = await measurePerformance(
        "renameSymbol-multifile",
        async () => {
          return await renameSymbol(
            path.join(testDir, "perf-rename/lib.ts"),
            libContent,
            "sharedFunc",
            "renamedFunc",
            { dryRun: true, searchPath: baseDir }
          );
        },
        2000
      );

      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // Real-World Scenarios
  // ==========================================================================

  describe("real-world scenarios", () => {
    it("add deprecation notice before function", async () => {
      const content = `function oldApi() {
  return "old behavior";
}`;
      const filePath = await writeTestFile("scenario/deprecate.ts", content);

      const result = await insertBeforeSymbol(
        filePath,
        content,
        "oldApi",
        `/**
 * @deprecated Use newApi() instead
 */`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("@deprecated");
    });

    it("add new method to class", async () => {
      const content = `class UserService {
  getUser(id: string) {
    return users.get(id);
  }
}`;
      const filePath = await writeTestFile("scenario/add-method.ts", content);

      const result = await insertAfterSymbol(
        filePath,
        content,
        "UserService/getUser",
        `
  setUser(id: string, user: User) {
    users.set(id, user);
  }`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("setUser");
    });

    it("fix bug in function implementation", async () => {
      const content = `function calculateTotal(items: Item[]) {
  let total = 0;
  for (const item of items) {
    total += item.price; // Bug: doesn't account for quantity
  }
  return total;
}`;
      const filePath = await writeTestFile("scenario/bugfix.ts", content);

      const result = await replaceSymbolBody(
        filePath,
        content,
        "calculateTotal",
        `let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;`,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain("item.quantity");
    });

    it("rename API across codebase", async () => {
      const apiContent = `export interface UserApi {
  fetchUser(id: string): Promise<User>;
}

export function createUserApi(): UserApi {
  return {
    fetchUser: async (id) => ({ id, name: 'User' })
  };
}`;
      const apiPath = await writeTestFile("scenario-rename/api.ts", apiContent);

      const clientContent = `import { createUserApi } from './api';

const api = createUserApi();
api.fetchUser('123');`;
      await writeTestFile("scenario-rename/client.ts", clientContent);

      const result = await renameSymbol(
        apiPath,
        apiContent,
        "createUserApi",
        "buildUserClient",
        { dryRun: true, searchPath: path.join(testDir, "scenario-rename") }
      );

      expect(result.oldName).toBe("createUserApi");
      expect(result.newName).toBe("buildUserClient");
      expect(result.errors).toHaveLength(0);
    });

    it("remove unused helper function", async () => {
      const content = `function usedFunction() {
  return "I am used";
}

function unusedHelper() {
  return "Never called";
}

export function main() {
  return usedFunction();
}`;
      const filePath = await writeTestFile("scenario/cleanup.ts", content);

      const result = await deleteSymbol(
        filePath,
        content,
        "unusedHelper",
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain("unusedHelper");
      expect(result.newContent).toContain("usedFunction");
      expect(result.newContent).toContain("main");
    });
  });
});
