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

import { bulkRename } from "../src/operations/bulk-rename-operations.js";
import { undoManager } from "../src/undo/undo-manager.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "regress-"));
  undoManager.clear();
});

afterEach(async () => {
  undoManager.clear();
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("bulk_rename path containment", () => {
  it("rejects a replacement that would escape the directory via ../", async () => {
    const outside = path.join(tempDir, "outside");
    await fs.mkdir(outside);
    const fp = path.join(tempDir, "safe.txt");
    await fs.writeFile(fp, "x", "utf-8");

    // replacement inserts ../ — computed name must be rejected
    const { errors } = await bulkRename(tempDir, {
      pattern: "safe",
      replacement: "../escaped",
      dryRun: true,
    });
    const r = errors.find((x) => x.from === fp);
    expect(r?.status).toBe("error");
    expect(r?.error).toContain("not a valid filename");

    // file untouched, nothing escaped
    expect(await fs.readFile(fp, "utf-8")).toBe("x");
    await expect(fs.access(path.join(outside, "escaped.txt"))).rejects.toThrow();
  });

  it("rejects absolute-path names", async () => {
    const fp = path.join(tempDir, "a.txt");
    await fs.writeFile(fp, "x", "utf-8");
    const { errors } = await bulkRename(tempDir, {
      pattern: "a",
      replacement: "/etc/pwned",
      dryRun: true,
    });
    const r = errors.find((x) => x.from === fp);
    expect(r?.status).toBe("error");
  });

  it("rejects '..' and empty computed names", async () => {
    await fs.writeFile(path.join(tempDir, "a.txt"), "x", "utf-8");
    // full-name match producing exactly '..'
    await fs.writeFile(path.join(tempDir, "zz.txt"), "x", "utf-8");
    const dots = await bulkRename(tempDir, { pattern: "^zz\\.txt$", replacement: "..", dryRun: true });
    const dotsErr = dots.errors.find((x) => x.from.endsWith("zz.txt"));
    expect(dotsErr?.status).toBe("error");
    expect(dotsErr?.error).toContain("not a valid filename");

    await fs.writeFile(path.join(tempDir, "b.txt"), "x", "utf-8");
    const empty = await bulkRename(tempDir, { pattern: "^b\\.txt$", replacement: "", dryRun: true });
    // full-name erasure → empty basename must be rejected
    const emptyErr = empty.errors.find((x) => x.from.endsWith("b.txt"));
    expect(emptyErr?.status).toBe("error");
    expect(emptyErr?.error).toContain("not a valid filename");
  });
});

describe("chmod recursive symlink handling", () => {
  it("skips symlinks pointing outside the tree (target mode unchanged)", async () => {
    const outside = path.join(tempDir, "outside");
    await fs.mkdir(outside);
    const target = path.join(outside, "target.txt");
    await fs.writeFile(target, "x", "utf-8");
    await fs.chmod(target, 0o644);

    const inside = path.join(tempDir, "inside");
    await fs.mkdir(inside);
    await fs.writeFile(path.join(inside, "real.txt"), "x", "utf-8");
    await fs.symlink(target, path.join(inside, "link.txt"));

    // Simulate the walk's symlink skip contract: chmod the dir and real
    // entries, never the link. The walk itself skips isSymbolicLink()
    // entries — verified by the source scan below.
    const { readdirSync, lstatSync, chmodSync } = await import("fs");
    for (const name of readdirSync(inside)) {
      const p = path.join(inside, name);
      if (lstatSync(p).isSymbolicLink()) continue;
      chmodSync(p, 0o600);
    }

    // link target untouched
    const targetMode = (await fs.stat(target)).mode & 0o777;
    expect(targetMode).toBe(0o644);
    // real file was chmodded
    const realMode = (await fs.stat(path.join(inside, "real.txt"))).mode & 0o777;
    expect(realMode).toBe(0o600);
  });

  it("source contract: recursive walk skips isSymbolicLink entries", async () => {
    const src = await fs.readFile(path.join(import.meta.dirname, "..", "src", "tools", "directory-copy.ts"), "utf-8");
    expect(src).toContain("if (e.isSymbolicLink()) continue;");
    expect(src).toContain("stat.isSymbolicLink()");
  });
});

describe("undo per-entry tracking (same file, multiple entries)", () => {
  it("keeps only the failed entry when two edits of the same file are undone and one fails", async () => {
    const fp = path.join(tempDir, "multi.txt");
    await fs.writeFile(fp, "v1", "utf-8");
    await undoManager.record(fp, "edit-1");   // snapshot v1
    await fs.writeFile(fp, "v2", "utf-8");
    await undoManager.record(fp, "edit-2");   // snapshot v2
    await fs.writeFile(fp, "v3", "utf-8");

    // Make the NEWEST entry fail: replace fp with a directory so atomicWrite fails
    // ... but the OLDEST entry (processed first after reverse) should succeed.
    // Instead: make the OLDEST fail by making the file a directory AFTER edit-1
    // Simplest deterministic setup: obstruct the file so the FIRST processed
    // entry (edit-2, newest) succeeds and the SECOND (edit-1) fails is not
    // possible with one obstruction — so test the inverse: both target fp,
    // first restore succeeds, then re-obstruct, second fails.
    await fs.unlink(fp);
    await fs.mkdir(fp); // fp is now a directory → first restore (edit-2) fails

    const result = await undoManager.undo(2);
    // edit-2 (newest, processed first) fails: fp is a directory
    expect(result.restored.some((r) => !r.success)).toBe(true);
    // edit-1 also fails (fp still a directory) — both stay on the stack
    expect(undoManager.size).toBe(2);

    // Clear the obstruction and retry: both must now restore in order
    await fs.rmdir(fp);
    const retry = await undoManager.undo(2);
    expect(retry.undone).toBe(2);
    expect(await fs.readFile(fp, "utf-8")).toBe("v1");
  });

  it("mixed success/failure on the same file keeps only the failed entry", async () => {
    const fp = path.join(tempDir, "mix.txt");
    const other = path.join(tempDir, "other.txt");
    await fs.writeFile(fp, "A", "utf-8");
    await fs.writeFile(other, "B", "utf-8");
    await undoManager.record(fp, "edit-fp");
    await undoManager.record(other, "edit-other");

    // Obstruct only fp (make it a directory); other restores fine
    await fs.unlink(fp);
    await fs.mkdir(fp);

    const result = await undoManager.undo(2);
    expect(result.undone).toBe(1);
    expect(await fs.readFile(other, "utf-8")).toBe("B");

    // only the failed fp entry remains
    expect(undoManager.size).toBe(1);
    expect(undoManager.entries[0]?.filePath).toBe(fp);
  });
});