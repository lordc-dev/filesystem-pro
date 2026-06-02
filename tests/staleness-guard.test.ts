import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    undo: { maxStackSize: 100, persistDir: null },
    stalenessGuard: { enabled: true },
    debug: false,
    templatesDir: undefined,
  })),
  isRootsRestrictionEnabled: () => false,
  shouldLogRootsEvents: () => false,
}));

import { stalenessGuard } from "../src/undo/staleness-guard.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "staleness-test-"));
  stalenessGuard.clear();
});

afterEach(async () => {
  stalenessGuard.clear();
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("stalenessGuard", () => {
  it("allows write when no fingerprint recorded", async () => {
    const fp = path.join(tempDir, "file.txt");
    await fs.writeFile(fp, "content", "utf-8");

    const error = await stalenessGuard.checkAndGetError(fp);
    expect(error).toBeNull();
  });

  it("allows write when file unchanged since last read", async () => {
    const fp = path.join(tempDir, "file.txt");
    await fs.writeFile(fp, "content", "utf-8");
    await stalenessGuard.recordFromPath(fp);

    const error = await stalenessGuard.checkAndGetError(fp);
    expect(error).toBeNull();
  });

  it("rejects write when file modified externally", async () => {
    const fp = path.join(tempDir, "file.txt");
    await fs.writeFile(fp, "original", "utf-8");
    await stalenessGuard.recordFromPath(fp);

    await new Promise((r) => setTimeout(r, 50));
    await fs.writeFile(fp, "modified", "utf-8");

    const error = await stalenessGuard.checkAndGetError(fp);
    expect(error).not.toBeNull();
    expect(error).toContain("changed externally");
  });

  it("invalidates fingerprint", async () => {
    const fp = path.join(tempDir, "file.txt");
    await fs.writeFile(fp, "content", "utf-8");
    await stalenessGuard.recordFromPath(fp);
    expect(stalenessGuard.size).toBe(1);

    stalenessGuard.invalidate(fp);
    expect(stalenessGuard.size).toBe(0);

    const error = await stalenessGuard.checkAndGetError(fp);
    expect(error).toBeNull();
  });

  it("clear removes all fingerprints", async () => {
    const fp = path.join(tempDir, "file.txt");
    await fs.writeFile(fp, "content", "utf-8");
    await stalenessGuard.recordFromPath(fp);

    stalenessGuard.clear();
    expect(stalenessGuard.size).toBe(0);
  });

  it("check returns stale=false for deleted file", async () => {
    const fp = path.join(tempDir, "deleted.txt");
    await fs.writeFile(fp, "content", "utf-8");
    await stalenessGuard.recordFromPath(fp);

    await fs.unlink(fp);
    const result = await stalenessGuard.check(fp);
    expect(result.stale).toBe(false);
  });

  it("recordBatch records multiple files", async () => {
    const fp1 = path.join(tempDir, "a.txt");
    const fp2 = path.join(tempDir, "b.txt");
    await fs.writeFile(fp1, "a", "utf-8");
    await fs.writeFile(fp2, "b", "utf-8");

    await stalenessGuard.recordBatch([fp1, fp2]);
    expect(stalenessGuard.size).toBe(2);
  });
});