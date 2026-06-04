import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { extractMethod, checkMultilineStringBoundary } from "../src/undo/extract-method.js";

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
  tempDir = await fs.mkdtemp("/tmp/extract-method-test-");
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

describe("checkMultilineStringBoundary", () => {
  it("returns null when no multi-line strings", () => {
    const lines = ["const x = 1;", "const y = 2;"];
    expect(checkMultilineStringBoundary(lines, 0, 2, "typescript")).toBeNull();
  });

  it("returns null when selection fully contains multi-line string", () => {
    const lines = [
      "const x = `",
      "hello",
      "world",
      "`;",
    ];
    expect(checkMultilineStringBoundary(lines, 0, 4, "typescript")).toBeNull();
  });

  it("returns error when selection cuts multi-line string", () => {
    const lines = [
      "const x = `",
      "hello",
      "world",
      "`;",
    ];
    const result = checkMultilineStringBoundary(lines, 1, 3, "typescript");
    expect(result).not.toBeNull();
    expect(result).toContain("partially overlaps");
  });

  it("handles Python triple quotes within full selection", () => {
    const lines = [
      'x = """',
      "hello",
      '"""',
    ];
    const result = checkMultilineStringBoundary(lines, 0, 3, "python");
    expect(result).toBeNull();
  });

  it("detects partial Python triple quote overlap", () => {
    const lines = [
      'x = """',
      "hello",
      '"""',
    ];
    const result = checkMultilineStringBoundary(lines, 0, 2, "python");
    expect(result).not.toBeNull();
  });

  it("returns null for unsupported language", () => {
    const lines = ["x = 1", "y = 2"];
    expect(checkMultilineStringBoundary(lines, 0, 2, "go" as any)).toBeNull();
  });
});

describe("extractMethod", () => {
  it("extracts simple function body in TypeScript", async () => {
    const content = `function process() {
    const data = loadData();
    const result = transform(data);
    return result;
}
`;
    const fp = await writeTestFile("extract.ts", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "extractedLogic",
      startLine: 2,
      endLine: 4,
      dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.diff).toContain("extractedLogic");
  });

  it("extracts Python function body", async () => {
    const content = `def process():
    data = load_data()
    result = transform(data)
    return result
`;
    const fp = await writeTestFile("extract.py", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "extracted_logic",
      startLine: 2,
      endLine: 4,
      dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.diff).toContain("extracted_logic");
  });

  it("rejects unsupported file types", async () => {
    const result = await extractMethod("test.xyz", "content", {
      newMethodName: "test",
      startLine: 1,
      endLine: 2,
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.errors[0].toLowerCase()).toContain("unsupported");
  });

  it("rejects invalid line ranges", async () => {
    const content = "line1\nline2\nline3\n";
    const fp = await writeTestFile("bad-range.ts", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "test",
      startLine: 5,
      endLine: 10,
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Invalid line range");
  });

  it("extracts JavaScript arrow function body", async () => {
    const content = `function main() {
    const x = compute();
    const y = format(x);
    return y;
}
`;
    const fp = await writeTestFile("extract-js.js", content);
    const result = await extractMethod(fp, content, {
      newMethodName: "helper",
      startLine: 2,
      endLine: 3,
      dryRun: true,
    });
    expect(result.success).toBe(true);
  });
});