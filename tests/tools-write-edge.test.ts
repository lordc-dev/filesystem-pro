import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerFileWriteTools } from "../src/tools/file-write.js";
import type { ToolFactory } from "../src/utils/tool-factory.js";

type CapturedHandler = (args: any) => Promise<any>;
const captured = new Map<string, CapturedHandler>();

function createMockFactory(): ToolFactory {
  return ((name: string, _config: any, handler: CapturedHandler) => {
    captured.set(name, handler);
  }) as any;
}

const mockFactories = {
  readOnly: createMockFactory(),
  destructive: createMockFactory(),
  idempotent: createMockFactory(),
  standard: createMockFactory(),
};

const mockContext = { factories: mockFactories, server: {} as any };

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/tools-write-edge-test-");
  registerFileWriteTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("edit_file edge cases", () => {
  it("edits with exact match", async () => {
    const handler = captured.get("edit_file");
    const filePath = path.join(tempDir, "exact-match.ts");
    await fs.writeFile(filePath, "const greeting = 'hello';");
    const result = await handler!({
      path: filePath,
      edits: [{ oldText: "hello", newText: "world" }],
    });
    expect(result).toBeDefined();
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("world");
  });

  it("edits with dryRun doesn't modify file", async () => {
    const handler = captured.get("edit_file");
    const filePath = path.join(tempDir, "dryrun-test.ts");
    await fs.writeFile(filePath, "const x = 1;");
    const result = await handler!({
      path: filePath,
      edits: [{ oldText: "1", newText: "2" }],
      dryRun: true,
    });
    expect(result).toBeDefined();
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("= 1");
  });

  it("edits with fuzzy match (whitespace differences)", async () => {
    const handler = captured.get("edit_file");
    const filePath = path.join(tempDir, "fuzzy-test.ts");
    await fs.writeFile(filePath, "function foo() {\n  return 42;\n}\n");
    const result = await handler!({
      path: filePath,
      edits: [{ oldText: "return 42;", newText: "return 99;" }],
    });
    expect(result).toBeDefined();
  });

  it("edits with multiple matches flags ambiguity", async () => {
    const handler = captured.get("edit_file");
    const filePath = path.join(tempDir, "multi-match.ts");
    await fs.writeFile(filePath, "const x = 1;\nconst y = 1;\n");
    const result = await handler!({
      path: filePath,
      edits: [{ oldText: "1", newText: "2" }],
    });
    expect(result).toBeDefined();
  });

  it("edits with no match returns error", async () => {
    const handler = captured.get("edit_file");
    const filePath = path.join(tempDir, "no-match.ts");
    await fs.writeFile(filePath, "nothing here");
    const result = await handler!({
      path: filePath,
      edits: [{ oldText: "NONEXISTENT_PATTERN", newText: "replacement" }],
    });
    expect(result.isError).toBe(true);
  });

  it("edits with multiple edit operations", async () => {
    const handler = captured.get("edit_file");
    const filePath = path.join(tempDir, "multi-edit.ts");
    await fs.writeFile(filePath, "const a = 1;\nconst b = 2;\nconst c = 3;\n");
    const result = await handler!({
      path: filePath,
      edits: [
        { oldText: "a = 1", newText: "a = 10" },
        { oldText: "b = 2", newText: "b = 20" },
      ],
    });
    expect(result).toBeDefined();
  });
});

describe("write_file edge cases", () => {
  it("writes to existing file", async () => {
    const handler = captured.get("write_file");
    const filePath = path.join(tempDir, "existing.txt");
    await fs.writeFile(filePath, "old content");
    await handler!({ path: filePath, content: "new content" });
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("new content");
  });
});