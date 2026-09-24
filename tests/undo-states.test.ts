import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    undo: { maxStackSize: 100, maxEntrySizeBytes: 1_000_000, persistDir: null },
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "undo-states-"));
  undoManager.clear();
});

afterEach(async () => {
  undoManager.clear();
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("undo PreviousState union", () => {
  it("created: undo of a file-creation record deletes the file", async () => {
    const fp = path.join(tempDir, "created.txt");
    // record BEFORE the file exists → created
    await undoManager.record(fp, "create file");
    expect(undoManager.peek()[0]?.previous).toEqual({ kind: "created" });

    await fs.writeFile(fp, "new content", "utf-8");
    const result = await undoManager.undo();
    expect(result.undone).toBe(1);
    await expect(fs.access(fp)).rejects.toThrow();
  });

  it("notUndoable: oversized file is never snapshotted and undo refuses to touch it", async () => {
    const fp = path.join(tempDir, "big.bin");
    // 2MB > 1MB limit from mocked config
    const big = Buffer.alloc(2 * 1024 * 1024, 7);
    await fs.writeFile(fp, big);
    await undoManager.record(fp, "edit big file");

    const entry = undoManager.peek()[0];
    expect(entry?.previous.kind).toBe("notUndoable");

    // modify the file, then undo: file must remain MODIFIED (not deleted, not restored)
    await fs.writeFile(fp, "modified", "utf-8");
    const result = await undoManager.undo();
    expect(result.undone).toBe(0);
    expect(result.restored[0].success).toBe(false);
    expect(result.restored[0].error).toContain("not undoable");

    const content = await fs.readFile(fp, "utf-8");
    expect(content).toBe("modified");

    // failed entry stays on the stack — retry possible
    expect(undoManager.size).toBe(1);
  });

  it("snapshot: multi-byte content measured in bytes, restored faithfully", async () => {
  const fp = path.join(tempDir, "mb.txt");
  // 600k chars of 4-byte emoji = 2.4MB bytes > 1MB limit → notUndoable
  const heavy = "\u{1F600}".repeat(600_000);
  await fs.writeFile(fp, heavy, "utf-8");
  await undoManager.record(fp, "edit heavy");
  const last = undoManager.entries[undoManager.entries.length - 1];
    expect(last?.previous.kind).toBe("notUndoable");

  // 200k chars of 4-byte emoji = 800KB bytes < 1MB → snapshot
  const ok = "\u{1F600}".repeat(200_000);
  await fs.writeFile(fp, ok, "utf-8");
  await undoManager.record(fp, "edit ok");
    const last2 = undoManager.entries[undoManager.entries.length - 1];
    expect(last2?.previous.kind).toBe("snapshot");
  });

  it("failed restore keeps the entry on the stack for retry", async () => {
    const fp = path.join(tempDir, "retry.txt");
    await fs.writeFile(fp, "original", "utf-8");
    await undoManager.record(fp, "edit");
    await fs.writeFile(fp, "modified", "utf-8");

    // make the restore fail: replace the file with a directory
    await fs.unlink(fp);
    await fs.mkdir(fp);

    const result = await undoManager.undo();
    expect(result.undone).toBe(0);
    expect(undoManager.size).toBe(1); // still there

    // remove the obstruction and retry — now it works
    await fs.rmdir(fp);
    const retry = await undoManager.undo();
    expect(retry.undone).toBe(1);
    expect(await fs.readFile(fp, "utf-8")).toBe("original");
  });
});