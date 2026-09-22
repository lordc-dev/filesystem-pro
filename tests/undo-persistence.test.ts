import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

let tempDir: string;
let persistDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "undo-persist-test-"));
  persistDir = path.join(tempDir, "persist");
  process.env.MCP_UNDO_PERSIST_DIR = persistDir;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.MCP_UNDO_PERSIST_DIR;
  vi.resetModules();
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

async function loadModule() {
  return import("../src/undo/undo-persistence.js");
}

describe("undo-persistence", () => {
  it("ensurePersistDir creates the directory", async () => {
    const { ensurePersistDir } = await loadModule();
    expect(await ensurePersistDir()).toBe(true);
    const stat = await fs.stat(persistDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("saveToDisk writes JSON atomically, loadFromDisk round-trips", async () => {
    const { ensurePersistDir, saveToDisk, loadFromDisk, getPersistPath } = await loadModule();
    await ensurePersistDir();
    const entries = [
      { filePath: "/tmp/a.txt", previousContent: "old", timestamp: 1, description: "edit-1" },
      { filePath: "/tmp/b.txt", previousContent: null, timestamp: 2, description: "edit-2" },
    ];
    await saveToDisk(entries as any);
    const persistPath = getPersistPath()!;
    expect(persistPath.endsWith("undo-stack.json")).toBe(true);
    const loaded = await loadFromDisk();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].filePath).toBe("/tmp/a.txt");
    expect(loaded[1].previousContent).toBeNull();
  });

  it("loadFromDisk returns [] on missing file", async () => {
    const { loadFromDisk } = await loadModule();
    expect(await loadFromDisk()).toEqual([]);
  });

  it("loadFromDisk returns [] on corrupted JSON", async () => {
    const { ensurePersistDir, getPersistPath, loadFromDisk } = await loadModule();
    await ensurePersistDir();
    await fs.writeFile(getPersistPath()!, "{corrupted", "utf-8");
    expect(await loadFromDisk()).toEqual([]);
  });

  it("loadFromDisk returns [] on non-array JSON", async () => {
    const { ensurePersistDir, getPersistPath, loadFromDisk } = await loadModule();
    await ensurePersistDir();
    await fs.writeFile(getPersistPath()!, '{"not":"array"}', "utf-8");
    expect(await loadFromDisk()).toEqual([]);
  });

  it("saveToDisk does not throw on unwritable dir", async () => {
    const { saveToDisk } = await loadModule();
    // persistDir does not exist yet and cannot be created (file in the way)
    await fs.writeFile(persistDir, "blocking file", "utf-8");
    await expect(saveToDisk([])).resolves.toBeUndefined();
  });
});