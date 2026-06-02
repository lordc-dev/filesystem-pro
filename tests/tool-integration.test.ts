import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

vi.mock("../src/config/index.js", () => ({
  getConfig: vi.fn(() => ({
    cache: { disabled: false, symbolCacheTtlMs: 60000, symbolCacheSize: 100, astCacheTtlMs: 60000, astCacheSize: 50 },
    undo: { maxStackSize: 100, maxEntrySizeBytes: 1000000, persistDir: null },
    fileRead: { maxFileSizeBytes: 50 * 1024 * 1024 },
    search: { maxResults: 100, excludeDirs: ["node_modules"], maxOutputBytes: 2 * 1024 * 1024 },
    stalenessGuard: { enabled: false },
    debug: false,
    templatesDir: undefined,
  })),
  isRootsRestrictionEnabled: () => false,
  shouldLogRootsEvents: () => false,
}));

import { readTextContent } from "../src/file-operations/read-utils.js";
import { searchContent } from "../src/search/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tool-integ-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe("file read operations integration", () => {
  it("reads full file content", async () => {
    const fp = path.join(tempDir, "full.txt");
    await fs.writeFile(fp, "line1\nline2\nline3", "utf-8");
    const content = await readTextContent(fp);
    expect(content).toContain("line1");
    expect(content).toContain("line3");
  });

  it("reads with head limit", async () => {
    const fp = path.join(tempDir, "head.txt");
    await fs.writeFile(fp, "a\nb\nc\nd\ne", "utf-8");
    const content = await readTextContent(fp, 2);
    const lines = content.split("\n").filter(l => l.trim());
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it("reads with tail limit", async () => {
    const fp = path.join(tempDir, "tail.txt");
    await fs.writeFile(fp, "a\nb\nc\nd\ne", "utf-8");
    const content = await readTextContent(fp, undefined, 2);
    expect(content).toContain("d");
    expect(content).toContain("e");
  });

  it("reads empty file", async () => {
    const fp = path.join(tempDir, "empty.txt");
    await fs.writeFile(fp, "", "utf-8");
    const content = await readTextContent(fp);
    expect(content).toBe("");
  });

  it("throws for non-existent file", async () => {
    await expect(readTextContent(path.join(tempDir, "nope.txt"))).rejects.toThrow();
  });
});

describe("directory operations integration", () => {
  it("create and list directory", async () => {
    const dir = path.join(tempDir, "new-dir");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "a.txt"), "a");
    await fs.writeFile(path.join(dir, "b.ts"), "b");

    const entries = await fs.readdir(dir, { withFileTypes: true });
    expect(entries.length).toBe(2);
    const names = entries.map(e => e.name);
    expect(names).toContain("a.txt");
    expect(names).toContain("b.ts");
  });

  it("move file preserves content", async () => {
    const src = path.join(tempDir, "src.txt");
    const dst = path.join(tempDir, "dst.txt");
    await fs.writeFile(src, "content", "utf-8");
    await fs.rename(src, dst);

    const content = await fs.readFile(dst, "utf-8");
    expect(content).toBe("content");
    await expect(fs.access(src)).rejects.toThrow();
  });

  it("delete file removes entry", async () => {
    const fp = path.join(tempDir, "del.txt");
    await fs.writeFile(fp, "x", "utf-8");
    await fs.unlink(fp);
    await expect(fs.access(fp)).rejects.toThrow();
  });

  it("directory tree traversal", async () => {
    await fs.mkdir(path.join(tempDir, "sub"));
    await fs.writeFile(path.join(tempDir, "root.txt"), "r");
    await fs.writeFile(path.join(tempDir, "sub", "nested.txt"), "n");

    const walk = async (dir: string): Promise<string[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...await walk(full));
        else files.push(full);
      }
      return files;
    };

    const all = await walk(tempDir);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});

describe("search operations integration", () => {
  it("searchContent finds text in files", async () => {
    await fs.writeFile(path.join(tempDir, "search.txt"), "hello world\nfoo bar\nhello again", "utf-8");

    const results = await searchContent(tempDir, "hello", {
      ignoreCase: false,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("searchContent with no matches returns empty", async () => {
    await fs.writeFile(path.join(tempDir, "nomatch.txt"), "nothing here", "utf-8");
    const results = await searchContent(tempDir, "ZZZZNONEXISTENT", {
      ignoreCase: false,
    });
    expect(results.length).toBe(0);
  });

  it("searchContent regex pattern works", async () => {
    await fs.writeFile(path.join(tempDir, "regex.txt"), "test123\ntest456\nother", "utf-8");
    const results = await searchContent(tempDir, "test\\d+", {
      ignoreCase: false,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("countMatches counts pattern occurrences", async () => {
    await fs.writeFile(path.join(tempDir, "count.txt"), "aaa\nbbb\naaa\nbbb\naaa", "utf-8");
    const results = await searchContent(tempDir, "aaa", {
      ignoreCase: false,
    });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});

describe("write + read round-trip", () => {
  it("write then read returns same content", async () => {
    const fp = path.join(tempDir, "round.txt");
    const original = "Hello, World!\nSecond line\nThird line";
    await fs.writeFile(fp, original, "utf-8");
    const content = await readTextContent(fp);
    expect(content.trim()).toBe(original);
  });

  it("overwrite preserves new content", async () => {
    const fp = path.join(tempDir, "overwrite.txt");
    await fs.writeFile(fp, "v1", "utf-8");
    await fs.writeFile(fp, "v2", "utf-8");
    const content = await readTextContent(fp);
    expect(content).toBe("v2");
  });

  it("edit file line replacement", async () => {
    const fp = path.join(tempDir, "edit.txt");
    await fs.writeFile(fp, "line1\nline2\nline3", "utf-8");
    const content = await readTextContent(fp);
    const lines = content.split("\n");
    lines[1] = "replaced";
    await fs.writeFile(fp, lines.join("\n"), "utf-8");

    const updated = await readTextContent(fp);
    expect(updated).toContain("replaced");
    expect(updated).not.toContain("line2");
  });
});