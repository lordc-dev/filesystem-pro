import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { searchFiles, searchContent } from "../src/search/ripgrep-search.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/ripgrep-search-test-");
  await fs.writeFile(path.join(tempDir, "hello.ts"), "const greeting = 'hello world';\nconsole.log(greeting);\n");
  await fs.writeFile(path.join(tempDir, "foo.js"), "function foo() { return 42; }\n");
  await fs.writeFile(path.join(tempDir, "bar.py"), "def bar():\n    return 'bar'\n");
  await fs.mkdir(path.join(tempDir, "nested"));
  await fs.writeFile(path.join(tempDir, "nested", "deep.txt"), "deep content here\n");
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("searchFiles", () => {
  it("finds files by partial name", async () => {
    const results = await searchFiles(tempDir, "hello");
    expect(results.some(r => r.includes("hello"))).toBe(true);
  });

  it("finds files with glob pattern", async () => {
    const results = await searchFiles(tempDir, "*.ts");
    expect(results.some(r => r.endsWith(".ts"))).toBe(true);
  });

  it("finds all files with wildcard", async () => {
    const results = await searchFiles(tempDir, "*");
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("searchContent", () => {
  it("searches for text in files", async () => {
    const results = await searchContent(tempDir, "hello", { ignoreCase: true });
    expect(results.length).toBeGreaterThan(0);
  });

  it("searches with file type filter", async () => {
    const results = await searchContent(tempDir, "function", { fileType: "js" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty for no matches", async () => {
    const results = await searchContent(tempDir, "zzzznonexistent");
    expect(results.length).toBe(0);
  });

  it("rejects invalid regex pattern", async () => {
    await expect(searchContent(tempDir, "(unclosed")).rejects.toThrow();
  });
});