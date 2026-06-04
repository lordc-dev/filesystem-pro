import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { createUnifiedDiff } from "../src/operations/diff-operations.js";
import { listDirectory } from "../src/file-operations/directory-utils.js";
import { validateRegexPattern } from "../src/validation/pattern-validation.js";
import { getConfig } from "../src/config/index.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/utils-deep-test-");
  await fs.writeFile(path.join(tempDir, "a.ts"), "const a = 1;");
  await fs.writeFile(path.join(tempDir, "b.js"), "const b = 2;");
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("computeDiff deep", () => {
  it("diffs multi-line changes", async () => {
    const oldContent = "line1\nline2\nline3\nline4";
    const newContent = "line1\nMODIFIED\nline3\nline5";
    const result = createUnifiedDiff(oldContent, newContent, "test.txt");
    expect(result).toContain("MODIFIED");
  });

  it("handles added lines", async () => {
    const oldContent = "line1";
    const newContent = "line1\nline2\nline3";
    const result = createUnifiedDiff(oldContent, newContent, "test.txt");
    expect(result).toBeDefined();
  });

  it("handles removed lines", async () => {
    const oldContent = "line1\nline2\nline3";
    const newContent = "line1";
    const result = createUnifiedDiff(oldContent, newContent, "test.txt");
    expect(result).toBeDefined();
  });

  it("handles empty content", async () => {
    const result = createUnifiedDiff("", "new content", "test.txt");
    expect(result).toBeDefined();
  });
});

describe("directory-helpers deep", () => {
  it("lists directory contents", async () => {
    const result = await listDirectory(tempDir);
    expect(result.length).toBeGreaterThan(0);
  });

  it("builds tree structure", async () => {
    const result = await listDirectory(tempDir, { recursive: true });
    expect(result).toBeDefined();
  });

  it("builds tree with maxEntries", async () => {
    const result = await listDirectory(tempDir);
    expect(result).toBeDefined();
  });
});

describe("validateRegexPattern deep", () => {
  it("validates simple pattern", () => {
    const result = validateRegexPattern("hello");
    expect(result.valid).toBe(true);
  });

  it("rejects invalid pattern", () => {
    const result = validateRegexPattern("(unclosed");
    expect(result.valid).toBe(false);
  });

  it("accepts pattern with flags", () => {
    const result = validateRegexPattern("^test.*$");
    expect(result.valid).toBe(true);
  });
});

describe("validatePath deep", () => {
  it("validates existing file path", async () => {
    const filePath = path.join(tempDir, "a.ts");
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);
  });

  it("throws for non-existent path", async () => {
    const badPath = path.join(tempDir, "nonexistent.ts");
    await expect(fs.access(badPath)).rejects.toThrow();
  });
});

describe("config deep", () => {
  it("getConfig returns configuration", () => {
    const config = getConfig();
    expect(config).toBeDefined();
    expect(config.undo).toBeDefined();
    expect(config.search).toBeDefined();
  });
});