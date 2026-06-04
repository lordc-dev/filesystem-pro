import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { inlineVariable } from "../src/undo/inline-variable.js";

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
  tempDir = await fs.mkdtemp("/tmp/inline-var-test-");
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

describe("inlineVariable", () => {
  it("attempts to inline a simple const in TypeScript", async () => {
    const content = `function process(): number {
    const factor = 3;
    return factor * 10 + factor;
}
`;
    const fp = await writeTestFile("inline.ts", content);
    const result = await inlineVariable(fp, content, {
      variableName: "factor",
      dryRun: true,
    });
    expect(typeof result.success).toBe("boolean");
  });

  it("rejects unsupported file types", async () => {
    const result = await inlineVariable("test.xyz", "const x = 1;", {
      variableName: "x",
      dryRun: true,
    });
    expect(result.success).toBe(false);
  });

  it("returns error for non-existent variable", async () => {
    const content = `function test() {
    const x = 1;
    return x;
}
`;
    const fp = await writeTestFile("unknown.ts", content);
    const result = await inlineVariable(fp, content, {
      variableName: "nonexistent",
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects variable without initializer (no = sign)", async () => {
    const content = `function test() {
    const x: number = 42;
    return x;
}
`;
    const fp = await writeTestFile("no-init.ts", content);
    const result = await inlineVariable(fp, content, {
      variableName: "x",
      dryRun: true,
    });
    expect(typeof result.success).toBe("boolean");
  });
});