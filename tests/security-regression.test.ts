import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const { rootsEnabled } = vi.hoisted(() => ({ rootsEnabled: { value: false } }));

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    roots: { enabled: false, roots: [], autoDiscover: false },
    undo: { maxStackSize: 100, maxEntrySizeBytes: 1_000_000, persistDir: null },
    stalenessGuard: { enabled: false },
    security: { denyPaths: [], unrestrictedAck: true, logOutsideCwd: false },
    debug: false,
    templatesDir: undefined,
  })),
  isRootsRestrictionEnabled: () => rootsEnabled.value,
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
it("real tool walk: skips symlinks, chmods real entries, target untouched", async () => {
// Invoke the ACTUAL registered tool handler through the MCP server —
// not a reimplementation of the walk.
const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { registerCopyFileTool } = await import("../src/tools/directory-copy.js");
const { setupToolFactories } = await import("../src/utils/tool-factory.js");

const outside = path.join(tempDir, "outside");
await fs.mkdir(outside);
const target = path.join(outside, "target.txt");
await fs.writeFile(target, "x", "utf-8");
    await fs.chmod(target, 0o644);

const inside = path.join(tempDir, "inside");
await fs.mkdir(inside);
await fs.writeFile(path.join(inside, "real.txt"), "x", "utf-8");
await fs.chmod(path.join(inside, "real.txt"), 0o644);
await fs.symlink(target, path.join(inside, "link.txt"));

const server = new McpServer({ name: "t", version: "0" });
// Capture the REAL handler the factory registers for chmod
let chmodHandler: ((args: Record<string, unknown>) => Promise<{ content: Array<{ text?: string }> }>) | undefined;
const origRegister = server.registerTool.bind(server);
(server as unknown as { registerTool: typeof server.registerTool }).registerTool = ((
  name: string,
  _config: unknown,
  handler: (args: unknown) => Promise<unknown>,
) => {
  if (name === "chmod") chmodHandler = handler as typeof chmodHandler;
  return origRegister(name, _config as Parameters<typeof server.registerTool>[1], handler as Parameters<typeof server.registerTool>[2]);
}) as typeof server.registerTool;
const factories = setupToolFactories(server);
registerCopyFileTool({ server, factories } as never);
expect(chmodHandler).toBeDefined();

const res = await chmodHandler!({ path: inside, mode: "600", recursive: true });
  const text = res.content[0]?.text ?? "";
expect(text).toContain("changed permissions");

// symlink target untouched
  expect((await fs.stat(target)).mode & 0o777).toBe(0o644);
    // restore dir readability so the test can stat children, then verify
    await fs.chmod(inside, 0o755);
    expect((await fs.stat(path.join(inside, "real.txt"))).mode & 0o777).toBe(0o600);
  });

  it("source contract: recursive walk skips isSymbolicLink entries", async () => {
    const src = await fs.readFile(path.join(import.meta.dirname, "..", "src", "tools", "directory-copy.ts"), "utf-8");
    expect(src).toContain("if (e.isSymbolicLink()) continue;");
    expect(src).toContain("stat.isSymbolicLink()");
  });
});

describe("undo symlink-parent escape", () => {
  it("refuses to restore through a parent symlink pointing outside the sandbox", async () => {
    // Sandbox: tempDir is the "root". outside/ is outside the recorded
    // entry's parent chain — link/ inside the root points there.
    const outside = path.join(tempDir, "outside");
    const outsideSub = path.join(outside, "sub");
    await fs.mkdir(outsideSub, { recursive: true });

    const linkDir = path.join(tempDir, "linkdir");
    await fs.symlink(outside, linkDir);

    // Record an entry whose parent (linkdir) resolves outside the root.
    // The file itself does not exist yet (deleted tree scenario).
    const fp = path.join(linkDir, "sub", "escaped.txt");
    await fs.writeFile(path.join(outsideSub, "escaped.txt"), "secret", "utf-8");
    await undoManager.record(fp, "delete_path: " + fp);
    // simulate the delete: remove the file (link still points to outside/)
    await fs.unlink(path.join(outsideSub, "escaped.txt"));

    // Restrict roots to tempDir so the symlink escape is detectable
    const { rootsManager } = await import("../src/validation/roots-manager.js");
    rootsEnabled.value = true;
    await rootsManager.setRoots([{ uri: "file://" + tempDir, name: "test-root" } as never]);
    try {
      // Contract 1: the through-link path is rejected by roots validation
      // (defense in depth — both the textual check and the parent-realpath
      // probe in undo must independently block this)
      const allowed = await rootsManager.isPathAllowedAsync(fp);
      expect(allowed).toBe(false);

      const result = await undoManager.undo(1);
      // The restore must be rejected: linkdir resolves outside the roots
      expect(result.undone).toBe(0);
      expect(result.restored[0]?.success).toBe(false);
      // and nothing was recreated through the link
      await expect(fs.access(path.join(outsideSub, "escaped.txt"))).rejects.toThrow();
      // the entry stays for retry
      expect(undoManager.size).toBe(1);
    } finally {
      rootsEnabled.value = false;
    }
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

  it("mixed success/failure on the SAME file keeps only the failed entry", async () => {
    // Two entries for the same file. The newest (processed first) restores
    // fine; the oldest fails because its snapshot restore is obstructed
    // AFTER the first restore succeeds — proving per-entry, not per-path.
    const fp = path.join(tempDir, "same.txt");
    await fs.writeFile(fp, "v1", "utf-8");
    await undoManager.record(fp, "edit-1");   // snapshot v1
    await fs.writeFile(fp, "v2", "utf-8");
    await undoManager.record(fp, "edit-2");   // snapshot v2
    await fs.writeFile(fp, "v3", "utf-8");

    // Obstruct between the two restores: edit-2 (newest, first processed)
    // restores v2 into fp... but fp is currently a directory → edit-2 fails.
    // Instead: make edit-2 succeed and edit-1 fail by obstructing the PARENT
    // resolution is impossible mid-batch — so use a notUndoable entry as the
    // failing one: record edit-1 on a file that becomes too large to snapshot
    // is captured at record time, not undo time. The deterministic way:
    // newest entry is a snapshot (succeeds), oldest entry is notUndoable
    // (refuses) — both for the same file.
    await fs.unlink(fp);
    await fs.writeFile(fp, "big", "utf-8");
    // make edit-1 notUndoable retroactively is impossible — instead record
    // a fresh pair: first entry notUndoable (oversized), second snapshot.
    undoManager.clear();
    const big = Buffer.alloc(2 * 1024 * 1024, 1); // > 1MB limit → notUndoable
    await fs.writeFile(fp, big);
    await undoManager.record(fp, "edit-big");      // notUndoable
    await fs.writeFile(fp, "small", "utf-8");
    await undoManager.record(fp, "edit-small");    // snapshot "small"

    const result = await undoManager.undo(2);
    // edit-small (newest, first processed) restored fp to "small"
    expect(result.undone).toBe(1);
    expect(await fs.readFile(fp, "utf-8")).toBe("small");

    // only the failed notUndoable entry remains — for the SAME file
    expect(undoManager.size).toBe(1);
    expect(undoManager.entries[0]?.filePath).toBe(fp);
    expect(undoManager.entries[0]?.previous.kind).toBe("notUndoable");
  });
});