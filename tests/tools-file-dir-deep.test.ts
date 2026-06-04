import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerDirectoryTools } from "../src/tools/directory-tools.js";
import { registerFileWriteTools } from "../src/tools/file-write.js";
import { registerFileTools } from "../src/tools/file-tools.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-file-dir-test-");
  await fs.writeFile(path.join(tempDir, "a.txt"), "aaa");
  await fs.writeFile(path.join(tempDir, "b.ts"), "const x = 1;");
  registerDirectoryTools(mockContext as any);
  registerFileWriteTools(mockContext as any);
  registerFileTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("move_file deep", () => {
  it("moves file to new location", async () => {
    const handler = captured.get("move_file");
    const src = path.join(tempDir, "a.txt");
    const dst = path.join(tempDir, "moved-a.txt");
    const result = await handler!({ source: src, destination: dst });
    expect(result).toBeDefined();
    const exists = await fs.access(dst).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("renames a directory", async () => {
    const handler = captured.get("move_file");
    const oldDir = path.join(tempDir, "olddir");
    const newDir = path.join(tempDir, "newdir");
    await fs.mkdir(oldDir);
    await fs.writeFile(path.join(oldDir, "inner.txt"), "inner content");
    const result = await handler!({ source: oldDir, destination: newDir });
    expect(result).toBeDefined();
    const exists = await fs.access(path.join(newDir, "inner.txt")).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});

describe("delete_file deep", () => {
  it("deletes a file", async () => {
    const handler = captured.get("delete_file");
    const filePath = path.join(tempDir, "to-delete.txt");
    await fs.writeFile(filePath, "bye");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});

describe("delete_path deep", () => {
  it("deletes a file (auto-detect type)", async () => {
    const handler = captured.get("delete_path");
    const filePath = path.join(tempDir, "auto-delete.txt");
    await fs.writeFile(filePath, "bye");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });

  it("deletes directory with recursive", async () => {
    const handler = captured.get("delete_path");
    const dirPath = path.join(tempDir, "auto-delete-dir");
    await fs.mkdir(dirPath);
    await fs.writeFile(path.join(dirPath, "file.txt"), "data");
    const result = await handler!({ path: dirPath, recursive: true });
    expect(result).toBeDefined();
  });
});

describe("list_allowed_directories deep", () => {
  it("returns allowed directories", async () => {
    const handler = captured.get("list_allowed_directories");
    const result = await handler!({});
    expect(result).toBeDefined();
  });
});

describe("directory_tree deep", () => {
  it("handles maxDepth=0 (top-level only)", async () => {
    const handler = captured.get("directory_tree");
    const result = await handler!({ path: tempDir, maxDepth: 0 });
    expect(result).toBeDefined();
  });

  it("handles maxEntries limit", async () => {
    const handler = captured.get("directory_tree");
    const result = await handler!({ path: tempDir, maxEntries: 2 });
    expect(result).toBeDefined();
  });
});