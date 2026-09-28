/**
 * Audit P1/P2 regression tests — invoke the REAL registered tool handlers.
 *
 * 1. copy_file rollback must not delete a pre-existing empty destination.
 * 2. undo persistence must land 0600 (file) / 0700 (dir).
 * 3. atomicWrite caller-provided mode applies to new files.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const { persistDir } = vi.hoisted(() => ({ persistDir: { value: null as string | null } }));

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    roots: { enabled: false, roots: [], autoDiscover: false },
    undo: { maxStackSize: 100, maxEntrySizeBytes: 1_000_000, persistDir: persistDir.value },
    stalenessGuard: { enabled: false },
    security: { denyPaths: [], unrestrictedAck: true, logOutsideCwd: false },
    search: { maxOutputBytes: 10_000_000 },
    debug: false,
    templatesDir: undefined,
    write: { fsync: false },
  })),
  isRootsRestrictionEnabled: () => false,
  shouldLogRootsEvents: () => false,
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setupToolFactories } from "../src/utils/tool-factory.js";
import { registerCopyFileTool } from "../src/tools/directory-copy.js";
import { atomicWrite } from "../src/utils/fs-utils.js";
import { saveToDisk, ensurePersistDir, getPersistPath } from "../src/undo/undo-persistence.js";
import type { ToolContext } from "../src/tools/types.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text?: string }>; isError?: boolean }>;

async function captureHandlers(register: (ctx: ToolContext) => void): Promise<Map<string, Handler>> {
  const server = new McpServer({ name: "t", version: "0" });
  const handlers = new Map<string, Handler>();
  (server as unknown as { registerTool: typeof server.registerTool }).registerTool = ((
    name: string,
    _config: unknown,
    handler: (args: unknown) => Promise<unknown>,
  ) => {
    handlers.set(name, handler as Handler);
  }) as typeof server.registerTool;
  const factories = setupToolFactories(server);
  register({ factories } as ToolContext);
  return handlers;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fix-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  persistDir.value = null;
});

describe("copy_file rollback (audit P1)", () => {
  it("failed copy leaves a pre-existing EMPTY destination dir untouched", async () => {
    const handlers = await captureHandlers(registerCopyFileTool);
    const src = path.join(tempDir, "src");
    const dest = path.join(tempDir, "dest");
    await fs.mkdir(src);
    await fs.writeFile(path.join(src, "a.txt"), "data");
    await fs.mkdir(dest); // pre-existing empty destination — NOT ours
    // cp to tmp succeeds, then the mkdir probe hits EEXIST → rollback must
    // NOT rmdir the foreign empty destination (audit P1).

    const res = await handlers.get("copy_file")!({ source: src, destination: dest, overwrite: false });
    const text = `${res.isError ?? ""} ${res.content[0]?.text ?? ""}`;
    expect(text).toContain("Destination exists");

    // The pre-existing empty destination must still exist and stay empty.
    const stat = await fs.stat(dest);
    expect(stat.isDirectory()).toBe(true);
    expect(await fs.readdir(dest)).toEqual([]);
    // And no temp sibling left behind.
    const entries = await fs.readdir(tempDir);
    expect(entries.some((e) => e.includes(".tmp-"))).toBe(false);
  });

  it("failed copy after probe creation removes the probe", async () => {
    const handlers = await captureHandlers(registerCopyFileTool);
    const src = path.join(tempDir, "src2");
    const dest = path.join(tempDir, "dest2");
    await fs.mkdir(src);
    await fs.writeFile(path.join(src, "a.txt"), "data");
    // Destination name taken by a FILE: mkdir probe fails EEXIST → rollback
    // must remove the temp sibling and NOT touch the file.
    await fs.writeFile(dest, "existing");

    const res = await handlers.get("copy_file")!({ source: src, destination: dest, overwrite: false });
    const text = `${res.isError ?? ""} ${res.content[0]?.text ?? ""}`;
    expect(text).toContain("Destination exists");

    expect(await fs.readFile(dest, "utf-8")).toBe("existing");
    const entries = await fs.readdir(tempDir);
    expect(entries.some((e) => e.includes(".tmp-"))).toBe(false);
  });
});

describe("undo persistence permissions (audit P1)", () => {
  it("persist dir is 0700 and stack file is 0600", async () => {
    persistDir.value = path.join(tempDir, "undo-persist");
    expect(await ensurePersistDir()).toBe(true);
    const dirStat = await fs.stat(persistDir.value!);
    expect(dirStat.mode & 0o777).toBe(0o700);

    await saveToDisk([{ filePath: "/x", previous: { kind: "snapshot", content: "secret" } } as never]);
    const persistPath = getPersistPath()!;
    const fileStat = await fs.stat(persistPath);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });
});

describe("atomicWrite caller-provided mode (audit P1)", () => {
  it("new file lands with the caller-requested mode despite umask", async () => {
    const oldUmask = process.umask(0o022);
    try {
      const fp = path.join(tempDir, "private.json");
      await atomicWrite(fp, "secret", 0o600);
      const stat = await fs.stat(fp);
      expect(stat.mode & 0o777).toBe(0o600);
    } finally {
      process.umask(oldUmask);
    }
  });
});

describe("copy_file concurrency (audit P1)", () => {
  it("concurrent creators of the same destination: one wins, no corruption", async () => {
    const handlers = await captureHandlers(registerCopyFileTool);
    const src = path.join(tempDir, "src-c");
    await fs.mkdir(src);
    await fs.writeFile(path.join(src, "a.txt"), "data");

    const dest = path.join(tempDir, "dest-c");
    const N = 8;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        handlers.get("copy_file")!({ source: src, destination: dest, overwrite: false })
          .then((r) => ({ ok: !r.isError, text: r.content[0]?.text ?? "" }))
          .catch(() => ({ ok: false, text: "threw" })),
      ),
    );

    const winners = results.filter((r) => r.ok).length;
    expect(winners).toBe(1); // exactly one copy succeeds
    // The winner's content is intact, losers got EEXIST, no temp litter.
    expect(await fs.readFile(path.join(dest, "a.txt"), "utf-8")).toBe("data");
    const entries = await fs.readdir(tempDir);
    expect(entries.some((e) => e.includes(".tmp-"))).toBe(false);
  });
});