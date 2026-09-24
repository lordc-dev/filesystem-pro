import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    roots: { enabled: false, roots: [], autoDiscover: false },
    undo: { maxStackSize: 100, maxEntrySizeBytes: 1_000_000, persistDir: null },
    stalenessGuard: { enabled: false },
    security: { denyPaths: [], unrestrictedAck: true, logOutsideCwd: false },
    write: { fsync: false },
    debug: false,
    templatesDir: undefined,
  })),
  isRootsRestrictionEnabled: () => false,
  shouldLogRootsEvents: () => false,
}));

import { atomicWrite } from "../src/utils/fs-utils.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "awmode-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("atomicWrite mode preservation", () => {
  it("replacing a 0600 file keeps 0600 (not widened to 0644)", async () => {
    const fp = path.join(tempDir, "private.txt");
    await fs.writeFile(fp, "secret", "utf-8");
    await fs.chmod(fp, 0o600);

    await atomicWrite(fp, "new secret");

    const mode = (await fs.stat(fp)).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(await fs.readFile(fp, "utf-8")).toBe("new secret");
  });

  it("new file gets the default mode (no original to preserve)", async () => {
    const fp = path.join(tempDir, "fresh.txt");
    await atomicWrite(fp, "content");
    expect(await fs.readFile(fp, "utf-8")).toBe("content");
  });

  it("no orphan .tmp after a failed write", async () => {
    const fp = path.join(tempDir, "target.txt");
    // make the rename fail: destination is a non-empty directory
    await fs.mkdir(fp);
    await fs.writeFile(path.join(fp, "blocker"), "x");
    await expect(atomicWrite(fp, "data")).rejects.toThrow();
    const leftovers = (await fs.readdir(tempDir)).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});
