import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    roots: { enabled: false, roots: [], autoDiscover: false },
    fileRead: { maxFileSizeBytes: 1024 * 1024 }, // 1MB per file
    undo: { maxStackSize: 100, maxEntrySizeBytes: 1_000_000, persistDir: null },
    stalenessGuard: { enabled: false },
    security: { denyPaths: [], unrestrictedAck: true, logOutsideCwd: false },
    debug: false,
    templatesDir: undefined,
  })),
  isRootsRestrictionEnabled: () => false,
  shouldLogRootsEvents: () => false,
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFileReadTools } from "../src/tools/file-read.js";
import { setupToolFactories } from "../src/utils/tool-factory.js";

let tempDir: string;
let readMultiple: (args: { paths: string[] }) => Promise<{ structuredContent?: { files: Array<{ path: string; content?: string; error?: string }> } }>;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rmf-"));
  const server = new McpServer({ name: "t", version: "0" });
  const handlers = new Map<string, (args: unknown) => Promise<unknown>>();
  const origRegister = server.registerTool.bind(server);
  (server as unknown as { registerTool: typeof server.registerTool }).registerTool = ((
    name: string,
    config: unknown,
    handler: (args: unknown) => Promise<unknown>,
  ) => {
    handlers.set(name, handler);
    return origRegister(name, config as Parameters<typeof server.registerTool>[1], handler as Parameters<typeof server.registerTool>[2]);
  }) as typeof server.registerTool;
  const factories = setupToolFactories(server);
  registerFileReadTools({ server, factories } as never);
  readMultiple = handlers.get("read_multiple_files") as typeof readMultiple;
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("read_multiple_files byte limits", () => {
  it("rejects a file exceeding the per-file limit", async () => {
    const big = path.join(tempDir, "big.txt");
    await fs.writeFile(big, Buffer.alloc(2 * 1024 * 1024, 7)); // 2MB > 1MB
    const res = await readMultiple({ paths: [big] });
    const f = res.structuredContent?.files[0];
    expect(f?.error).toContain("exceeds per-file limit");
    expect(f?.content).toBeUndefined();
  });

  it("skips files once the total response budget is exhausted", async () => {
    // 12 files of 0.9MB each: budget is 10 × 1MB = 10MB → first ~11 fit, rest skipped
    const paths: string[] = [];
    for (let i = 0; i < 12; i++) {
      const p = path.join(tempDir, `f${i}.txt`);
      await fs.writeFile(p, Buffer.alloc(900 * 1024, 1)); // 0.9MB
      paths.push(p);
    }
    const res = await readMultiple({ paths });
    const files = res.structuredContent?.files ?? [];
    const withContent = files.filter((f) => f.content !== undefined);
    const skipped = files.filter((f) => f.error?.includes("budget"));
    expect(withContent.length).toBeGreaterThanOrEqual(10);
    expect(skipped.length).toBeGreaterThan(0);
  });

  it("reports file-count truncation beyond 50 paths", async () => {
    const paths: string[] = [];
    for (let i = 0; i < 52; i++) {
      const p = path.join(tempDir, `t${i}.txt`);
      await fs.writeFile(p, "x");
      paths.push(p);
    }
    const res = await readMultiple({ paths });
    const files = res.structuredContent?.files ?? [];
    const trunc = files.find((f) => f.error === "truncated");
    expect(trunc?.path).toContain("2 more");
  });
});
