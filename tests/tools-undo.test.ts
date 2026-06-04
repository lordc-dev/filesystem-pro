import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerUndoTools } from "../src/tools/undo-tools.js";
import { registerFileWriteTools } from "../src/tools/file-write.js";
import type { ToolFactory } from "../src/utils/tool-factory.js";

type CapturedHandler = (args: any) => Promise<any>;
const capturedMap = new Map<string, CapturedHandler>();

function createMockFactory(): ToolFactory {
  return ((name: string, _config: any, handler: CapturedHandler) => {
    capturedMap.set(name, handler);
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
  tempDir = await fs.mkdtemp("/tmp/tools-undo-test-");
  registerUndoTools(mockContext as any);
  registerFileWriteTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("undo tool execution", () => {
  it("undo_peek shows empty stack", async () => {
    const handler = capturedMap.get("undo_peek");
    expect(handler).toBeDefined();
    const result = await handler!({ count: 5 });
    expect(result.content[0].type).toBe("text");
  });

  it("undo_status shows status", async () => {
    const handler = capturedMap.get("undo_status");
    expect(handler).toBeDefined();
    const result = await handler!({});
    expect(result.content[0].type).toBe("text");
  });

  it("undo peeks at empty stack", async () => {
    const peekHandler = capturedMap.get("undo_peek");
    const result = await peekHandler!({ count: 1 });
    expect(result).toBeDefined();
  });
});

describe("write and undo interaction", () => {
  it("write a file, then undo", async () => {
    const writeHandler = capturedMap.get("write_file");
    const undoHandler = capturedMap.get("undo");
    expect(writeHandler).toBeDefined();
    expect(undoHandler).toBeDefined();

    const filePath = path.join(tempDir, "undo-test.txt");
    await writeHandler!({ path: filePath, content: "original content" });

    const beforeUndo = await fs.readFile(filePath, "utf-8");
    expect(beforeUndo).toBe("original content");

    await writeHandler!({ path: filePath, content: "modified content" });
    const afterWrite = await fs.readFile(filePath, "utf-8");
    expect(afterWrite).toBe("modified content");

    const undoResult = await undoHandler!({ count: 1 });
    expect(undoResult).toBeDefined();
  });
});

describe("extract_method tool", () => {
  it("is registered", () => {
    expect(capturedMap.has("extract_method")).toBe(true);
  });
});

describe("inline_variable tool", () => {
  it("is registered", () => {
    expect(capturedMap.has("inline_variable")).toBe(true);
  });
});

describe("introduce_parameter tool", () => {
  it("is registered", () => {
    expect(capturedMap.has("introduce_parameter")).toBe(true);
  });
});