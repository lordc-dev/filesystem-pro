import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Coverage for the low-covered modules: directory-utils, read-utils,
 * ripgrep-glob. Exercises real fs + ripgrep paths end-to-end.
 */

describe("directory-utils coverage", () => {
  it("listDirectory recursive + hidden + sizes + sort", async () => {
    const { listDirectory } = await import("../src/file-operations/directory-utils.js");
    const dir = mkdtempSync(join(tmpdir(), "dirutils-"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "a.txt"), "12345");
    writeFileSync(join(dir, ".hidden"), "x");
    writeFileSync(join(dir, "sub", "b.txt"), "1");

    const entries = await listDirectory(dir, {
      recursive: true,
      includeHidden: true,
      withSizes: true,
      sortBy: "size",
    });
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.some((e) => e.name === ".hidden")).toBe(true);
    expect(entries.some((e) => e.isDirectory)).toBe(true);
    const sized = entries.find((e) => e.name === "a.txt");
    expect(sized?.size).toBe(5);
    rmSync(dir, { recursive: true });
  });

  it("listDirectory excludes patterns", async () => {
    const { listDirectory } = await import("../src/file-operations/directory-utils.js");
    const dir = mkdtempSync(join(tmpdir(), "dirutils-ex-"));
    writeFileSync(join(dir, "keep.txt"), "x");
    writeFileSync(join(dir, "skip.log"), "x");
    const entries = await listDirectory(dir, { excludePatterns: ["*.log"] });
    expect(entries.some((e) => e.name === "skip.log")).toBe(false);
    expect(entries.some((e) => e.name === "keep.txt")).toBe(true);
    rmSync(dir, { recursive: true });
  });

  it("listDirectory throws for nonexistent", async () => {
    const { listDirectory } = await import("../src/file-operations/directory-utils.js");
    await expect(listDirectory(join(tmpdir(), "no-such-dir-xyz"))).rejects.toThrow();
  });
});

describe("read-utils coverage", () => {
  it("readValidatedFile offset window and tail", async () => {
    const { readValidatedFile } = await import("../src/file-operations/read-utils.js");
    const dir = mkdtempSync(join(tmpdir(), "readutils-"));
    const fp = join(dir, "lines.txt");
    writeFileSync(fp, Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n"));

    const window = await readValidatedFile(fp, { offset: 11, head: 5 });
    expect(window.content).toContain("line10");
    expect(window.content).toContain("line14");
    expect(window.content).not.toContain("line15");
    expect(window.content).toContain("(10 lines before line 11 omitted)");

    const tail = await readValidatedFile(fp, { tail: 3 });
    expect(tail.content).toContain("line99");
    expect(tail.content).not.toContain("line96");
    rmSync(dir, { recursive: true });
  });

  it("readValidatedFile head + invalid params", async () => {
    const { readValidatedFile } = await import("../src/file-operations/read-utils.js");
    const dir = mkdtempSync(join(tmpdir(), "readutils-h-"));
    const fp = join(dir, "h.txt");
    writeFileSync(fp, "a\nb\nc");
    const head = await readValidatedFile(fp, { head: 2 });
    expect(head.content).toContain("a");
    expect(head.content).not.toContain("c");
    await expect(readValidatedFile(fp, { head: 0 })).rejects.toThrow();
    await expect(readValidatedFile(fp, { tail: -1 })).rejects.toThrow();
    await expect(readValidatedFile(fp, { offset: 0 })).rejects.toThrow();
    rmSync(dir, { recursive: true });
  });
});

describe("ripgrep-glob coverage", () => {
  it("globSearch basic patterns + deep", async () => {
    const { globSearch } = await import("../src/search/ripgrep-glob.js");
    const dir = mkdtempSync(join(tmpdir(), "rgglob-"));
    writeFileSync(join(dir, "a.ts"), "x");
    writeFileSync(join(dir, "b.js"), "x");
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "nested", "c.ts"), "x");

    const ts = await globSearch(["**/*.ts"], { cwd: dir });
    expect(ts.some((f) => f.endsWith("a.ts"))).toBe(true);
    expect(ts.some((f) => f.endsWith("c.ts"))).toBe(true);
    expect(ts.some((f) => f.endsWith("b.js"))).toBe(false);

    const deep = await globSearch(["*.ts"], { cwd: dir, deep: 1 });
    expect(deep.some((f) => f.endsWith("a.ts"))).toBe(true);
    expect(deep.some((f) => f.endsWith("c.ts"))).toBe(false);
    rmSync(dir, { recursive: true });
  });
});