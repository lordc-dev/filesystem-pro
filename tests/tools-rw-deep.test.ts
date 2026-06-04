import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerFileWriteTools } from "../src/tools/file-write.js";
import { registerFileReadTools } from "../src/tools/file-read.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-rw-deep-test-");
  registerFileWriteTools(mockContext as any);
  registerFileReadTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("write_file deep", () => {
  it("creates file in existing directory", async () => {
    const handler = captured.get("write_file");
    const filePath = path.join(tempDir, "simple-file.txt");
    const result = await handler!({ path: filePath, content: "nested content" });
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("nested content");
  });

  it("overwrites existing file", async () => {
    const handler = captured.get("write_file");
    const filePath = path.join(tempDir, "overwrite.txt");
    await handler!({ path: filePath, content: "first" });
    await handler!({ path: filePath, content: "second" });
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("second");
  });

  it("creates empty file", async () => {
    const handler = captured.get("write_file");
    const filePath = path.join(tempDir, "empty.txt");
    await handler!({ path: filePath, content: "" });
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("");
  });
});

describe("read_text_file deep", () => {
  it("reads large file", async () => {
    const handler = captured.get("read_text_file");
    const filePath = path.join(tempDir, "large.txt");
    const largeContent = "x".repeat(1000);
    await fs.writeFile(filePath, largeContent);
    const result = await handler!({ path: filePath });
    expect(result.content[0].text.length).toBeGreaterThanOrEqual(1000);
  });

  it("reads file with unicode", async () => {
    const handler = captured.get("read_text_file");
    const filePath = path.join(tempDir, "unicode.txt");
    await fs.writeFile(filePath, "hello 世界 🌍");
    const result = await handler!({ path: filePath });
    expect(result.content[0].text).toContain("世界");
  });
});

describe("read_media_file", () => {
  it("is registered", () => {
    expect(captured.has("read_media_file")).toBe(true);
  });
});

describe("read_multiple_files deep", () => {
  it("reads multiple files with different types", async () => {
    const handler = captured.get("read_multiple_files");
    const f1 = path.join(tempDir, "multi-d1.ts");
    const f2 = path.join(tempDir, "multi-d2.js");
    const f3 = path.join(tempDir, "multi-d3.py");
    await fs.writeFile(f1, "// ts");
    await fs.writeFile(f2, "// js");
    await fs.writeFile(f3, "# py");
    const result = await handler!({ paths: [f1, f2, f3] });
    expect(result).toBeDefined();
  });
});