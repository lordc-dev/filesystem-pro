import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { getUndoManager, setUndoManager, resetUndoManager } from "../src/undo/undo-manager.js";

let tempDir: string;
let manager: ReturnType<typeof getUndoManager>;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/undo-manager-deep-test-");
  manager = new (getUndoManager().constructor as any)(10);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  resetUndoManager();
});

describe("UndoManager deep", () => {
  it("starts with size 0", () => {
    expect(manager.size).toBe(0);
  });

  it("records a file change", async () => {
    const filePath = path.join(tempDir, "record-test.txt");
    await fs.writeFile(filePath, "original content");
    await manager.record(filePath, "initial write");
    expect(manager.size).toBe(1);
  });

  it("records a new file (no previous content)", async () => {
    const filePath = path.join(tempDir, "new-file.txt");
    await fs.writeFile(filePath, "new content");
    await manager.record(filePath, "created new file");
    expect(manager.size).toBe(2);
  });

  it("records batch of file changes", async () => {
    const f1 = path.join(tempDir, "batch1.txt");
    const f2 = path.join(tempDir, "batch2.txt");
    await fs.writeFile(f1, "batch-content-1");
    await fs.writeFile(f2, "batch-content-2");
    await manager.recordBatch([
      { filePath: f1, description: "batch change 1" },
      { filePath: f2, description: "batch change 2" },
    ]);
    expect(manager.size).toBe(4);
  });

  it("peeks entries", () => {
    const entries = manager.peek(2);
    expect(entries.length).toBeLessThanOrEqual(2);
  });

  it("peeks all entries", () => {
    const entries = manager.peek(100);
    expect(entries.length).toBe(manager.size);
  });

  it("undoes last operation", async () => {
    const filePath = path.join(tempDir, "undo-test.txt");
    await fs.writeFile(filePath, "version A");
    const m = new (getUndoManager().constructor as any)(10);
    await m.record(filePath, "write version A");
    await fs.writeFile(filePath, "version B");
    const result = await m.undo(1);
    expect(result.undone).toBe(1);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("version A");
  });

  it("undoes creation of new file (deletes it)", async () => {
    const filePath = path.join(tempDir, "to-be-created.txt");
    const m = new (getUndoManager().constructor as any)(10);
    await m.record(filePath, "before creation - file doesn't exist yet");
    await fs.writeFile(filePath, "newly created");
    const result = await m.undo(1);
    expect(result.undone).toBe(1);
  });

  it("undoAll undoes all entries", async () => {
    const filePath = path.join(tempDir, "undo-all-test.txt");
    const m = new (getUndoManager().constructor as any)(10);
    await fs.writeFile(filePath, "v1");
    await m.record(filePath, "write v1");
    await fs.writeFile(filePath, "v2");
    await m.record(filePath, "write v2");
    await fs.writeFile(filePath, "v3");
    await m.record(filePath, "write v3");

    const result = await m.undoAll();
    expect(result.undone).toBe(3);
  });

  it("undo returns empty when stack is empty", async () => {
    const m = new (getUndoManager().constructor as any)(10);
    const result = await m.undo(1);
    expect(result.undone).toBe(0);
    expect(result.restored).toEqual([]);
  });

  it("auto-prunes when stack overflows max size", async () => {
    const m = new (getUndoManager().constructor as any)(3);
    for (let i = 0; i < 5; i++) {
      const fp = path.join(tempDir, `overflow-${i}.txt`);
      await fs.writeFile(fp, `content ${i}`);
      await m.record(fp, `entry ${i}`);
    }
    expect(m.size).toBe(3);
  });

  it("clear resets the stack", async () => {
    const m = new (getUndoManager().constructor as any)(10);
    const fp = path.join(tempDir, "clear-test.txt");
    await fs.writeFile(fp, "data");
    await m.record(fp, "entry");
    await m.clear();
    expect(m.size).toBe(0);
  });

  it("entries getter returns copy of stack", async () => {
    const m = new (getUndoManager().constructor as any)(10);
    const fp = path.join(tempDir, "entries-test.txt");
    await fs.writeFile(fp, "data");
    await m.record(fp, "entry");
    expect(m.entries.length).toBe(1);
  });
});

describe("UndoManager singleton", () => {
  it("getUndoManager returns current manager", () => {
    const m = getUndoManager();
    expect(m).toBeDefined();
  });

  it("setUndoManager replaces manager", () => {
    const custom = new (getUndoManager().constructor as any)(5);
    setUndoManager(custom);
    expect(getUndoManager()).toBe(custom);
    resetUndoManager();
  });
});