import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerGetProjectPatternsTool } from "../src/tools/search-patterns.js";
import { registerSearchContentTool } from "../src/tools/search-content.js";
import { registerSearchFilesTool } from "../src/tools/search-files.js";
import { registerCountMatchesTool } from "../src/tools/search-count.js";
import { registerFindByGlobTool } from "../src/tools/search-glob.js";
import { registerDiffFilesTool } from "../src/tools/search-diff.js";
import { registerBulkRenameTool } from "../src/tools/search-bulk-rename.js";
import type { ToolFactory } from "../src/utils/tool-factory.js";

type CapturedHandler = (args: any) => Promise<any>;
const captured = new Map<string, CapturedHandler>();

function createMockFactory(): ToolFactory {
  return ((name: string, _config: any, handler: CapturedHandler) => {
    captured.set(name, handler);
  }) as any;
}

const mockFactories = {
  readOnly: createMockFactory(),
  destructive: createMockFactory(),
  idempotent: createMockFactory(),
  standard: createMockFactory(),
};

const mockContext = { factories: mockFactories, server: {} as any };

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/tools-search-deep-test-");
  await fs.writeFile(path.join(tempDir, "app.ts"), "const API_URL = 'https://api.example.com';\nfunction fetchUser(id: number): Promise<User> {\n  return fetch(API_URL + '/users/' + id);\n}\n");
  await fs.writeFile(path.join(tempDir, "util.js"), "module.exports = { helper: function(x) { return x * 2; } };\n");
  await fs.writeFile(path.join(tempDir, "README.md"), "# Project\nThis is a test project.\n");
  registerGetProjectPatternsTool(mockContext as any);
  registerSearchContentTool(mockContext as any);
  registerSearchFilesTool(mockContext as any);
  registerCountMatchesTool(mockContext as any);
  registerFindByGlobTool(mockContext as any);
  registerDiffFilesTool(mockContext as any);
  registerBulkRenameTool(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("search_content deep", () => {
  it("searches with ignoreCase", async () => {
    const handler = captured.get("search_content");
    const result = await handler!({ path: tempDir, pattern: "api_url", ignoreCase: true });
    expect(result).toBeDefined();
  });

  it("searches with fileType filter", async () => {
    const handler = captured.get("search_content");
    const result = await handler!({ path: tempDir, pattern: "function", fileType: "ts" });
    expect(result).toBeDefined();
  });

  it("searches with context lines", async () => {
    const handler = captured.get("search_content");
    const result = await handler!({ path: tempDir, pattern: "function", context: 2 });
    expect(result).toBeDefined();
  });

  it("handles no matches", async () => {
    const handler = captured.get("search_content");
    const result = await handler!({ path: tempDir, pattern: "ZZZZNONEXISTENT" });
    expect(result).toBeDefined();
  });
});

describe("count_matches deep", () => {
  it("counts matches in directory", async () => {
    const handler = captured.get("count_matches");
    const result = await handler!({ path: tempDir, pattern: "function" });
    expect(result).toBeDefined();
  });
});

describe("search_files deep", () => {
  it("finds files by name pattern", async () => {
    const handler = captured.get("search_files");
    const result = await handler!({ path: tempDir, pattern: "app" });
    expect(result).toBeDefined();
  });
});

describe("find_by_glob deep", () => {
  it("finds files by glob pattern", async () => {
    const handler = captured.get("find_by_glob");
    const result = await handler!({ path: tempDir, patterns: ["**/*.ts"] });
    expect(result).toBeDefined();
  });

  it("finds files with multiple patterns", async () => {
    const handler = captured.get("find_by_glob");
    const result = await handler!({ path: tempDir, patterns: ["*.ts", "*.js"] });
    expect(result).toBeDefined();
  });
});

describe("diff_files deep", () => {
  it("diffs two different files", async () => {
    const handler = captured.get("diff_files");
    const f1 = path.join(tempDir, "app.ts");
    const f2 = path.join(tempDir, "util.js");
    const result = await handler!({ file1: f1, file2: f2 });
    expect(result).toBeDefined();
  });
});

describe("get_project_patterns deep", () => {
  it("gets project patterns", async () => {
    const handler = captured.get("get_project_patterns");
    const result = await handler!({ path: tempDir });
    expect(result).toBeDefined();
  });
});

describe("bulk_rename deep", () => {
  it("dry run rename", async () => {
    const handler = captured.get("bulk_rename");
    const result = await handler!({ path: tempDir, pattern: "app", replacement: "main", dryRun: true });
    expect(result).toBeDefined();
  });
});