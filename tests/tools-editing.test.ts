import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerEditingTools } from "../src/tools/editing-tools.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-edit-test-");
  await treeSitterManager.initialize();
  registerEditingTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("editing tool handlers", () => {
  it("replace_symbol_body with dryRun", async () => {
    const handler = captured.get("replace_symbol_body");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "replace-test.ts");
    await fs.writeFile(filePath, "function greet(): string {\n  return 'hello';\n}\n");
    const result = await handler!({
      path: filePath,
      namePath: "greet",
      newBody: "return 'world';",
      dryRun: true,
    });
    expect(result).toBeDefined();
    if (!result.isError) {
      expect(result.structuredContent.diff).toBeDefined();
    }
  });

  it("replace_symbol_body without dryRun", async () => {
    const handler = captured.get("replace_symbol_body");
    const filePath = path.join(tempDir, "replace-real-test.ts");
    await fs.writeFile(filePath, "function greet(): string {\n  return 'hello';\n}\n");
    const result = await handler!({
      path: filePath,
      namePath: "greet",
      newBody: "return 'world';",
      dryRun: false,
    });
    expect(result).toBeDefined();
  });

  it("insert_before_symbol with dryRun", async () => {
    const handler = captured.get("insert_before_symbol");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "insert-before-test.ts");
    await fs.writeFile(filePath, "function greet(): string {\n  return 'hello';\n}\n");
    const result = await handler!({
      path: filePath,
      namePath: "greet",
      code: "// comment above\n",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("insert_after_symbol with dryRun", async () => {
    const handler = captured.get("insert_after_symbol");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "insert-after-test.ts");
    await fs.writeFile(filePath, "function greet(): string {\n  return 'hello';\n}\n");
    const result = await handler!({
      path: filePath,
      namePath: "greet",
      code: "function farewell(): string { return 'bye'; }\n",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("rename_symbol with dryRun", async () => {
    const handler = captured.get("rename_symbol");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "rename-test.ts");
    await fs.writeFile(filePath, "function greet(): string {\n  return 'hello';\n}\nconsole.log(greet());\n");
    const result = await handler!({
      path: filePath,
      namePath: "greet",
      newName: "sayHello",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("replace_symbol_body handles errors gracefully", async () => {
    const handler = captured.get("replace_symbol_body");
    const filePath = path.join(tempDir, "error-test.ts");
    await fs.writeFile(filePath, "const x = 1;\n");
    const result = await handler!({
      path: filePath,
      namePath: "nonexistent",
      newBody: "return 1;",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});