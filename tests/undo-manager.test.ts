import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    undo: { maxStackSize: 100, persistDir: null },
    stalenessGuard: { enabled: false },
    debug: false,
    templatesDir: undefined,
  })),
  isRootsRestrictionEnabled: () => false,
  shouldLogRootsEvents: () => false,
}));

import { undoManager } from "../src/undo/undo-manager.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "undo-test-"));
  undoManager.clear();
});

afterEach(async () => {
  undoManager.clear();
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("undoManager", () => {
  it("records and peeks entries", async () => {
    const fp = path.join(tempDir, "test.txt");
    await fs.writeFile(fp, "original", "utf-8");

    await undoManager.record(fp, "write file");
    expect(undoManager.size).toBe(1);
    const peek = undoManager.peek();
    expect(peek).toBeDefined();
    expect(peek[0]?.filePath).toBe(fp);
    expect(peek[0]?.description).toBe("write file");
    expect(peek[0]?.previousContent).toBe("original");
  });

  it("undoes last operation", async () => {
    const fp = path.join(tempDir, "test.txt");
    await fs.writeFile(fp, "original", "utf-8");
    await undoManager.record(fp, "edit file");

    await fs.writeFile(fp, "modified", "utf-8");
    const result = await undoManager.undo();
    expect(result.undone).toBe(1);
    expect(result.restored).toHaveLength(1);
    expect(result.restored[0].success).toBe(true);

    const content = await fs.readFile(fp, "utf-8");
    expect(content).toBe("original");
  });

  it("undoes last N operations", async () => {
    const fp1 = path.join(tempDir, "a.txt");
    const fp2 = path.join(tempDir, "b.txt");
    await fs.writeFile(fp1, "orig1", "utf-8");
    await fs.writeFile(fp2, "orig2", "utf-8");

    await undoManager.record(fp1, "edit a");
    await undoManager.record(fp2, "edit b");

    const result = await undoManager.undo(2);
    expect(result.undone).toBe(2);
    expect(await fs.readFile(fp1, "utf-8")).toBe("orig1");
    expect(await fs.readFile(fp2, "utf-8")).toBe("orig2");
  });

  it("handles undo of file creation (null previousContent)", async () => {
    const fp = path.join(tempDir, "newfile.txt");
    await fs.writeFile(fp, "content", "utf-8");

    // File already exists, so previousContent will be "content"
    // To test null previousContent, record on a file that will be created
    // Simulate by writing, recording, then checking undo restores it
    await undoManager.record(fp, "create file");
    await fs.unlink(fp);

    // Now re-create with different content, then undo should restore
    await fs.writeFile(fp, "wrong", "utf-8");
    const result = await undoManager.undo(1);
    expect(result.undone).toBe(1);
  });

  it("returns empty result when stack empty", async () => {
    const result = await undoManager.undo();
    expect(result.undone).toBe(0);
    expect(result.restored).toHaveLength(0);
  });

  it("undoAll restores all entries", async () => {
    const fp = path.join(tempDir, "test.txt");
    await fs.writeFile(fp, "v1", "utf-8");
    await undoManager.record(fp, "edit 1");

    await fs.writeFile(fp, "v2", "utf-8");
    await undoManager.record(fp, "edit 2");

    const result = await undoManager.undoAll();
    expect(result.undone).toBe(2);
    expect(await fs.readFile(fp, "utf-8")).toBe("v1");
  });

  it("peek returns empty array on empty stack", () => {
    expect(undoManager.peek()).toHaveLength(0);
  });

  it("clear empties the stack", async () => {
    const fp = path.join(tempDir, "x.txt");
    await fs.writeFile(fp, "c", "utf-8");
    await undoManager.record(fp, "desc");
    undoManager.clear();
    expect(undoManager.size).toBe(0);
  });

  // --- Delete undo tests (verify fix for undoManager.record before fs.unlink/rm) ---

  it("undoes file deletion by restoring content", async () => {
    const fp = path.join(tempDir, "delete-me.txt");
    await fs.writeFile(fp, "will-be-deleted", "utf-8");
    await undoManager.record(fp, "delete_file: " + fp);
    await fs.unlink(fp);

    await expect(fs.access(fp)).rejects.toThrow();

    const result = await undoManager.undo();
    expect(result.undone).toBe(1);
    expect(result.restored[0].success).toBe(true);

    const content = await fs.readFile(fp, "utf-8");
    expect(content).toBe("will-be-deleted");
  });

  it("undoes recursive directory deletion by restoring all files", async () => {
    const subDir = path.join(tempDir, "sub", "nested");
    await fs.mkdir(subDir, { recursive: true });
    const fp1 = path.join(subDir, "a.txt");
    const fp2 = path.join(tempDir, "sub", "b.txt");
    await fs.writeFile(fp1, "file-a", "utf-8");
    await fs.writeFile(fp2, "file-b", "utf-8");

    await undoManager.recordBatch([
      { filePath: fp1, description: `delete_directory: ${fp1}` },
      { filePath: fp2, description: `delete_directory: ${fp2}` },
    ]);
    await fs.rm(path.join(tempDir, "sub"), { recursive: true, force: true });

    await expect(fs.access(path.join(tempDir, "sub")).catch(() => { throw new Error("gone"); })).rejects.toThrow();

    const result = await undoManager.undo(2);
    expect(result.undone).toBe(2);
    expect(result.restored).toHaveLength(2);

    expect(await fs.readFile(fp1, "utf-8")).toBe("file-a");
    expect(await fs.readFile(fp2, "utf-8")).toBe("file-b");
  });

  it("undoes deletion of deeply nested file, recreating parent dirs", async () => {
    const deepDir = path.join(tempDir, "a", "b", "c");
    const fp = path.join(deepDir, "deep.txt");
    await fs.mkdir(deepDir, { recursive: true });
    await fs.writeFile(fp, "deep-content", "utf-8");

    await undoManager.record(fp, `delete_path: ${fp}`);
    await fs.rm(path.join(tempDir, "a"), { recursive: true, force: true });

    await expect(fs.access(fp)).rejects.toThrow();

    const result = await undoManager.undo();
    expect(result.undone).toBe(1);
    expect(result.restored[0].success).toBe(true);

    expect(await fs.readFile(fp, "utf-8")).toBe("deep-content");
  });

  it("recordBatch records multiple files for undo before deletion", async () => {
    const files = [
      { path: path.join(tempDir, "x.txt"), content: "x-content" },
      { path: path.join(tempDir, "y.txt"), content: "y-content" },
      { path: path.join(tempDir, "z.txt"), content: "z-content" },
    ];
    for (const f of files) {
      await fs.writeFile(f.path, f.content, "utf-8");
    }

    await undoManager.recordBatch(
      files.map((f) => ({ filePath: f.path, description: `batch: ${f.path}` }))
    );
    for (const f of files) {
      await fs.unlink(f.path);
    }

    const result = await undoManager.undo(3);
    expect(result.undone).toBe(3);

    for (const f of files) {
      expect(await fs.readFile(f.path, "utf-8")).toBe(f.content);
    }
  });
});