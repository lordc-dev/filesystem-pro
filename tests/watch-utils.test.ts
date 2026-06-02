import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

vi.mock("chokidar", () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

import { FileWatcher, watcherManager } from "../src/file-operations/watch-utils.js";

let tempDir: string;
let watcherIds: string[] = [];

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "watch-test-"));
  await watcherManager.removeAllWatchers();
});

afterEach(async () => {
  for (const id of watcherIds) {
    await watcherManager.removeWatcher(id).catch(() => {});
  }
  await watcherManager.removeAllWatchers();
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("FileWatcher", () => {
  it("emits ready event on start", async () => {
    const watcher = new FileWatcher({ path: tempDir });
    const ready = vi.fn();
    watcher.on("ready", ready);

    watcher.start();
    expect(ready).not.toHaveBeenCalled();
  });

  it("throws on double start", () => {
    const watcher = new FileWatcher({ path: tempDir });
    watcher.start();
    expect(() => watcher.start()).toThrow();
  });

  it("stop resolves without error when not started", async () => {
    const watcher = new FileWatcher({ path: tempDir });
    await expect(watcher.stop()).resolves.toBeUndefined();
  });
});

describe("WatcherManager", () => {
  it("creates and tracks watcher", () => {
    const id = "test-1";
    watcherIds.push(id);
    const watcher = watcherManager.createWatcher(id, { path: tempDir });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it("throws on duplicate watcher id", () => {
    const id = "dup";
    watcherIds.push(id);
    watcherManager.createWatcher(id, { path: tempDir });
    expect(() => watcherManager.createWatcher(id, { path: tempDir })).toThrow();
  });

  it("removes watcher by id", async () => {
    const id = "rm-1";
    watcherIds.push(id);
    watcherManager.createWatcher(id, { path: tempDir });
    const removed = await watcherManager.removeWatcher(id);
    expect(removed).toBe(true);
    watcherIds = watcherIds.filter(i => i !== id);
  });

  it("returns false for non-existent watcher", async () => {
    const removed = await watcherManager.removeWatcher("nonexistent");
    expect(removed).toBe(false);
  });

  it("removeAllWatchers clears all", async () => {
    watcherIds.push("a", "b");
    watcherManager.createWatcher("a", { path: tempDir });
    watcherManager.createWatcher("b", { path: tempDir });
    await watcherManager.removeAllWatchers();
    watcherIds = [];
  });
});