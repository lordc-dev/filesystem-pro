/**
 * Audit P1 regression: the deny-list (MCP_DENY_PATHS) must apply to every
 * file affected by an operation — recursive copy/move/delete/chmod and
 * search/listing surfaces — not just the initially validated path.
 *
 * Invokes the REAL registered tool handlers through McpServer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const { denyPaths } = vi.hoisted(() => ({ denyPaths: { value: [] as string[] } }));

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    roots: { enabled: false, roots: [], autoDiscover: false },
    undo: { maxStackSize: 100, maxEntrySizeBytes: 1_000_000, persistDir: null },
    stalenessGuard: { enabled: false },
    security: { denyPaths: denyPaths.value, unrestrictedAck: true, logOutsideCwd: false },
    search: { maxOutputBytes: 10_000_000 },
    debug: false,
    templatesDir: undefined,
  })),
  isRootsRestrictionEnabled: () => false,
  shouldLogRootsEvents: () => false,
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setupToolFactories } from "../src/utils/tool-factory.js";
import { registerCopyFileTool } from "../src/tools/directory-copy.js";
import { registerDeleteTools } from "../src/tools/directory-delete.js";
import { registerMoveFileTool } from "../src/tools/directory-move.js";
import { registerSearchTools } from "../src/tools/search-tools.js";
import { registerListDirectoryTools } from "../src/tools/directory-list.js";
import { registerBulkRenameTool } from "../src/tools/search-bulk-rename.js";
import { undoManager } from "../src/undo/undo-manager.js";
import type { ToolContext } from "../src/tools/types.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }>;

/** Register tools on a fresh server and return { name → real handler }. */
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

/** Assert the call is refused because of the deny-list — via thrown error or error response. */
async function expectDenied(call: () => Promise<{ content: Array<{ text?: string }>; isError?: boolean }>): Promise<void> {
  try {
    const res = await call();
    const text = res.isError ? `${res.isError} ${res.content[0]?.text ?? ""}` : (res.content[0]?.text ?? "");
    expect(text).toContain("denied");
  } catch (err) {
    expect(err instanceof Error ? err.message : String(err)).toContain("denied");
  }
}

let tempDir: string;   // realpath'd (macOS: /private/var/...) — deny patterns must match resolved paths
let srcDir: string;
let secretDir: string;

beforeEach(async () => {
  tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "deny-")));
  srcDir = path.join(tempDir, "src");
  secretDir = path.join(srcDir, "secret.d");
  await fs.mkdir(secretDir, { recursive: true });
  await fs.writeFile(path.join(secretDir, "key.txt"), "TOPSECRET", "utf-8");
  await fs.writeFile(path.join(srcDir, "normal.txt"), "x", "utf-8");
  denyPaths.value = [secretDir];
  undoManager.clear();
});

afterEach(async () => {
  undoManager.clear();
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("recursive operations refuse trees containing denied paths", () => {
  it("copy_file refuses to copy a folder containing a denied file", async () => {
    const handlers = await captureHandlers(registerCopyFileTool);
    const dest = path.join(tempDir, "copy-out");
    await expectDenied(() => handlers.get("copy_file")!({ source: srcDir, destination: dest, overwrite: false }));
    await expect(fs.access(dest)).rejects.toThrow();
  });

  it("move_file refuses to move a folder containing a denied file", async () => {
    const handlers = await captureHandlers(registerMoveFileTool);
    const dest = path.join(tempDir, "moved-out");
    await expectDenied(() => handlers.get("move_file")!({ source: srcDir, destination: dest, overwrite: false }));
    await expect(fs.access(dest)).rejects.toThrow();
    // source untouched
    await expect(fs.access(secretDir)).resolves.toBeUndefined();
  });

  it("delete_directory recursive refuses a tree containing a denied file", async () => {
    const handlers = await captureHandlers(registerDeleteTools);
    await expectDenied(() => handlers.get("delete_directory")!({ path: srcDir, recursive: true }));
    await expect(fs.access(secretDir)).resolves.toBeUndefined();
  });

  it("delete_path recursive refuses a tree containing a denied file", async () => {
    const handlers = await captureHandlers(registerDeleteTools);
    await expectDenied(() => handlers.get("delete_path")!({ path: srcDir, recursive: true }));
    await expect(fs.access(secretDir)).resolves.toBeUndefined();
  });

  it("chmod recursive refuses a tree containing a denied file", async () => {
    const handlers = await captureHandlers(registerCopyFileTool);
    const before = (await fs.stat(path.join(secretDir, "key.txt"))).mode;
    await expectDenied(() => handlers.get("chmod")!({ path: srcDir, mode: "u+x", recursive: true }));
    expect((await fs.stat(path.join(secretDir, "key.txt"))).mode).toBe(before);
  });

  it("copy of a CLEAN tree still works (no false positives)", async () => {
    await fs.rm(secretDir, { recursive: true });
    const handlers = await captureHandlers(registerCopyFileTool);
    const dest = path.join(tempDir, "copy-out");
    const res = await handlers.get("copy_file")!({ source: srcDir, destination: dest, overwrite: false });
    expect(res.isError).toBeFalsy();
    await expect(fs.access(path.join(dest, "normal.txt"))).resolves.toBeUndefined();
  });

  it("copy_file refuses when a deny rule names a path inside the destination (projected)", async () => {
    // clean source, deny rule targets where the file WOULD LAND
    await fs.rm(secretDir, { recursive: true });
    denyPaths.value = [path.join(tempDir, "copy-out", "normal.txt")];
    const handlers = await captureHandlers(registerCopyFileTool);
    const dest = path.join(tempDir, "copy-out");
    await expectDenied(() => handlers.get("copy_file")!({ source: srcDir, destination: dest, overwrite: false }));
    await expect(fs.access(dest)).rejects.toThrow();
  });

  it("move_file refuses when a deny rule names a path inside the destination (projected)", async () => {
    await fs.rm(secretDir, { recursive: true });
    denyPaths.value = [path.join(tempDir, "moved-out", "normal.txt")];
    const handlers = await captureHandlers(registerMoveFileTool);
    const dest = path.join(tempDir, "moved-out");
    await expectDenied(() => handlers.get("move_file")!({ source: srcDir, destination: dest, overwrite: false }));
    await expect(fs.access(dest)).rejects.toThrow();
    // source untouched
    await expect(fs.access(path.join(srcDir, "normal.txt"))).resolves.toBeUndefined();
  });

  it("recursive delete removes a symlink to a denied target but never the target (P3)", async () => {
    // denied target OUTSIDE the deleted tree
    const targetBase = path.join(tempDir, "target-base");
    await fs.mkdir(targetBase);
    const deniedTarget = path.join(targetBase, "denied-target.txt");
    await fs.writeFile(deniedTarget, "KEEP", "utf-8");
    denyPaths.value = [deniedTarget];
    // link INSIDE the tree points at the denied target
    await fs.symlink(deniedTarget, path.join(srcDir, "link.txt"));
    const handlers = await captureHandlers(registerDeleteTools);
    const res = await handlers.get("delete_directory")!({ path: srcDir, recursive: true });
    expect(res.isError).toBeFalsy();
    // link gone, target intact
    await expect(fs.access(path.join(srcDir, "link.txt"))).rejects.toThrow();
    expect(await fs.readFile(deniedTarget, "utf-8")).toBe("KEEP");
  });
});

describe("search and listing surfaces hide denied paths", () => {
  it("find_by_glob never returns denied paths", async () => {
    const handlers = await captureHandlers(registerSearchTools);
    const res = await handlers.get("find_by_glob")!({ patterns: "**/*", cwd: srcDir });
    expect(res.content[0]?.text ?? "").not.toContain("secret.d");
  });

  it("search_files never returns denied paths", async () => {
    const handlers = await captureHandlers(registerSearchTools);
    const res = await handlers.get("search_files")!({ path: srcDir, pattern: "key" });
    expect(res.content[0]?.text ?? "").not.toContain("secret.d");
  });

  it("search_content never returns matches from denied files", async () => {
    const handlers = await captureHandlers(registerSearchTools);
    const res = await handlers.get("search_content")!({ path: srcDir, pattern: "TOPSECRET" });
    expect(res.content[0]?.text ?? "").not.toContain("TOPSECRET");
  });

  it("count_matches skips denied files", async () => {
    const handlers = await captureHandlers(registerSearchTools);
    const res = await handlers.get("count_matches")!({ path: srcDir, pattern: "TOPSECRET" });
    const sc = res.structuredContent as { total: number };
    expect(sc.total).toBe(0);
  });

  it("list_directory hides denied entries", async () => {
    const handlers = await captureHandlers(registerListDirectoryTools);
    const res = await handlers.get("list_directory")!({ path: srcDir });
    expect(res.content[0]?.text ?? "").not.toContain("secret.d");
  });

  it("directory_tree prunes denied subtrees", async () => {
    const handlers = await captureHandlers(registerListDirectoryTools);
    const res = await handlers.get("directory_tree")!({ path: srcDir });
    expect(JSON.stringify(res.structuredContent ?? res.content)).not.toContain("secret.d");
  });

  it("bulk_rename skips denied files", async () => {
    const handlers = await captureHandlers(registerBulkRenameTool);
    const res = await handlers.get("bulk_rename")!({ path: srcDir, pattern: "key", replacement: "renamed", dryRun: false });
    const sc = res.structuredContent as { renamed: Array<{ from: string }> };
    expect(sc.renamed.every((r) => !r.from.includes("secret.d"))).toBe(true);
    await expect(fs.access(path.join(secretDir, "key.txt"))).resolves.toBeUndefined();
  });
});