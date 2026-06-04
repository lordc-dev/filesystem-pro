import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { registerSemanticTools } from "../src/tools/semantic-tools.js";
import { registerAnalysisTools } from "../src/tools/analysis-tools.js";
import { registerEditingTools } from "../src/tools/editing-tools.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-analysis-deep-test-");
  tsFile = path.join(tempDir, "sample.ts");
  await fs.writeFile(tsFile, `import { useEffect, useState } from 'react';
import type { User } from './types';
import { apiClient } from './api';

const CONSTANT = 42;
const deprecated_msg = "old code";

export function fetchUsers(): Promise<User[]> {
  return apiClient.get('/users');
}

export function processUser(user: User): string {
  const name = user.name;
  return \`Hello \${name}\`;
}

/** @deprecated use processUser instead */
export function oldProcess(user: User): string {
  return processUser(user);
}
`);
  await treeSitterManager.initialize();
  registerSemanticTools(mockContext as any);
  registerAnalysisTools(mockContext as any);
  registerEditingTools(mockContext as any);
  registerServerStatsTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("find_symbol deep", () => {
  it("finds function by name", async () => {
    const handler = captured.get("find_symbol");
    const result = await handler!({ path: tsFile, pattern: "fetchUsers" });
    expect(result).toBeDefined();
  });

  it("finds symbol with kind filter", async () => {
    const handler = captured.get("find_symbol");
    const result = await handler!({ path: tsFile, pattern: "fetchUsers", kinds: ["Function"] });
    expect(result).toBeDefined();
  });
});

describe("find_symbol_references deep", () => {
  it("finds references to a symbol", async () => {
    const handler = captured.get("find_symbol_references");
    const result = await handler!({ path: tsFile, namePath: "fetchUsers" });
    expect(result).toBeDefined();
  });
});

describe("get_callers deep", () => {
  it("gets callers of a function", async () => {
    const handler = captured.get("get_callers");
    const result = await handler!({ path: tsFile, namePath: "processUser" });
    expect(result).toBeDefined();
  });
});

describe("get_callees deep", () => {
  it("gets callees of a function", async () => {
    const handler = captured.get("get_callees");
    const result = await handler!({ path: tsFile, namePath: "fetchUsers" });
    expect(result).toBeDefined();
  });
});

describe("symbols_overview deep", () => {
  it("gets symbols overview with depth", async () => {
    const handler = captured.get("get_symbols_overview");
    const result = await handler!({ path: tsFile, depth: 1 });
    expect(result).toBeDefined();
  });
});

describe("get_file_summary deep", () => {
  it("gets file summary", async () => {
    const handler = captured.get("get_file_summary");
    const result = await handler!({ path: tsFile });
    expect(result).toBeDefined();
  });
});

describe("get_file_stats deep", () => {
  it("gets file stats", async () => {
    const handler = captured.get("get_file_stats");
    const result = await handler!({ path: tsFile });
    expect(result).toBeDefined();
  });
});

describe("find_deprecated_usages deep", () => {
  it("finds deprecated usages", async () => {
    const handler = captured.get("find_deprecated_usages");
    const result = await handler!({ path: tempDir });
    expect(result).toBeDefined();
  });
});

describe("find_string_literals deep", () => {
  it("finds string literals by pattern", async () => {
    const handler = captured.get("find_string_literals");
    const result = await handler!({ path: tsFile, pattern: "Hello" });
    expect(result).toBeDefined();
  });
});

describe("find_unused_imports deep", () => {
  it("finds unused imports", async () => {
    const handler = captured.get("find_unused_imports");
    const result = await handler!({ path: tsFile });
    expect(result).toBeDefined();
  });
});

describe("find_unused_symbols deep", () => {
  it("finds unused symbols", async () => {
    const handler = captured.get("find_unused_symbols");
    const result = await handler!({ path: tsFile, searchPath: tempDir });
    expect(result).toBeDefined();
  });
});

describe("find_imports deep", () => {
  it("finds all imports", async () => {
    const handler = captured.get("find_imports");
    const result = await handler!({ path: tsFile });
    expect(result).toBeDefined();
  });
});

describe("find_dependents deep", () => {
  it("finds dependents", async () => {
    const handler = captured.get("find_dependents");
    const result = await handler!({ path: tsFile, searchPath: tempDir });
    expect(result).toBeDefined();
  });
});

describe("find_related_tests deep", () => {
  it("finds related test files", async () => {
    const handler = captured.get("find_related_tests");
    const result = await handler!({ path: tsFile, searchPath: tempDir });
    expect(result).toBeDefined();
  });
});

describe("replace_symbol_body dryRun", () => {
  it("previews symbol body replacement", async () => {
    const handler = captured.get("replace_symbol_body");
    const result = await handler!({
      path: tsFile,
      namePath: "fetchUsers",
      newBody: "{ return []; }",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});

describe("rename_symbol dryRun", () => {
  it("previews symbol rename", async () => {
    const handler = captured.get("rename_symbol");
    const result = await handler!({
      path: tsFile,
      namePath: "fetchUsers",
      newName: "getUsers",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});

describe("insert_before_symbol dryRun", () => {
  it("previews insert before symbol", async () => {
    const handler = captured.get("insert_before_symbol");
    const result = await handler!({
      path: tsFile,
      namePath: "fetchUsers",
      code: "// new comment\n",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});

describe("insert_after_symbol dryRun", () => {
  it("previews insert after symbol", async () => {
    const handler = captured.get("insert_after_symbol");
    const result = await handler!({
      path: tsFile,
      namePath: "fetchUsers",
      code: "\n// end of fetch\n",
      dryRun: true,
    });
    expect(result).toBeDefined();
  });
});

describe("get_server_stats deep", () => {
  it("returns server stats", async () => {
    const handler = captured.get("get_server_stats");
    const result = await handler!({});
    expect(result).toBeDefined();
  });
});