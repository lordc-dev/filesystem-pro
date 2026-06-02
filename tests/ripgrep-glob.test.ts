import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { globSearch, listDirectoryWithRipgrep } from "../src/search/ripgrep-glob.js";
import { createTempTestDir, writeTestFiles, cleanupTempDir } from "./test-helpers.js";
import { isRipgrepAvailable } from "../src/search/ripgrep-executor.js";

describe.skipIf(!(await isRipgrepAvailable()))("ripgrep-glob", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await createTempTestDir("glob-");
    await writeTestFiles(tempDir, {
      "src/foo.ts": "export const foo = 1;",
      "src/bar.ts": "export const bar = 2;",
      "src/sub/baz.ts": "export const baz = 3;",
      "README.md": "# Test",
      "node_modules/dep/index.js": "module.exports = {}",
    });
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("globSearch", () => {
    it("finds files by glob pattern", async () => {
      const results = await globSearch("*.ts", { cwd: tempDir, deep: 5, skipValidation: true });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("finds files recursively with deep option", async () => {
      const shallow = await globSearch("*.ts", { cwd: tempDir, deep: 1, skipValidation: true });
      const deep = await globSearch("*.ts", { cwd: tempDir, deep: 5, skipValidation: true });
      expect(deep.length).toBeGreaterThanOrEqual(shallow.length);
    });

    it("excludes default ignore patterns", async () => {
      const results = await globSearch("*.js", { cwd: tempDir, skipValidation: true });
      const hasNodeModules = results.some(r => r.includes("node_modules"));
      expect(hasNodeModules).toBe(false);
    });

    it("parses JSON array patterns", async () => {
      const results = await globSearch('["*.ts"]', { cwd: tempDir, deep: 5, skipValidation: true });
      expect(results.some(r => r.endsWith(".ts"))).toBe(true);
    });

    it("returns absolute paths by default", async () => {
      const results = await globSearch("*.ts", { cwd: tempDir, deep: 5, skipValidation: true });
      for (const r of results) {
        expect(r.startsWith("/")).toBe(true);
      }
    });
  });

  describe("listDirectoryWithRipgrep", () => {
    it("lists directory contents", async () => {
      const results = await listDirectoryWithRipgrep(tempDir);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("non-recursive lists only direct children", async () => {
      const results = await listDirectoryWithRipgrep(tempDir, { recursive: false });
      for (const r of results) {
        const relative = r.replace(tempDir, "").split("/").filter(Boolean);
        expect(relative.length).toBeLessThanOrEqual(1);
      }
    });
  });
});