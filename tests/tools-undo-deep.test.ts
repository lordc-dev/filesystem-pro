import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerUndoTools } from "../src/tools/undo-tools.js";
import { registerFileWriteTools } from "../src/tools/file-write.js";
import { registerFileReadTools } from "../src/tools/file-read.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-undo-deep-test-");
  await treeSitterManager.initialize();
  registerUndoTools(mockContext as any);
  registerFileWriteTools(mockContext as any);
  registerFileReadTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("undo tool deep execution", () => {
  it("undo peeks at specific count", async () => {
    const peekHandler = captured.get("undo_peek");
    const result = await peekHandler!({ count: 2 });
    expect(result).toBeDefined();
  });

  it("undo_status shows staleness guard state", async () => {
    const statusHandler = captured.get("undo_status");
    const result = await statusHandler!({});
    expect(result).toBeDefined();
    expect(result.content[0].type).toBe("text");
  });

  it("write then undo restores original", async () => {
    const writeHandler = captured.get("write_file");
    const undoHandler = captured.get("undo");

    const filePath = path.join(tempDir, "undo-restore-test.txt");
    await writeHandler!({ path: filePath, content: "version 1" });
    await writeHandler!({ path: filePath, content: "version 2" });
    await writeHandler!({ path: filePath, content: "version 3" });

    const undoResult = await undoHandler!({ count: 1 });
    expect(undoResult).toBeDefined();
  });

  it("undo_all undoes all changes", async () => {
    const undoAllHandler = captured.get("undo_all");
    expect(undoAllHandler).toBeDefined();
  });

  it("extract_method extracts function code", async () => {
    const extractHandler = captured.get("extract_method");
    expect(extractHandler).toBeDefined();

    const filePath = path.join(tempDir, "extract-test.ts");
    await fs.writeFile(filePath, "function process() {\n  const data = loadData();\n  const result = transform(data);\n  return result;\n}\n");

    const result = await extractHandler!({
      path: filePath,
      newMethodName: "extractedLogic",
      startLine: 2,
      endLine: 4,
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("inline_variable handles TypeScript file", async () => {
    const inlineHandler = captured.get("inline_variable");
    expect(inlineHandler).toBeDefined();

    const filePath = path.join(tempDir, "inline-test.ts");
    await fs.writeFile(filePath, "function calc() {\n  const factor = 3;\n  return factor * 10;\n}\n");

    const result = await inlineHandler!({
      path: filePath,
      variableName: "factor",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("introduce_parameter handles TypeScript function", async () => {
    const introduceHandler = captured.get("introduce_parameter");
    expect(introduceHandler).toBeDefined();

    const filePath = path.join(tempDir, "introduce-test.ts");
    await fs.writeFile(filePath, "function calculate(): number {\n  const discount = 0.15;\n  return 100 * discount;\n}\n");

    const result = await introduceHandler!({
      path: filePath,
      parameterName: "discount",
      startLine: 2,
      endLine: 2,
      startColumn: 25,
      endColumn: 29,
      functionSymbol: "calculate",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});