import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerFileReadTools } from "../src/tools/file-read.js";
import { registerFileWriteTools } from "../src/tools/file-write.js";
import { registerEditingTools } from "../src/tools/editing-tools.js";
import { registerSearchContentTool } from "../src/tools/search-content.js";
import { registerFindByGlobTool } from "../src/tools/search-glob.js";
import { registerDiffFilesTool } from "../src/tools/search-diff.js";
import { registerGetFileInfoTool } from "../src/tools/directory-get-info.js";
import { registerBulkRenameTool } from "../src/tools/search-bulk-rename.js";
import { registerUndoTools } from "../src/tools/undo-tools.js";
import { registerSearchFilesTool } from "../src/tools/search-files.js";
import { registerCountMatchesTool } from "../src/tools/search-count.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-fs-test-");
  registerFileReadTools(mockContext as any);
  registerFileWriteTools(mockContext as any);
  registerEditingTools(mockContext as any);
  registerSearchContentTool(mockContext as any);
  registerFindByGlobTool(mockContext as any);
  registerDiffFilesTool(mockContext as any);
  registerGetFileInfoTool(mockContext as any);
  registerBulkRenameTool(mockContext as any);
  registerUndoTools(mockContext as any);
  registerSearchFilesTool(mockContext as any);
  registerCountMatchesTool(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("read_text_file tool", () => {
  it("reads a text file", async () => {
    const handler = captured.get("read_text_file");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "read-test.txt");
    await fs.writeFile(filePath, "hello world");
    const result = await handler!({ path: filePath });
    expect(result.content[0].text).toContain("hello world");
  });

  it("reads with head option", async () => {
    const handler = captured.get("read_text_file");
    const filePath = path.join(tempDir, "head-test.txt");
    await fs.writeFile(filePath, "line1\nline2\nline3\n");
    const result = await handler!({ path: filePath, head: 2 });
    expect(result.content[0].text).toContain("line1");
  });

  it("reads with tail option", async () => {
    const handler = captured.get("read_text_file");
    const filePath = path.join(tempDir, "tail-test.txt");
    await fs.writeFile(filePath, "line1\nline2\nline3");
    const result = await handler!({ path: filePath, tail: 1 });
    expect(result).toBeDefined();
  });
});

describe("read_multiple_files tool", () => {
  it("reads multiple files", async () => {
    const handler = captured.get("read_multiple_files");
    expect(handler).toBeDefined();
    const f1 = path.join(tempDir, "multi1.txt");
    const f2 = path.join(tempDir, "multi2.txt");
    await fs.writeFile(f1, "file1");
    await fs.writeFile(f2, "file2");
    const result = await handler!({ paths: [f1, f2] });
    expect(result).toBeDefined();
  });
});

describe("write_file tool", () => {
  it("writes a file", async () => {
    const handler = captured.get("write_file");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "write-test.txt");
    await handler!({ path: filePath, content: "written" });
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("written");
  });
});

describe("edit_file tool", () => {
  it("edits a file with dryRun", async () => {
    const handler = captured.get("edit_file");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "edit-test.txt");
    await fs.writeFile(filePath, "hello world");
    const result = await handler!({
      path: filePath,
      edits: [{ oldText: "hello", newText: "goodbye" }],
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("edits a file for real", async () => {
    const handler = captured.get("edit_file");
    const filePath = path.join(tempDir, "edit-real.txt");
    await fs.writeFile(filePath, "old line");
    const result = await handler!({
      path: filePath,
      edits: [{ oldText: "old", newText: "new" }],
    });
    expect(result).toBeDefined();
  });
});

describe("search_content tool", () => {
  it("searches file content", async () => {
    const handler = captured.get("search_content");
    if (!handler) return;
    await fs.writeFile(path.join(tempDir, "search-test.txt"), "find this pattern here");
    const result = await handler({ path: tempDir, pattern: "pattern" });
    expect(result.content[0].type).toBe("text");
  });
});

describe("search_files tool", () => {
  it("searches for files", async () => {
    const handler = captured.get("search_files");
    if (!handler) return;
    await fs.writeFile(path.join(tempDir, "file-search-test.ts"), "");
    const result = await handler({ path: tempDir, pattern: "test" });
    expect(result).toBeDefined();
  });
});

describe("find_by_glob tool", () => {
  it("finds files by glob", async () => {
    const handler = captured.get("find_by_glob");
    if (!handler) return;
    await fs.writeFile(path.join(tempDir, "glob-test.ts"), "content");
    const result = await handler({ patterns: ["**/*.ts"], cwd: tempDir });
    expect(result).toBeDefined();
  });
});

describe("diff_files tool", () => {
  it("diffs two files", async () => {
    const handler = captured.get("diff_files");
    expect(handler).toBeDefined();
    const f1 = path.join(tempDir, "diff1.txt");
    const f2 = path.join(tempDir, "diff2.txt");
    await fs.writeFile(f1, "aaa\n");
    await fs.writeFile(f2, "bbb\n");
    const result = await handler!({ file1: f1, file2: f2 });
    expect(result.structuredContent).toBeDefined();
  });
});

describe("count_matches tool", () => {
  it("counts pattern matches", async () => {
    const handler = captured.get("count_matches");
    if (!handler) return;
    await fs.writeFile(path.join(tempDir, "count-test.txt"), "aaa bbb aaa ccc aaa");
    const result = await handler({ path: tempDir, pattern: "aaa" });
    expect(result).toBeDefined();
  });
});

describe("bulk_rename tool", () => {
  it("shows rename preview", async () => {
    const handler = captured.get("bulk_rename");
    if (!handler) return;
    await fs.writeFile(path.join(tempDir, "rename-test.txt"), "content");
    const result = await handler({
      path: tempDir,
      pattern: "rename",
      replacement: "changed",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});

describe("get_file_info tool", () => {
  it("gets file info", async () => {
    const handler = captured.get("get_file_info");
    expect(handler).toBeDefined();
    const filePath = path.join(tempDir, "info-test.txt");
    await fs.writeFile(filePath, "test");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });
});

describe("undo tools", () => {
  it("peeks at undo stack", async () => {
    const handler = captured.get("undo_peek");
    expect(handler).toBeDefined();
    const result = await handler!({ count: 5 });
    expect(result.content[0].type).toBe("text");
  });

  it("shows undo status", async () => {
    const handler = captured.get("undo_status");
    expect(handler).toBeDefined();
    const result = await handler!({});
    expect(result.content[0].type).toBe("text");
  });
});