import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { diffFiles, createUnifiedDiff } from "../src/operations/diff-operations.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/diff-test-");
  await fs.writeFile(path.join(tempDir, "file1.txt"), "line1\nline2\nline3\n");
  await fs.writeFile(path.join(tempDir, "file2.txt"), "line1\nmodified\nline3\n");
  await fs.writeFile(path.join(tempDir, "identical.txt"), "same\ncontent\n");
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("createUnifiedDiff", () => {
  it("creates diff for changed content", () => {
    const diff = createUnifiedDiff("old\n", "new\n", "test.txt");
    expect(diff).toContain("test.txt");
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
  });

  it("returns minimal diff for identical content", () => {
    const diff = createUnifiedDiff("same\n", "same\n", "same.txt");
    expect(diff).not.toContain("-same");
    expect(diff).not.toContain("+same");
  });

  it("respects context option", () => {
    const diff1 = createUnifiedDiff("a\nb\nc\nd\ne\n", "a\nb\nX\nd\ne\n", "file.txt", { context: 1 });
    const diff3 = createUnifiedDiff("a\nb\nc\nd\ne\n", "a\nb\nX\nd\ne\n", "file.txt", { context: 3 });
    expect(diff1.split("\n").length).toBeLessThanOrEqual(diff3.split("\n").length);
  });

  it("handles special characters in filepath", () => {
    const diff = createUnifiedDiff("a", "b", "my-file.txt");
    expect(diff).toContain("my-file.txt");
  });
});

describe("diffFiles", () => {
  it("compares two files in unified format", async () => {
    const diff = await diffFiles(
      path.join(tempDir, "file1.txt"),
      path.join(tempDir, "file2.txt"),
    );
    expect(diff).toContain("-line2");
    expect(diff).toContain("+modified");
  });

  it("compares files in side-by-side format", async () => {
    const diff = await diffFiles(
      path.join(tempDir, "file1.txt"),
      path.join(tempDir, "file2.txt"),
      { format: "side-by-side" },
    );
    expect(diff).toContain("file1.txt");
  });

  it("compares files in inline format", async () => {
    const diff = await diffFiles(
      path.join(tempDir, "file1.txt"),
      path.join(tempDir, "file2.txt"),
      { format: "inline" },
    );
    expect(diff).toContain("Comparing");
  });

  it("handles identical files", async () => {
    const diff = await diffFiles(
      path.join(tempDir, "identical.txt"),
      path.join(tempDir, "identical.txt"),
    );
    expect(diff).not.toContain("-same");
  });

  it("shows minimal diff when whitespace ignored", async () => {
    const trimmedFile = path.join(tempDir, "trimmed.txt");
    await fs.writeFile(trimmedFile, "  line1  \n  line2  \n");
    const diff = await diffFiles(
      path.join(tempDir, "file1.txt"),
      trimmedFile,
      { ignoreWhitespace: true },
    );
    expect(diff).not.toContain("-  line1");
  });
});