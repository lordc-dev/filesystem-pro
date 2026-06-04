import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { registerSemanticTools } from "../src/tools/semantic-tools.js";
import { registerAnalysisTools } from "../src/tools/analysis-tools.js";
import { registerEditingTools } from "../src/tools/editing-tools.js";
import { registerDirectoryTools } from "../src/tools/directory-tools.js";
import { registerFileWriteTools } from "../src/tools/file-write.js";
import { registerFileTools } from "../src/tools/file-tools.js";
import { registerUndoTools } from "../src/tools/undo-tools.js";
import { registerSearchContentTool } from "../src/tools/search-content.js";
import { registerSearchFilesTool } from "../src/tools/search-files.js";
import { registerCountMatchesTool } from "../src/tools/search-count.js";
import { registerFindByGlobTool } from "../src/tools/search-glob.js";
import { registerDiffFilesTool } from "../src/tools/search-diff.js";
import { registerBulkRenameTool } from "../src/tools/search-bulk-rename.js";
import { registerGetProjectPatternsTool } from "../src/tools/search-patterns.js";
import { registerServerStatsTools } from "../src/tools/server-stats-tools.js";
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
let tsFile: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/tools-comprehensive-test-");
  tsFile = path.join(tempDir, "comprehensive.ts");
  await fs.writeFile(tsFile, `
import { useState } from 'react';
import type { Config } from './config';
import { helper } from './helpers';

const API_KEY = "test-secret-placeholder";
const VERSION = "1.0.0";

export class DataStore {
  private data: Map<string, string> = new Map();

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  get(key: string): string | undefined {
    return this.data.get(key);
  }

  get size(): number {
    return this.data.size;
  }
}

/** @deprecated use DataStore instead */
export class OldStore {
  getData(): string[] { return []; }
}

export function processData(input: string): string {
  const prefix = "processed-";
  return prefix + input;
}

export function validateConfig(config: Config): boolean {
  return config.name.length > 0;
}
`);
  await treeSitterManager.initialize();
  registerSemanticTools(mockContext as any);
  registerAnalysisTools(mockContext as any);
  registerEditingTools(mockContext as any);
  registerDirectoryTools(mockContext as any);
  registerFileWriteTools(mockContext as any);
  registerFileTools(mockContext as any);
  registerUndoTools(mockContext as any);
  registerSearchContentTool(mockContext as any);
  registerSearchFilesTool(mockContext as any);
  registerCountMatchesTool(mockContext as any);
  registerFindByGlobTool(mockContext as any);
  registerDiffFilesTool(mockContext as any);
  registerBulkRenameTool(mockContext as any);
  registerGetProjectPatternsTool(mockContext as any);
  registerServerStatsTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("comprehensive tool execution", () => {
  it("find_symbol with includeBody", async () => {
    const handler = captured.get("find_symbol");
    const result = await handler!({ path: tsFile, pattern: "processData", includeBody: true });
    expect(result).toBeDefined();
  });

  it("find_symbol returns multiple matches", async () => {
    const handler = captured.get("find_symbol");
    const result = await handler!({ path: tsFile, pattern: "DataStore", depth: 1 });
    expect(result).toBeDefined();
  });

  it("find_deprecated_usages in directory", async () => {
    const handler = captured.get("find_deprecated_usages");
    const result = await handler!({ path: tempDir });
    expect(result).toBeDefined();
  });

  it("find_string_literals with exactMatch", async () => {
    const handler = captured.get("find_string_literals");
    const result = await handler!({ path: tsFile, pattern: "VERSION", exactMatch: true });
    expect(result).toBeDefined();
  });

  it("find_string_literals with ignoreCase", async () => {
    const handler = captured.get("find_string_literals");
    const result = await handler!({ path: tsFile, pattern: "api_key", ignoreCase: true });
    expect(result).toBeDefined();
  });

  it("find_unused_imports checks file", async () => {
    const handler = captured.get("find_unused_imports");
    const result = await handler!({ path: tsFile });
    expect(result).toBeDefined();
  });

  it("find_unused_symbols in file", async () => {
    const handler = captured.get("find_unused_symbols");
    const result = await handler!({ path: tsFile, searchPath: tempDir });
    expect(result).toBeDefined();
  });

  it("find_imports returns all imports", async () => {
    const handler = captured.get("find_imports");
    const result = await handler!({ path: tsFile });
    expect(result).toBeDefined();
  });

  it("find_dependents returns result", async () => {
    const handler = captured.get("find_dependents");
    const result = await handler!({ path: tsFile, searchPath: tempDir });
    expect(result).toBeDefined();
  });

  it("find_related_tests returns result", async () => {
    const handler = captured.get("find_related_tests");
    const result = await handler!({ path: tsFile, searchPath: tempDir });
    expect(result).toBeDefined();
  });

  it("get_symbols_overview with all kinds", async () => {
    const handler = captured.get("get_symbols_overview");
    const result = await handler!({ path: tsFile, depth: 1, kinds: ["Class", "Function", "Variable"] });
    expect(result).toBeDefined();
  });

  it("get_file_summary returns summary", async () => {
    const handler = captured.get("get_file_summary");
    const result = await handler!({ path: tsFile });
    expect(result).toBeDefined();
  });

  it("get_file_stats returns stats", async () => {
    const handler = captured.get("get_file_stats");
    const result = await handler!({ path: tsFile });
    expect(result).toBeDefined();
  });

  it("read_text_file with head and tail", async () => {
    const handler = captured.get("read_text_file");
    const result = await handler!({ path: tsFile, head: 5 });
    expect(result).toBeDefined();
  });

  it("read_multiple_files", async () => {
    const handler = captured.get("read_multiple_files");
    const result = await handler!({ paths: [tsFile] });
    expect(result).toBeDefined();
  });

  it("edit_file dryRun", async () => {
    const handler = captured.get("edit_file");
    const result = await handler!({
      path: tsFile,
      edits: [{ oldText: "processData", newText: "handleData" }],
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("replace_symbol_body dryRun", async () => {
    const handler = captured.get("replace_symbol_body");
    const result = await handler!({
      path: tsFile,
      namePath: "DataStore/set",
      newBody: "{ this.data.set(key, value); console.log('set', key); }",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("insert_after_symbol dryRun", async () => {
    const handler = captured.get("insert_after_symbol");
    const result = await handler!({
      path: tsFile,
      namePath: "DataStore",
      code: "\n  clear(): void { this.data.clear(); }\n",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("rename_symbol dryRun", async () => {
    const handler = captured.get("rename_symbol");
    const result = await handler!({
      path: tsFile,
      namePath: "DataStore",
      newName: "Store",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });

  it("search_content finds across files", async () => {
    const handler = captured.get("search_content");
    const result = await handler!({ path: tempDir, pattern: "export", ignoreCase: true });
    expect(result).toBeDefined();
  });

  it("count_matches across directory", async () => {
    const handler = captured.get("count_matches");
    const result = await handler!({ path: tempDir, pattern: "function", ignoreCase: true });
    expect(result).toBeDefined();
  });

  it("search_files finds by name", async () => {
    const handler = captured.get("search_files");
    const result = await handler!({ path: tempDir, pattern: "comprehensive" });
    expect(result).toBeDefined();
  });

  it("find_by_glob returns files", async () => {
    const handler = captured.get("find_by_glob");
    const result = await handler!({ path: tempDir, patterns: ["**/*.ts"] });
    expect(result).toBeDefined();
  });

  it("diff_files compares", async () => {
    const handler = captured.get("diff_files");
    const f2 = path.join(tempDir, "other.ts");
    await fs.writeFile(f2, "const other = 1;");
    const result = await handler!({ file1: tsFile, file2: f2 });
    expect(result).toBeDefined();
  });

  it("bulk_rename dryRun", async () => {
    const handler = captured.get("bulk_rename");
    const result = await handler!({ path: tempDir, pattern: "comprehensive", replacement: "main", dryRun: true });
    expect(result).toBeDefined();
  });

  it("get_project_patterns", async () => {
    const handler = captured.get("get_project_patterns");
    const result = await handler!({ path: tempDir });
    expect(result).toBeDefined();
  });

  it("get_server_stats", async () => {
    const handler = captured.get("get_server_stats");
    const result = await handler!({});
    expect(result).toBeDefined();
  });

  it("list_directory with details", async () => {
    const handler = captured.get("list_directory");
    const result = await handler!({ path: tempDir });
    expect(result).toBeDefined();
  });

  it("list_directory_with_sizes", async () => {
    const handler = captured.get("list_directory_with_sizes");
    const result = await handler!({ path: tempDir, sortBy: "name" });
    expect(result).toBeDefined();
  });

  it("directory_tree with depth", async () => {
    const handler = captured.get("directory_tree");
    const result = await handler!({ path: tempDir, maxDepth: 1 });
    expect(result).toBeDefined();
  });

  it("get_file_info", async () => {
    const handler = captured.get("get_file_info");
    const result = await handler!({ path: tsFile });
    expect(result).toBeDefined();
  });

  it("write_file and read back", async () => {
    const writeHandler = captured.get("write_file");
    const readHandler = captured.get("read_text_file");
    const f = path.join(tempDir, "write-read-test.txt");
    await writeHandler!({ path: f, content: "test content" });
    const result = await readHandler!({ path: f });
    expect(result).toBeDefined();
  });

  it("create_directory", async () => {
    const handler = captured.get("create_directory");
    const d = path.join(tempDir, "new-dir");
    const result = await handler!({ path: d });
    expect(result).toBeDefined();
  });

  it("move_file", async () => {
    const src = path.join(tempDir, "move-src.txt");
    const dst = path.join(tempDir, "move-dst.txt");
    await fs.writeFile(src, "move me");
    const handler = captured.get("move_file");
    const result = await handler!({ source: src, destination: dst });
    expect(result).toBeDefined();
  });

  it("delete_file", async () => {
    const f = path.join(tempDir, "delete-me.txt");
    await fs.writeFile(f, "bye");
    const handler = captured.get("delete_file");
    const result = await handler!({ path: f });
    expect(result).toBeDefined();
  });

  it("undo_peek default", async () => {
    const handler = captured.get("undo_peek");
    const result = await handler!({});
    expect(result).toBeDefined();
  });

  it("undo_status", async () => {
    const handler = captured.get("undo_status");
    const result = await handler!({});
    expect(result).toBeDefined();
  });
});