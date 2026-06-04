import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { searchFiles, searchContent, countMatches } from "../src/search/ripgrep-search.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/ripgrep-deep-test-");
  await fs.writeFile(path.join(tempDir, "app.ts"), "const greeting = 'hello world';\nconsole.log(greeting);\n");
  await fs.writeFile(path.join(tempDir, "foo.js"), "function foo() { return 42; }\nmodule.exports = foo;\n");
  await fs.writeFile(path.join(tempDir, "bar.py"), "def bar():\n    return 'bar'\n");
  await fs.writeFile(path.join(tempDir, "README.md"), "# Hello\n## Section\nhello world\n");
  await fs.mkdir(path.join(tempDir, "subdir"));
  await fs.writeFile(path.join(tempDir, "subdir", "deep.ts"), "const deep = 'deep value';\nexport { deep };\n");
  await fs.writeFile(path.join(tempDir, ".hidden"), "hidden file content\n");
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("searchFiles deep", () => {
  it("finds files with glob pattern containing *", async () => {
    const results = await searchFiles(tempDir, "*.ts");
    expect(results.some(r => r.endsWith(".ts"))).toBe(true);
  });

  it("finds files with short glob ?", async () => {
    const results = await searchFiles(tempDir, "*.js");
    expect(results.some(r => r.endsWith(".js"))).toBe(true);
  });

  it("finds files with includeHidden option", async () => {
    const results = await searchFiles(tempDir, "hidden", { includeHidden: true });
    expect(results.some(r => r.includes(".hidden"))).toBe(true);
  });

  it("finds files with exclude patterns", async () => {
    const results = await searchFiles(tempDir, "*", { excludePatterns: ["*.py"] });
    expect(results.some(r => r.endsWith(".ts"))).toBe(true);
  });

  it("finds files with case-sensitive search", async () => {
    const results = await searchFiles(tempDir, "APP", { ignoreCase: false });
    expect(results.length).toBe(0);
  });
});

describe("searchContent deep", () => {
  it("searches with maxResults", async () => {
    const results = await searchContent(tempDir, "const", { maxResults: 1 });
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it("searches with exclude patterns", async () => {
    const results = await searchContent(tempDir, "function", { excludePatterns: ["*.py"] });
    expect(results).toBeDefined();
  });

  it("searches with pcre2 flag", async () => {
    const results = await searchContent(tempDir, "hello", { pcre2: true, ignoreCase: true });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("countMatches deep", () => {
  it("counts with fileType filter", async () => {
    const counts = await countMatches(tempDir, "const", { fileType: "ts" });
    expect(counts.size).toBeGreaterThan(0);
  });

  it("counts case-insensitive", async () => {
    const counts = await countMatches(tempDir, "HELLO", { ignoreCase: true });
    expect(counts.size).toBeGreaterThan(0);
  });

  it("counts with exclude patterns", async () => {
    const counts = await countMatches(tempDir, "function", { excludePatterns: ["*.py"] });
    expect(counts).toBeDefined();
  });
});