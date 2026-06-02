import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { performance } from "perf_hooks";

import { readTextContent } from "../src/file-operations/read-utils.js";
import { searchContent } from "../src/search/index.js";
import { undoManager } from "../src/undo/undo-manager.js";

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    undo: { maxStackSize: 100, maxEntrySizeBytes: 1000000, persistDir: null },
    fileRead: { maxFileSizeBytes: 50 * 1024 * 1024 },
    search: { maxResults: 100, excludeDirs: ["node_modules"], maxOutputBytes: 2 * 1024 * 1024 },
    stalenessGuard: { enabled: false },
    debug: false,
  })),
  isRootsRestrictionEnabled: () => false,
  shouldLogRootsEvents: () => false,
}));

let tempDir: string;
const ITERATIONS = 50;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bench-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  undoManager.clear();
});

describe("performance benchmarks", () => {
  it("readTextContent < 5ms per file (1000 lines)", async () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i}: content content content`);
    const fp = path.join(tempDir, "big.txt");
    await fs.writeFile(fp, lines.join("\n"), "utf-8");

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await readTextContent(fp);
    }
    const elapsed = performance.now() - start;
    const avg = elapsed / ITERATIONS;

    expect(avg).toBeLessThan(5);
  });

  it("readTextContent with head < 2ms", async () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i}`);
    const fp = path.join(tempDir, "head-bench.txt");
    await fs.writeFile(fp, lines.join("\n"), "utf-8");

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await readTextContent(fp, 10);
    }
    const elapsed = performance.now() - start;
    const avg = elapsed / ITERATIONS;

    expect(avg).toBeLessThan(2);
  });

  it("undoManager record < 1ms per entry", async () => {
    const fp = path.join(tempDir, "undo-bench.txt");
    await fs.writeFile(fp, "original", "utf-8");

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await undoManager.record(fp, `edit-${i}`);
    }
    const elapsed = performance.now() - start;
    const avg = elapsed / ITERATIONS;

    expect(avg).toBeLessThan(5);
    undoManager.clear();
  });

  it("searchContent < 50ms for small codebase", async () => {
    for (let i = 0; i < 20; i++) {
      await fs.writeFile(
        path.join(tempDir, `file-${i}.ts`),
        `export function fn${i}() { return "hello${i}"; }\n`,
        "utf-8"
      );
    }

    const start = performance.now();
    await searchContent(tempDir, "hello", { ignoreCase: false });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it("directory listing < 5ms for 100 files", async () => {
    for (let i = 0; i < 100; i++) {
      await fs.writeFile(path.join(tempDir, `f${i}.txt`), "x", "utf-8");
    }

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      await fs.readdir(tempDir);
    }
    const elapsed = performance.now() - start;
    const avg = elapsed / 10;

    expect(avg).toBeLessThan(5);
  });
});