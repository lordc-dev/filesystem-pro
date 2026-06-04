import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { registerUndoTools } from "../src/tools/undo-tools.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-undo-extra-test-");
  await treeSitterManager.initialize();
  registerUndoTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("undo_peek deep", () => {
  it("peeks with default count", async () => {
    const handler = captured.get("undo_peek");
    const result = await handler!({});
    expect(result).toBeDefined();
  });

  it("peeks with specific count", async () => {
    const handler = captured.get("undo_peek");
    const result = await handler!({ count: 5 });
    expect(result).toBeDefined();
  });
});

describe("undo_status deep", () => {
  it("returns undo stack status", async () => {
    const handler = captured.get("undo_status");
    const result = await handler!({});
    expect(result.content[0].type).toBe("text");
  });
});

describe("undo deep", () => {
  it("undo with count=1", async () => {
    const handler = captured.get("undo");
    const result = await handler!({ count: 1 });
    expect(result).toBeDefined();
  });
});

describe("undo_all deep", () => {
  it("is registered", () => {
    expect(captured.has("undo_all")).toBe(true);
  });
});

describe("extract_method deep", () => {
  it("extracts with parentSymbol", async () => {
    const handler = captured.get("extract_method");
    const filePath = path.join(tempDir, "extract-parent.ts");
    await fs.writeFile(filePath, "export class Calculator {\n  add(a: number, b: number): number {\n    const result = a + b;\n    return result;\n  }\n}\n");

    const result = await handler!({
      path: filePath,
      newMethodName: "computeSum",
      startLine: 3,
      endLine: 4,
      parentSymbol: "Calculator",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});

describe("inline_variable deep", () => {
  it("inlines with parentSymbol", async () => {
    const handler = captured.get("inline_variable");
    const filePath = path.join(tempDir, "inline-parent.ts");
    await fs.writeFile(filePath, "export function multiply(x: number, y: number): number {\n  const product = x * y;\n  return product;\n}\n");

    const result = await handler!({
      path: filePath,
      variableName: "product",
      parentSymbol: "multiply",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});

describe("introduce_parameter deep", () => {
  it("introduces parameter to function", async () => {
    const handler = captured.get("introduce_parameter");
    const filePath = path.join(tempDir, "introduce-param.ts");
    await fs.writeFile(filePath, "export function calculate(): number {\n  const tax = 0.21;\n  return 100 * (1 + tax);\n}\n");

    const result = await handler!({
      path: filePath,
      parameterName: "taxRate",
      startLine: 2,
      endLine: 2,
      startColumn: 16,
      endColumn: 19,
      functionSymbol: "calculate",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});