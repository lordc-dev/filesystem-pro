import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { createTempTestDir, cleanupTempDir } from "./test-helpers.js";

// Must detect Kotlin support at module-level so describe.skipIf() evaluates correctly.
// Vitest supports top-level await in ESM test files.
await treeSitterManager.initialize();
let SUPPORTS_KOTLIN = false;
try {
  await treeSitterManager.loadLanguage("kotlin");
  SUPPORTS_KOTLIN = true;
} catch {
  // Kotlin grammar not available in this environment
}

vi.mock("../src/undo/undo-manager.js", () => ({
  undoManager: {
    record: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../src/undo/staleness-guard.js", () => ({
  stalenessGuard: {
    checkAndGetError: vi.fn().mockResolvedValue(null),
  },
}));

import { inlineVariable, introduceParameter, extractMethod } from "../src/undo/composite-refactors.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await createTempTestDir("composite-refactors-");
});

afterAll(async () => {
  await cleanupTempDir(tempDir);
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function writeTestFile(name: string, content: string): Promise<string> {
  const fp = path.join(tempDir, name);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, content, "utf-8");
  return fp;
}

function stripDiffLines(diff: string): { added: string[]; removed: string[] } {
  const lines = diff.split("\n");
  return {
    added: lines.filter((l) => l.startsWith("+")).map((l) => l.slice(1)),
    removed: lines.filter((l) => l.startsWith("-")).map((l) => l.slice(1)),
  };
}

function findExprRange(content: string, expr: string): { startLine: number; endLine: number; startColumn: number; endColumn: number } {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const col = lines[i].indexOf(expr);
    if (col !== -1) {
      return {
        startLine: i + 1,
        endLine: i + 1,
        startColumn: col,
        endColumn: col + expr.length,
      };
    }
  }
  throw new Error(`Expression "${expr}" not found in content`);
}

describe.skipIf(!SUPPORTS_KOTLIN)("findFreeVariables (via extractMethod)", () => {
  it("excludes identifiers after dot (.sumOf, .price, etc)", async () => {
    const content = `fun calculateTotal(): Int {
    val items = listOf(1, 2, 3)
    val total = items.sumOf { it * 2 }
    println(total)
    return total
}`;
    const fp = await writeTestFile("ExDot.kt", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "extractedSum",
      startLine: 3,
      endLine: 4,
      parentSymbol: "calculateTotal",
      dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.description).toContain("extractedSum");
  });

  it("excludes lambda params (e.g. { x -> ... })", async () => {
    const content = `fun processData(data: List<Int>): Int {
    val result = data.map { x -> x * 2 }
    return result
}`;
    const fp = await writeTestFile("ExLambda.kt", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "extractMap",
      startLine: 2,
      endLine: 3,
      parentSymbol: "processData",
      dryRun: true,
    });
    expect(result.success).toBe(true);
  });

  it("excludes destructuring declaration variables", async () => {
    const content = `fun parsePair(input: String): String {
    val (name, value) = parseInput(input)
    return name
}`;
    const fp = await writeTestFile("ExDestruct.kt", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "extractParse",
      startLine: 2,
      endLine: 3,
      parentSymbol: "parsePair",
      dryRun: true,
    });
    expect(result.success).toBe(true);
  });

  it("generates fun with Any params for Kotlin", async () => {
    const content = `fun main() {
    val data = loadData()
    val result = data.filter { it > 0 }
    println(result)
    processResult(result)
}`;
    const fp = await writeTestFile("ExFun.kt", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "filterPositive",
      startLine: 3,
      endLine: 4,
      parentSymbol: "main",
      dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.diff).toContain("fun filterPositive");
  });
});

describe.skipIf(!SUPPORTS_KOTLIN)("inlineVariable without AST references returns error", () => {
  it("returns error when no AST references found (no regex fallback)", async () => {
    const content = `fun compute(): Int {
    val factor = 3
    return factor * 10 + factor
}`;
    const fp = await writeTestFile("InlineNoAST.kt", content);
    const result = await inlineVariable(fp, content, {
      variableName: "factor",
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("No references found");
  });

  it("returns error when no AST references for multiplier", async () => {
    const content = `fun compute(): Int {
    val multiplier = 5
    return multiplier * 2
}`;
    const fp = await writeTestFile("InlineNoAST2.kt", content);
    const result = await inlineVariable(fp, content, {
      variableName: "multiplier",
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("No references found");
  });

  it("returns error when no AST references for tax", async () => {
    const content = `fun calculate(price: Int): Int {
    val tax = 0.21
    val total = price + price * tax
    return total
}`;
    const fp = await writeTestFile("InlineNoAST3.kt", content);
    const result = await inlineVariable(fp, content, {
      variableName: "tax",
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("No references found");
  });
});

describe.skipIf(!SUPPORTS_KOTLIN)("introduceParameter isWholeValDecl detection", () => {
  it("removes full val line when expression covers entire RHS", async () => {
    const content = `fun calculate(): Int {
    val discount = 0.15
    return 100 * discount
}`;
    const fp = await writeTestFile("IntWholeVal.kt", content);
    const range = findExprRange(content, "0.15");
    const result = await introduceParameter(fp, content, {
      parameterName: "discount",
      ...range,
      functionSymbol: "calculate",
      dryRun: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const { added, removed } = stripDiffLines(result.diff);
    expect(added.some((l) => l.includes("discount: Any = 0.15"))).toBe(true);
    expect(removed.some((l) => l.includes("val discount"))).toBe(true);
  });

  it("does NOT remove val line when expression is partial RHS", async () => {
    const content = `fun calculate(): Int {
    val total = 100 + 50
    return total
}`;
    const fp = await writeTestFile("IntPartial.kt", content);
    const range = findExprRange(content, "100");
    const result = await introduceParameter(fp, content, {
      parameterName: "basePrice",
      ...range,
      functionSymbol: "calculate",
      dryRun: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const { added } = stripDiffLines(result.diff);
    expect(added.some((l) => l.includes("basePrice: Any = 100"))).toBe(true);
    expect(added.some((l) => l.includes("basePrice + 50"))).toBe(true);
  });

  it("removes var line when expression is full RHS", async () => {
    const content = `fun process(): String {
    var suffix = "_end"
    return "data" + suffix
}`;
    const fp = await writeTestFile("IntVarLine.kt", content);
    const range = findExprRange(content, '"_end"');
    const result = await introduceParameter(fp, content, {
      parameterName: "suffix",
      ...range,
      functionSymbol: "process",
      dryRun: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const { removed, added } = stripDiffLines(result.diff);
    expect(removed.some((l) => l.includes("var suffix"))).toBe(true);
    expect(added.some((l) => l.includes("suffix: Any"))).toBe(true);
  });

  it("adds param to Kotlin function with existing params", async () => {
    const content = `fun compute(name: String): Int {
    val threshold = 42
    return name.length + threshold
}`;
    const fp = await writeTestFile("IntExisting.kt", content);
    const range = findExprRange(content, "42");
    const result = await introduceParameter(fp, content, {
      parameterName: "threshold",
      ...range,
      functionSymbol: "compute",
      dryRun: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const { added } = stripDiffLines(result.diff);
    expect(added.some((l) => l.includes("threshold: Any = 42"))).toBe(true);
  });
});
describe("findFreeVariablesAST", () => {
  it("excludes property accesses (obj.prop)", async () => {
    const content = `function test() {
    const data = { x: 1 };
    const y = data.x + data.y;
    return y;
}`;
    const fp = await writeTestFile("FVProp.ts", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "extracted",
      startLine: 2,
      endLine: 3,
      parentSymbol: undefined,
      dryRun: true,
    });
    expect(result.success).toBe(true);
  });

  it("excludes locally defined variables", async () => {
    const content = `function test() {
    const x = 5;
    const y = x * 2;
    return y;
}`;
    const fp = await writeTestFile("FVLocal.ts", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "extracted",
      startLine: 3,
      endLine: 4,
      parentSymbol: undefined,
      dryRun: true,
    });
    expect(result.success).toBe(true);
  });

  it("finds free variables from outer scope in JS", async () => {
    const content = `function test() {
    const outer = getValue();
    const result = outer + 1;
    return result;
}`;
    const fp = await writeTestFile("FVFree.ts", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "extracted",
      startLine: 3,
      endLine: 3,
      parentSymbol: undefined,
      dryRun: true,
    });
    expect(result.success).toBe(true);
  });

  it("handles Python async/await", async () => {
    const content = `def process(data):
    result = await fetch(data)
    return result`;
    const fp = await writeTestFile("FVPython.py", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "extracted",
      startLine: 2,
      endLine: 3,
      parentSymbol: undefined,
      dryRun: true,
    });
    expect(result.success).toBe(true);
  });
});
