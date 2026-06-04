import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { introduceParameter } from "../src/undo/introduce-parameter.js";

vi.mock("../src/undo/undo-manager.js", () => ({
  undoManager: { record: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../src/undo/staleness-guard.js", () => ({
  stalenessGuard: { checkAndGetError: vi.fn().mockResolvedValue(null) },
}));

import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";

let tempDir: string;

beforeAll(async () => {
  await treeSitterManager.initialize();
  tempDir = await fs.mkdtemp("/tmp/introduce-param-test-");
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function writeTestFile(name: string, content: string): Promise<string> {
  const fp = path.join(tempDir, name);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, content, "utf-8");
  return fp;
}

describe("introduceParameter", () => {
  it("introduces a parameter in a TypeScript function", async () => {
    const content = `function calculate(): number {
    const discount = 0.15;
    return 100 * discount;
}
`;
    const fp = await writeTestFile("introduce.ts", content);
    const result = await introduceParameter(fp, content, {
      parameterName: "discount",
      startLine: 2,
      endLine: 2,
      startColumn: content.indexOf("0.15"),
      endColumn: content.indexOf("0.15") + 4,
      functionSymbol: "calculate",
      dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.diff).toContain("discount");
  });

  it("rejects unsupported file types", async () => {
    const result = await introduceParameter("test.xyz", "content", {
      parameterName: "x",
      startLine: 1,
      endLine: 1,
      startColumn: 0,
      endColumn: 1,
      dryRun: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown function symbol", async () => {
    const content = `function test(): void {
    const x = 42;
}
`;
    const fp = await writeTestFile("no-fn.ts", content);
    const result = await introduceParameter(fp, content, {
      parameterName: "x",
      startLine: 2,
      endLine: 2,
      startColumn: 12,
      endColumn: 14,
      functionSymbol: "nonexistent",
      dryRun: true,
    });
    expect(result.success).toBe(false);
  });

  it("introduces parameter in Python function", async () => {
    const content = `def calculate():
    discount = 0.15
    return 100 * discount
`;
    const fp = await writeTestFile("introduce.py", content);
    const result = await introduceParameter(fp, content, {
      parameterName: "discount",
      startLine: 2,
      endLine: 2,
      startColumn: content.indexOf("0.15"),
      endColumn: content.indexOf("0.15") + 4,
      functionSymbol: "calculate",
      dryRun: true,
    });
    expect(result.success).toBe(true);
  });
});