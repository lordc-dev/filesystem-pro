import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerListDirectoryTools } from "../src/tools/directory-list.js";
import { registerCreateDirectoryTool } from "../src/tools/directory-create.js";
import { registerMoveFileTool } from "../src/tools/directory-move.js";
import { registerWatchTools } from "../src/tools/directory-watch.js";
import { registerDeleteTools } from "../src/tools/directory-delete.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-dir-test-");
  registerListDirectoryTools(mockContext as any);
  registerCreateDirectoryTool(mockContext as any);
  registerMoveFileTool(mockContext as any);
  registerWatchTools(mockContext as any);
  registerDeleteTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("delete_file tool", () => {
  it("deletes a symlink WITHOUT deleting its target", async () => {
    const handler = captured.get("delete_file");
    expect(handler).toBeDefined();
    const target = path.join(tempDir, "link-target.txt");
    const link = path.join(tempDir, "link-to-target");
    await fs.writeFile(target, "data");
    await fs.symlink(target, link);

    const result = await handler!({ path: link });

    // Link gone, target intact
    await expect(fs.lstat(link)).rejects.toMatchObject({ code: "ENOENT" });
    const content = await fs.readFile(target, "utf-8");
    expect(content).toBe("data");
    expect(result.structuredContent.success).toBe(true);
  });

  it("delete_path on a symlink to a DIRECTORY removes the link, not the target dir", async () => {
    const handler = captured.get("delete_path");
    expect(handler).toBeDefined();
    const targetDir = path.join(tempDir, "link-target-dir");
    const link = path.join(tempDir, "link-to-dir");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "inside.txt"), "data");
    await fs.symlink(targetDir, link);

    await handler!({ path: link });

    // Link gone, target dir and its content intact
    await expect(fs.lstat(link)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(targetDir, "inside.txt"), "utf-8")).toBe("data");
  });

  it("undo of recursive delete restores an EMPTY root directory", async () => {
    const handler = captured.get("delete_directory");
    const emptyDir = path.join(tempDir, "empty-root-dir");
    await fs.mkdir(emptyDir, { recursive: true });

    await handler!({ path: emptyDir, recursive: true });
    await expect(fs.access(emptyDir)).rejects.toMatchObject({ code: "ENOENT" });

    const { undoManager } = await import("../src/undo/undo-manager.js");
    const result = await undoManager.undoAll();
    expect(result.undone).toBeGreaterThan(0);
    expect((await fs.stat(emptyDir)).isDirectory()).toBe(true);
  });
});

describe("list_directory tool", () => {
  it("lists directory contents", async () => {
    const handler = captured.get("list_directory");
    expect(handler).toBeDefined();
    const result = await handler!({ path: tempDir });
    expect(result.content[0].type).toBe("text");
  });
});

describe("directory_tree tool", () => {
  it("gets directory tree", async () => {
    const handler = captured.get("directory_tree");
    expect(handler).toBeDefined();
    const result = await handler!({ path: tempDir });
    expect(result.content[0].type).toBe("text");
  });
});

describe("create_directory tool", () => {
  it("creates a directory", async () => {
    const handler = captured.get("create_directory");
    expect(handler).toBeDefined();
    const newDir = path.join(tempDir, "new-dir");
    await handler!({ path: newDir });
    const exists = await fs.access(newDir).then(() => true, () => false);
    expect(exists).toBe(true);
  });
});

describe("move_file tool", () => {
  it("moves a file", async () => {
    const handler = captured.get("move_file");
    expect(handler).toBeDefined();
    const srcPath = path.join(tempDir, "move-src.txt");
    const dstPath = path.join(tempDir, "move-dst.txt");
    await fs.writeFile(srcPath, "test");
    await handler!({ source: srcPath, destination: dstPath });
    const exists = await fs.access(dstPath).then(() => true, () => false);
    expect(exists).toBe(true);
  });
});

describe("delete_file tool", () => {
  it("deletes a file", async () => {
    const handler = captured.get("delete_file");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "to-delete.txt");
    await fs.writeFile(filePath, "delete me");
    await handler!({ path: filePath });
    const exists = await fs.access(filePath).then(() => true, () => false);
    expect(exists).toBe(false);
  });
});

describe("delete_directory tool", () => {
  it("deletes an empty directory", async () => {
    const handler = captured.get("delete_directory");
    expect(handler).toBeDefined();
    const dirPath = path.join(tempDir, "to-delete-dir");
    await fs.mkdir(dirPath);
    await handler!({ path: dirPath, recursive: false });
    const exists = await fs.access(dirPath).then(() => true, () => false);
    expect(exists).toBe(false);
  });
});

describe("delete_path tool", () => {
  it("deletes a file via delete_path", async () => {
    const handler = captured.get("delete_path");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "delete-path.txt");
    await fs.writeFile(filePath, "delete me");
    await handler!({ path: filePath });
    const exists = await fs.access(filePath).then(() => true, () => false);
    expect(exists).toBe(false);
  });
});