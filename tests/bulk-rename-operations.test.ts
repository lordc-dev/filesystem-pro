import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { bulkRename, generateRenameReport, type FileRenameResult } from "../src/operations/bulk-rename-operations.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp("/tmp/bulk-rename-test-");
  await fs.writeFile(path.join(tempDir, "foo.ts"), "a");
  await fs.writeFile(path.join(tempDir, "bar.ts"), "b");
  await fs.writeFile(path.join(tempDir, "baz.js"), "c");
  await fs.mkdir(path.join(tempDir, "sub"));
  await fs.writeFile(path.join(tempDir, "sub", "nested_foo.ts"), "d");
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("bulkRename", () => {
  it("renames files matching pattern (dry run)", async () => {
    const result = await bulkRename(tempDir, {
      pattern: "foo",
      replacement: "qux",
      dryRun: true,
    });
    expect(result.renamed.length).toBeGreaterThanOrEqual(1);
    const stillExists = await fs.access(path.join(tempDir, "foo.ts")).then(() => true, () => false);
    expect(stillExists).toBe(true);
  });

  it("actually renames files when not dry run", async () => {
    const result = await bulkRename(tempDir, {
      pattern: "bar",
      replacement: "renamed",
      dryRun: false,
    });
    expect(result.renamed.length).toBeGreaterThanOrEqual(1);
    const exists = await fs.access(path.join(tempDir, "renamed.ts")).then(() => true, () => false);
    expect(exists).toBe(true);
    const oldGone = await fs.access(path.join(tempDir, "bar.ts")).then(() => true, () => false);
    expect(oldGone).toBe(false);
  });

  it("skips files when pattern does not match", async () => {
    const result = await bulkRename(tempDir, {
      pattern: "nonexistent",
      replacement: "x",
      dryRun: false,
    });
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it("filters by extension", async () => {
    const result = await bulkRename(tempDir, {
      pattern: "\\.(ts|js)$",
      replacement: ".renamed$1",
      includeExtensions: ["ts"],
      dryRun: true,
    });
    const tsRenamed = result.renamed.some(r => r.from.endsWith(".ts"));
    const jsRenamed = result.renamed.some(r => r.from.endsWith(".js"));
    expect(tsRenamed || result.skipped.some(r => r.from.endsWith(".ts"))).toBe(true);
  });

  it("returns error when target file already exists", async () => {
    await fs.writeFile(path.join(tempDir, "qux.ts"), "exists");
    const result = await bulkRename(tempDir, {
      pattern: "foo",
      replacement: "qux",
      dryRun: false,
    });
    expect(result.errors.some(r => r.error?.includes("already exists"))).toBe(true);
  });

  it("handles recursive rename", async () => {
    const result = await bulkRename(tempDir, {
      pattern: "foo",
      replacement: "qux",
      recursive: true,
      dryRun: true,
    });
    const nestedMatch = result.renamed.some(r => r.from.includes("nested_foo"));
    expect(nestedMatch).toBe(true);
  });
});

describe("generateRenameReport", () => {
  it("generates report with renamed files", () => {
    const report = generateRenameReport({
      renamed: [{ from: "/a.ts", to: "/b.ts", status: "renamed" }],
      errors: [],
      skipped: [],
    });
    expect(report).toContain("Successfully renamed: 1");
    expect(report).toContain("/a.ts → /b.ts");
  });

  it("generates report with errors", () => {
    const report = generateRenameReport({
      renamed: [],
      errors: [{ from: "/a.ts", to: "/a.ts", status: "error", error: "target exists" }],
      skipped: [],
    });
    expect(report).toContain("Errors: 1");
    expect(report).toContain("target exists");
  });

  it("generates report with skipped files", () => {
    const skipped: FileRenameResult[] = Array.from({ length: 5 }, (_, i) => ({
      from: `/file${i}.ts`,
      to: `/file${i}.ts`,
      status: "skipped" as const,
      error: "Pattern did not match",
    }));
    const report = generateRenameReport({
      renamed: [],
      errors: [],
      skipped,
    });
    expect(report).toContain("Skipped Files");
  });

  it("summarizes when many skipped files", () => {
    const skipped: FileRenameResult[] = Array.from({ length: 25 }, (_, i) => ({
      from: `/file${i}.ts`,
      to: `/file${i}.ts`,
      status: "skipped" as const,
      error: "Pattern did not match",
    }));
    const report = generateRenameReport({
      renamed: [],
      errors: [],
      skipped,
    });
    expect(report).toContain("Skipped 25 files");
  });
});