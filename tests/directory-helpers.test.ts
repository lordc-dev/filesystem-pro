import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { buildTree, getFileStats, type TreeEntry } from "../src/tools/directory-helpers.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/dir-helpers-test-");
  await fs.writeFile(path.join(tempDir, "file1.txt"), "a");
  await fs.writeFile(path.join(tempDir, "file2.ts"), "b");
  await fs.mkdir(path.join(tempDir, "subdir"));
  await fs.writeFile(path.join(tempDir, "subdir", "nested.txt"), "c");
  await fs.mkdir(path.join(tempDir, "node_modules"));
  await fs.writeFile(path.join(tempDir, "node_modules", "pkg.js"), "d");
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("buildTree", () => {
  it("builds tree from directory", async () => {
    const tree = await buildTree(tempDir, {
      exclude: [],
      maxDepth: 5,
      maxEntries: 5000,
    });
    expect(tree.length).toBeGreaterThan(0);
    const dirs = tree.filter(e => e.type === "directory");
    const files = tree.filter(e => e.type === "file");
    expect(dirs.length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(0);
  });

  it("respects maxDepth", async () => {
    const tree = await buildTree(tempDir, {
      exclude: [],
      maxDepth: 0,
      maxEntries: 5000,
    });
    expect(tree.length).toBeGreaterThan(0);
    const dirWithEmptyChildren = tree.find(e => e.type === "directory" && e.children && e.children.length === 0);
    expect(dirWithEmptyChildren).toBeDefined();
  });

  it("excludes directories", async () => {
    const tree = await buildTree(tempDir, {
      exclude: ["node_modules"],
      maxDepth: 5,
      maxEntries: 5000,
    });
    const nmEntry = tree.find(e => e.name === "node_modules");
    expect(nmEntry).toBeUndefined();
  });

  it("respects maxEntries", async () => {
    const tree = await buildTree(tempDir, {
      exclude: [],
      maxDepth: 5,
      maxEntries: 2,
    });
    expect(tree.length).toBeLessThanOrEqual(3);
  });

  it("includes children for directories", async () => {
    const tree = await buildTree(tempDir, {
      exclude: [],
      maxDepth: 2,
      maxEntries: 5000,
    });
    const subdir = tree.find(e => e.name === "subdir" && e.type === "directory");
    if (subdir?.children) {
      expect(subdir.children.length).toBeGreaterThan(0);
    }
  });
});

describe("getFileStats", () => {
  it("returns file statistics", async () => {
    const filePath = path.join(tempDir, "file1.txt");
    const stats = await getFileStats(filePath);
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.isFile).toBe(true);
    expect(stats.isDirectory).toBe(false);
    expect(stats.permissions).toBeDefined();
    expect(stats.created).toBeDefined();
    expect(stats.modified).toBeDefined();
    expect(stats.accessed).toBeDefined();
  });
});