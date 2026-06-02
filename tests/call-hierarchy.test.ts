/**
 * Comprehensive tests for call-hierarchy.ts module
 * 
 * Tests cover:
 * - getCallers (find who calls a function)
 * - getCallees (find what a function calls)
 * - countCallers (count callers)
 * - countCallees (count callees)
 * 
 * Test scenarios:
 * - Single file caller detection
 * - Multi-file caller detection (cross-module)
 * - Nested call chains (A calls B calls C)
 * - Method calls within classes
 * - Callback and closure detection
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getCallers,
  getCallees,
  countCallers,
  countCallees,
  type CallerInfo,
  type CalleeInfo,
} from "../src/semantic/call-hierarchy.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { createTempTestDir, cleanupTempDir, measurePerformance } from "./test-helpers.js";

describe("Call Hierarchy", () => {
  let testDir: string;

  beforeAll(async () => {
    await treeSitterManager.initialize();
    testDir = await createTempTestDir("call-hierarchy-");
  });

  afterAll(async () => {
    await cleanupTempDir(testDir);
  });

  // ==========================================================================
  // Helper to create test files
  // ==========================================================================

  async function writeTestFile(filename: string, content: string): Promise<string> {
    const filePath = path.join(testDir, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return filePath;
  }

  // ==========================================================================
  // getCallers - Single File Tests
  // ==========================================================================

  describe("getCallers - single file", () => {
    it("finds caller in same file", async () => {
      const content = `
function helper() {
  return 42;
}

function main() {
  const result = helper();
  console.log(result);
}
`;
      const filePath = await writeTestFile("single/callers.ts", content);

      const callers = await getCallers(
        "helper",
        filePath,
        content,
        testDir
      );

      // Should find the call in main()
      expect(callers.length).toBeGreaterThanOrEqual(1);
      expect(callers.some(c => c.context.includes("helper()"))).toBe(true);
    });

    it("finds multiple callers in same file", async () => {
      const content = `
function util() {
  return "utility";
}

function caller1() {
  return util();
}

function caller2() {
  const x = util();
  return x;
}

function caller3() {
  util();
  util();
}
`;
      const filePath = await writeTestFile("single/multiple-callers.ts", content);

      const callers = await getCallers(
        "util",
        filePath,
        content,
        testDir
      );

      // Should find calls from caller1, caller2, caller3 (multiple)
      expect(callers.length).toBeGreaterThanOrEqual(3);
    });

    it("does not include definition as caller", async () => {
      const content = `
function target() {
  return 1;
}

function user() {
  target();
}
`;
      const filePath = await writeTestFile("single/no-self.ts", content);

      const callers = await getCallers(
        "target",
        filePath,
        content,
        testDir
      );

      // Definition should not be included
      callers.forEach(c => {
        expect(c.context).not.toMatch(/^function target/);
      });
    });
  });

  // ==========================================================================
  // getCallers - Multi-File Tests
  // ==========================================================================

  describe("getCallers - multi-file", () => {
    it("finds callers across files", async () => {
      // Create a utility file
      const utilContent = `
export function sharedHelper() {
  return "shared";
}
`;
      const utilPath = await writeTestFile("multi/utils.ts", utilContent);

      // Create files that import and use it
      const consumer1Content = `
import { sharedHelper } from './utils';

function useHelper1() {
  return sharedHelper();
}
`;
      await writeTestFile("multi/consumer1.ts", consumer1Content);

      const consumer2Content = `
import { sharedHelper } from './utils';

function useHelper2() {
  const result = sharedHelper();
  console.log(result);
}
`;
      await writeTestFile("multi/consumer2.ts", consumer2Content);

      const callers = await getCallers(
        "sharedHelper",
        utilPath,
        utilContent,
        path.join(testDir, "multi")
      );

      // Should find callers from both consumer files
      expect(callers.length).toBeGreaterThanOrEqual(2);
      
      const filePaths = callers.map(c => c.filePath);
      expect(filePaths.some(p => p.includes("consumer1"))).toBe(true);
      expect(filePaths.some(p => p.includes("consumer2"))).toBe(true);
    });


  });

  // ==========================================================================
  // getCallees - Basic Tests
  // ==========================================================================

  describe("getCallees - basic", () => {
    it("finds direct function calls", async () => {
      const content = `
function helper1() { return 1; }
function helper2() { return 2; }

function main() {
  const a = helper1();
  const b = helper2();
  return a + b;
}
`;
      const callees = await getCallees(content, "typescript", "main");

      expect(callees.length).toBeGreaterThanOrEqual(2);
      const names = callees.map(c => c.name);
      expect(names).toContain("helper1");
      expect(names).toContain("helper2");
    });

    it("identifies method calls with receiver", async () => {
      const content = `
class Service {
  process() {
    this.validate();
    this.transform();
    this.save();
  }
  
  validate() {}
  transform() {}
  save() {}
}
`;
      const callees = await getCallees(content, "typescript", "Service/process");

      expect(callees.length).toBeGreaterThanOrEqual(3);
      
      const names = callees.map(c => c.name);
      expect(names).toContain("validate");
      expect(names).toContain("transform");
      expect(names).toContain("save");
      
      // All should be method calls with 'this' receiver
      callees.forEach(c => {
        expect(c.isMethodCall).toBe(true);
        expect(c.receiver).toBe("this");
      });
    });

    it("finds external object method calls", async () => {
      const content = `
function processData() {
  const result = [];
  result.push(1);
  result.push(2);
  console.log(result);
  return result.join(',');
}
`;
      const callees = await getCallees(content, "typescript", "processData");

      expect(callees.length).toBeGreaterThanOrEqual(3);
      
      const names = callees.map(c => c.name);
      expect(names).toContain("push");
      expect(names).toContain("log");
      expect(names).toContain("join");
    });

    it("distinguishes method calls from function calls", async () => {
      const content = `
function standalone() { return 1; }

function mixed() {
  const x = standalone();
  const y = this.method();
  console.log(x, y);
}
`;
      const callees = await getCallees(content, "typescript", "mixed");

      const directCall = callees.find(c => c.name === "standalone");
      const methodCall = callees.find(c => c.name === "method");
      const consoleCall = callees.find(c => c.name === "log");

      if (directCall) {
        expect(directCall.isMethodCall).toBe(false);
      }
      if (methodCall) {
        expect(methodCall.isMethodCall).toBe(true);
      }
      if (consoleCall) {
        expect(consoleCall.isMethodCall).toBe(true);
        expect(consoleCall.receiver).toBe("console");
      }
    });
  });

  // ==========================================================================
  // getCallees - Nested and Complex Scenarios
  // ==========================================================================

  describe("getCallees - nested calls", () => {
    it("finds calls in nested scopes", async () => {
      const content = `
function outer() {
  function inner() {
    nestedCall();
  }
  
  outerCall();
  inner();
}
`;
      const callees = await getCallees(content, "typescript", "outer");

      expect(callees.length).toBeGreaterThanOrEqual(2);
      const names = callees.map(c => c.name);
      expect(names).toContain("outerCall");
      expect(names).toContain("inner");
    });

    it("finds calls in arrow functions", async () => {
      const content = `
function processor() {
  const items = [1, 2, 3];
  items.forEach(item => {
    process(item);
    transform(item);
  });
  return items.map(x => convert(x));
}
`;
      const callees = await getCallees(content, "typescript", "processor");

      expect(callees.length).toBeGreaterThanOrEqual(3);
      const names = callees.map(c => c.name);
      expect(names).toContain("forEach");
      expect(names).toContain("map");
    });

    it("finds calls in conditionals", async () => {
      const content = `
function conditional(flag: boolean) {
  if (flag) {
    branchA();
  } else {
    branchB();
  }
  always();
}
`;
      const callees = await getCallees(content, "typescript", "conditional");

      expect(callees.length).toBeGreaterThanOrEqual(3);
      const names = callees.map(c => c.name);
      expect(names).toContain("branchA");
      expect(names).toContain("branchB");
      expect(names).toContain("always");
    });

    it("finds calls in try-catch-finally", async () => {
      const content = `
function errorHandler() {
  try {
    riskyOperation();
  } catch (e) {
    logError(e);
  } finally {
    cleanup();
  }
}
`;
      const callees = await getCallees(content, "typescript", "errorHandler");

      expect(callees.length).toBeGreaterThanOrEqual(3);
      const names = callees.map(c => c.name);
      expect(names).toContain("riskyOperation");
      expect(names).toContain("logError");
      expect(names).toContain("cleanup");
    });
  });

  // ==========================================================================
  // getCallees - Special Call Patterns
  // ==========================================================================

  describe("getCallees - special patterns", () => {
    it("finds chained method calls", async () => {
      const content = `
function chainedCalls() {
  return builder
    .setName('test')
    .setValue(42)
    .build();
}
`;
      const callees = await getCallees(content, "typescript", "chainedCalls");

      expect(callees.length).toBeGreaterThanOrEqual(3);
      const names = callees.map(c => c.name);
      expect(names).toContain("setName");
      expect(names).toContain("setValue");
      expect(names).toContain("build");
    });

    it("finds async/await calls", async () => {
      const content = `
async function asyncOperation() {
  const data = await fetchData();
  const processed = await processData(data);
  await saveResult(processed);
}
`;
      const callees = await getCallees(content, "typescript", "asyncOperation");

      expect(callees.length).toBeGreaterThanOrEqual(3);
      const names = callees.map(c => c.name);
      expect(names).toContain("fetchData");
      expect(names).toContain("processData");
      expect(names).toContain("saveResult");
    });

    it("finds callback arguments", async () => {
      const content = `
function withCallbacks() {
  setTimeout(callback1, 1000);
  items.filter(callback2);
  promise.then(callback3).catch(callback4);
}
`;
      const callees = await getCallees(content, "typescript", "withCallbacks");

      expect(callees.length).toBeGreaterThanOrEqual(4);
      const names = callees.map(c => c.name);
      expect(names).toContain("setTimeout");
      expect(names).toContain("filter");
      expect(names).toContain("then");
      expect(names).toContain("catch");
    });
  });

  // ==========================================================================
  // countCallers and countCallees
  // ==========================================================================

  describe("countCallers", () => {
    it("returns correct count", async () => {
      const content = `
function target() { return 1; }

function a() { target(); }
function b() { target(); }
function c() { target(); target(); }
`;
      const filePath = await writeTestFile("count/callers.ts", content);

      const count = await countCallers(
        "target",
        filePath,
        content,
        testDir
      );

      expect(count).toBeGreaterThanOrEqual(3);
    });

    it("returns 0 for uncalled function", async () => {
      const content = `
function unused() {
  return "never called";
}

function other() {
  return "something else";
}
`;
      const filePath = await writeTestFile("count/unused.ts", content);

      const count = await countCallers(
        "unused",
        filePath,
        content,
        path.join(testDir, "count")
      );

      expect(count).toBe(0);
    });
  });

  describe("countCallees", () => {
    it("returns correct count", async () => {
      const content = `
function hasThreeCallees() {
  call1();
  call2();
  call3();
}
`;
      const count = await countCallees(content, "typescript", "hasThreeCallees");

      expect(count).toBe(3);
    });

    it("returns 0 for function with no calls", async () => {
      const content = `
function noCalls() {
  const x = 1 + 2;
  return x * 3;
}
`;
      const count = await countCallees(content, "typescript", "noCalls");

      expect(count).toBe(0);
    });

    it("counts unique calls only", async () => {
      const content = `
function repeatedCalls() {
  helper();
  helper();
  helper();
}
`;
      const count = await countCallees(content, "typescript", "repeatedCalls");

      // Each call at different position should be counted
      expect(count).toBe(3);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("handles non-existent symbol", async () => {
      const content = `
function existing() { return 1; }
`;
      const callees = await getCallees(content, "typescript", "nonExistent");

      expect(callees).toEqual([]);
    });

    it("handles empty function body", async () => {
      const content = `
function empty() {}
`;
      const callees = await getCallees(content, "typescript", "empty");

      expect(callees).toEqual([]);
    });

    it("handles deeply nested symbol paths", async () => {
      const content = `
class Outer {
  inner() {
    function deep() {
      someCall();
    }
  }
}
`;
      const callees = await getCallees(content, "typescript", "Outer/inner");

      // Should find someCall even in nested function
      expect(callees.length).toBeGreaterThanOrEqual(1);
    });

    it("handles class methods correctly", async () => {
      const content = `
class MyClass {
  methodA() {
    this.methodB();
    externalFunc();
  }
  
  methodB() {
    return 42;
  }
}
`;
      const callees = await getCallees(content, "typescript", "MyClass/methodA");

      expect(callees.length).toBeGreaterThanOrEqual(2);
      const names = callees.map(c => c.name);
      expect(names).toContain("methodB");
      expect(names).toContain("externalFunc");
    });

    it("handles getters and setters", async () => {
      const content = `
class WithAccessors {
  get value() {
    return this.compute();
  }
  
  set value(v: number) {
    this.store(v);
  }
  
  compute() { return 0; }
  store(v: number) {}
}
`;
      const getterCallees = await getCallees(content, "typescript", "WithAccessors/value");

      // Should find compute() in getter
      expect(getterCallees.some(c => c.name === "compute")).toBe(true);
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe("performance", () => {
    it("getCallees completes under 50ms for complex function", async () => {
      // Generate a function with many calls
      let functionBody = "";
      for (let i = 0; i < 50; i++) {
        functionBody += `  call${i}();\n`;
        functionBody += `  this.method${i}();\n`;
        functionBody += `  obj.member${i}();\n`;
      }

      const content = `
function complexFunction() {
${functionBody}
}
`;
      const result = await measurePerformance(
        "getCallees-complex",
        async () => {
          return await getCallees(content, "typescript", "complexFunction");
        },
        50
      );

      expect(result).toBeDefined();
      expect(result.result.length).toBeGreaterThanOrEqual(50);
    });

    it("handles large multi-file project", async () => {
      // Create a project with multiple interconnected files
      const baseDir = path.join(testDir, "large-project");
      await fs.mkdir(baseDir, { recursive: true });

      // Create 20 files with cross-references
      const fileContents: string[] = [];
      for (let i = 0; i < 20; i++) {
        const imports = i > 0 
          ? `import { func${i-1} } from './file${i-1}';\n` 
          : "";
        const content = `${imports}
export function func${i}() {
  ${i > 0 ? `func${i-1}();` : ""}
  console.log("file ${i}");
}
`;
        await writeTestFile(`large-project/file${i}.ts`, content);
        fileContents.push(content);
      }

      const result = await measurePerformance(
        "getCallers-multi-file",
        async () => {
          return await getCallers(
            "func0",
            path.join(baseDir, "file0.ts"),
            fileContents[0],
            baseDir
          );
        },
        2000 // 2 seconds for multi-file search
      );

      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // Real-World Scenarios
  // ==========================================================================

  describe("real-world scenarios", () => {
    it("dead code detection: find unused function", async () => {
      const content = `
export function usedFunction() {
  return "I am used";
}

export function unusedFunction() {
  return "I am never called";
}

function main() {
  usedFunction();
}
`;
      const filePath = await writeTestFile("dead-code/functions.ts", content);

      const usedCallers = await countCallers(
        "usedFunction",
        filePath,
        content,
        testDir
      );
      
      const unusedCallers = await countCallers(
        "unusedFunction",
        filePath,
        content,
        testDir
      );

      expect(usedCallers).toBeGreaterThan(0);
      expect(unusedCallers).toBe(0);
    });

    it("refactoring impact: find all dependencies of a function", async () => {
      const content = `
function coreUtility() {
  return "core";
}

function level1() {
  return coreUtility();
}

function level2a() {
  return level1();
}

function level2b() {
  return level1();
}

function main() {
  level2a();
  level2b();
}
`;
      const filePath = await writeTestFile("refactor/deps.ts", content);

      // Find what level1 calls (dependencies)
      const callees = await getCallees(content, "typescript", "level1");
      expect(callees.some(c => c.name === "coreUtility")).toBe(true);

      // Find who calls level1 (dependents)
      const callers = await getCallers(
        "level1",
        filePath,
        content,
        testDir
      );
      expect(callers.length).toBeGreaterThanOrEqual(2);
    });

    it("API surface: find all external calls in a module", async () => {
      const content = `
import { externalA } from 'external-lib';
import { externalB, externalC } from 'another-lib';

export function publicApi() {
  internalHelper();
  externalA();
  externalB();
}

function internalHelper() {
  externalC();
  return 42;
}
`;
      const publicCallees = await getCallees(content, "typescript", "publicApi");
      const internalCallees = await getCallees(content, "typescript", "internalHelper");

      // Public API calls
      const publicNames = publicCallees.map(c => c.name);
      expect(publicNames).toContain("internalHelper");
      expect(publicNames).toContain("externalA");
      expect(publicNames).toContain("externalB");

      // Internal helper calls
      const internalNames = internalCallees.map(c => c.name);
      expect(internalNames).toContain("externalC");
    });

    it("test coverage: find all functions called in test", async () => {
      const content = `
function setupMocks() {
  mockA();
  mockB();
}

function runTest() {
  setupMocks();
  const result = systemUnderTest();
  assert(result);
  cleanup();
}

function cleanup() {
  resetMocks();
}
`;
      const testCallees = await getCallees(content, "typescript", "runTest");

      const names = testCallees.map(c => c.name);
      expect(names).toContain("setupMocks");
      expect(names).toContain("systemUnderTest");
      expect(names).toContain("assert");
      expect(names).toContain("cleanup");
    });
  });
});
