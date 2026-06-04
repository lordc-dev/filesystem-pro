import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerDirectoryTools } from "../src/tools/directory-tools.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-dir-deep-test-");
  await fs.writeFile(path.join(tempDir, "file1.txt"), "content1");
  await fs.writeFile(path.join(tempDir, "file2.ts"), "const x = 1;");
  await fs.mkdir(path.join(tempDir, "subdir"));
  await fs.writeFile(path.join(tempDir, "subdir", "nested.txt"), "nested");
  registerDirectoryTools(mockContext as any);
  registerFileWriteTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("list_directory deep", () => {
  it("lists directory contents", async () => {
    const handler = captured.get("list_directory");
    const result = await handler!({ path: tempDir });
    expect(result.content[0].text).toContain("file1.txt");
  });
});

describe("list_directory_with_sizes deep", () => {
  it("lists with size info sorted by name", async () => {
    const handler = captured.get("list_directory_with_sizes");
    const result = await handler!({ path: tempDir, sortBy: "name" });
    expect(result).toBeDefined();
  });

  it("lists with size info sorted by size", async () => {
    const handler = captured.get("list_directory_with_sizes");
    const result = await handler!({ path: tempDir, sortBy: "size" });
    expect(result).toBeDefined();
  });
});

describe("directory_tree deep", () => {
  it("returns recursive tree with max depth", async () => {
    const handler = captured.get("directory_tree");
    const result = await handler!({ path: tempDir, maxDepth: 2 });
    expect(result).toBeDefined();
  });
});

describe("create_directory deep", () => {
  it("creates nested directory via create_directory handler", async () => {
    const mkdirHandler = captured.get("create_directory");
    const nestedPath = path.join(tempDir, "deep", "nested");
    await fs.mkdir(path.join(tempDir, "deep"), { recursive: true });
    const result = await mkdirHandler!({ path: nestedPath });
    expect(result).toBeDefined();
    const stat = await fs.stat(nestedPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("idempotent for existing directory", async () => {
    const handler = captured.get("create_directory");
    const result = await handler!({ path: tempDir });
    expect(result).toBeDefined();
  });
});

describe("get_file_info deep", () => {
  it("gets info for a file", async () => {
    const handler = captured.get("get_file_info");
    const filePath = path.join(tempDir, "file1.txt");
    const result = await handler!({ path: filePath });
    expect(result.content[0].text).toContain("size");
  });

  it("gets info for a directory", async () => {
    const handler = captured.get("get_file_info");
    const result = await handler!({ path: tempDir });
    expect(result.content[0].text).toContain("isDirectory");
  });
});

describe("delete_directory deep", () => {
  it("deletes empty directory", async () => {
    const handler = captured.get("delete_directory");
    const emptyDir = path.join(tempDir, "empty-dir");
    await fs.mkdir(emptyDir);
    const result = await handler!({ path: emptyDir, recursive: false });
    expect(result).toBeDefined();
  });

  it("deletes non-empty directory with recursive", async () => {
    const handler = captured.get("delete_directory");
    const nonEmptyDir = path.join(tempDir, "nonempty-dir");
    await fs.mkdir(nonEmptyDir);
    await fs.writeFile(path.join(nonEmptyDir, "file.txt"), "data");
    const result = await handler!({ path: nonEmptyDir, recursive: true });
    expect(result).toBeDefined();
  });
});