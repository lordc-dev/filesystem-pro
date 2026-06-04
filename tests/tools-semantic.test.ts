import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerFindSymbolTool } from "../src/tools/semantic-find-symbol.js";
import { registerGetSymbolsOverviewTool } from "../src/tools/semantic-get-symbols-overview.js";
import { registerFindSymbolReferencesTool } from "../src/tools/semantic-find-symbol-references.js";
import { registerFindUnusedSymbolsTool } from "../src/tools/semantic-find-unused-symbols.js";
import { registerFindStringLiteralsTool } from "../src/tools/semantic-find-string-literals.js";
import { registerFindDeprecatedUsagesTool } from "../src/tools/semantic-find-deprecated-usages.js";
import { registerFindImportsTool } from "../src/tools/analysis-find-imports.js";
import { registerFindDependentsTool } from "../src/tools/analysis-find-dependents.js";
import { registerFindRelatedTestsTool } from "../src/tools/analysis-find-related-tests.js";
import { registerFindUnusedImportsTool } from "../src/tools/analysis-find-unused-imports.js";
import { registerGetCallersTool } from "../src/tools/analysis-get-callers.js";
import { registerGetCalleesTool } from "../src/tools/analysis-get-callees.js";
import { registerGetFileStatsTool } from "../src/tools/analysis-get-file-stats.js";
import { registerGetFileSummaryTool } from "../src/tools/analysis-get-file-summary.js";
import { registerListAllowedDirectoriesTool } from "../src/tools/directory-allowed.js";
import { registerGetProjectPatternsTool } from "../src/tools/search-patterns.js";
import { registerEditingTools } from "../src/tools/editing-tools.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import type { ToolFactory } from "../src/utils/tool-factory.js";

type CapturedHandler = (args: any) => Promise<any>;
const capturedMap = new Map<string, CapturedHandler>();

function createMockFactory(): ToolFactory {
  return ((name: string, _config: any, handler: CapturedHandler) => {
    capturedMap.set(name, handler);
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
  tempDir = await fs.mkdtemp("/tmp/tools-semantic-test-");
  await treeSitterManager.initialize();
  registerFindSymbolTool(mockContext as any);
  registerGetSymbolsOverviewTool(mockContext as any);
  registerFindSymbolReferencesTool(mockContext as any);
  registerFindUnusedSymbolsTool(mockContext as any);
  registerFindStringLiteralsTool(mockContext as any);
  registerFindDeprecatedUsagesTool(mockContext as any);
  registerFindImportsTool(mockContext as any);
  registerFindDependentsTool(mockContext as any);
  registerFindRelatedTestsTool(mockContext as any);
  registerFindUnusedImportsTool(mockContext as any);
  registerGetCallersTool(mockContext as any);
  registerGetCalleesTool(mockContext as any);
  registerGetFileStatsTool(mockContext as any);
  registerGetFileSummaryTool(mockContext as any);
  registerListAllowedDirectoriesTool(mockContext as any);
  registerGetProjectPatternsTool(mockContext as any);
  registerEditingTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("semantic tool registration", () => {
  const expectedSemanticTools = [
    "find_symbol", "get_symbols_overview", "find_symbol_references",
    "find_unused_symbols", "find_string_literals", "find_deprecated_usages",
  ];
  for (const toolName of expectedSemanticTools) {
    it(`${toolName} is registered`, () => {
      expect(capturedMap.has(toolName)).toBe(true);
    });
  }
});

describe("analysis tool registration", () => {
  const expectedAnalysisTools = [
    "find_imports", "find_dependents", "find_related_tests", "find_unused_imports",
    "get_callers", "get_callees", "get_file_stats", "get_file_summary",
  ];
  for (const toolName of expectedAnalysisTools) {
    it(`${toolName} is registered`, () => {
      expect(capturedMap.has(toolName)).toBe(true);
    });
  }
});

describe("editing tool registration", () => {
  const expectedEditingTools = [
    "replace_symbol_body", "insert_before_symbol", "insert_after_symbol",
    "rename_symbol",
  ];
  for (const toolName of expectedEditingTools) {
    it(`${toolName} is registered`, () => {
      expect(capturedMap.has(toolName)).toBe(true);
    });
  }
});

describe("semantic tool execution", () => {
  it("find_symbol finds a symbol in TypeScript file", async () => {
    const handler = capturedMap.get("find_symbol");
    const filePath = path.join(tempDir, "find-sym-test.ts");
    await fs.writeFile(filePath, "function myFunc() { return 1; }\nclass MyClass { method() {} }\n");
    const result = await handler!({ path: filePath, pattern: "myFunc" });
    expect(result).toBeDefined();
    expect(result.isError).toBeFalsy();
  });

  it("get_symbols_overview gets overview", async () => {
    const handler = capturedMap.get("get_symbols_overview");
    const filePath = path.join(tempDir, "overview-test.ts");
    await fs.writeFile(filePath, "function foo() {}\nclass Bar {}\nconst x = 1;\n");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });
});

describe("analysis tool execution", () => {
  it("find_imports finds imports", async () => {
    const handler = capturedMap.get("find_imports");
    const filePath = path.join(tempDir, "imports-test.ts");
    await fs.writeFile(filePath, "import { foo } from 'bar';\nexport const x = 1;\n");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });

  it("get_file_stats gets stats", async () => {
    const handler = capturedMap.get("get_file_stats");
    const filePath = path.join(tempDir, "stats-src-test.ts");
    await fs.writeFile(filePath, "const x = 1;\nfunction foo() { return x; }\n");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });

  it("get_file_summary gets summary", async () => {
    const handler = capturedMap.get("get_file_summary");
    const filePath = path.join(tempDir, "summary-src-test.ts");
    await fs.writeFile(filePath, "export function test() { return 1; }\n");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });
});

describe("list_allowed_directories execution", () => {
  it("lists allowed directories", async () => {
    const handler = capturedMap.get("list_allowed_directories");
    const result = await handler!({});
    expect(result).toBeDefined();
  });
});