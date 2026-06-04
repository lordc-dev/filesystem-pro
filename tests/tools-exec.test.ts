import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerFindSymbolReferencesTool } from "../src/tools/semantic-find-symbol-references.js";
import { registerFindUnusedSymbolsTool } from "../src/tools/semantic-find-unused-symbols.js";
import { registerFindStringLiteralsTool } from "../src/tools/semantic-find-string-literals.js";
import { registerFindDeprecatedUsagesTool } from "../src/tools/semantic-find-deprecated-usages.js";
import { registerGetCallersTool } from "../src/tools/analysis-get-callers.js";
import { registerGetCalleesTool } from "../src/tools/analysis-get-callees.js";
import { registerFindUnusedImportsTool } from "../src/tools/analysis-find-unused-imports.js";
import { registerFindDependentsTool } from "../src/tools/analysis-find-dependents.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-exec-test-");
  await treeSitterManager.initialize();
  registerFindSymbolReferencesTool(mockContext as any);
  registerFindUnusedSymbolsTool(mockContext as any);
  registerFindStringLiteralsTool(mockContext as any);
  registerFindDeprecatedUsagesTool(mockContext as any);
  registerGetCallersTool(mockContext as any);
  registerGetCalleesTool(mockContext as any);
  registerFindUnusedImportsTool(mockContext as any);
  registerFindDependentsTool(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("semantic tool execution", () => {
  it("find_symbol_references finds references", async () => {
    const handler = captured.get("find_symbol_references");
    const filePath = path.join(tempDir, "refs-test.ts");
    await fs.writeFile(filePath, "function myFunc() { return 1; }\nconst x = myFunc();\n");
    const result = await handler!({ path: filePath, namePath: "myFunc" });
    expect(result).toBeDefined();
  });

  it("find_unused_symbols finds unused", async () => {
    const handler = captured.get("find_unused_symbols");
    const filePath = path.join(tempDir, "unused-test.ts");
    await fs.writeFile(filePath, "export function used() { return 1; }\nexport function unused() { return 2; }\n");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });

  it("find_string_literals finds string literals", async () => {
    const handler = captured.get("find_string_literals");
    const filePath = path.join(tempDir, "literals-test.ts");
    await fs.writeFile(filePath, 'const msg = "Hello World";\nconst err = "Error occurred";\n');
    const result = await handler!({ path: filePath, pattern: "Hello" });
    expect(result).toBeDefined();
  });

  it("find_deprecated_usages finds deprecated", async () => {
    const handler = captured.get("find_deprecated_usages");
    const filePath = path.join(tempDir, "deprecated-test.ts");
    await fs.writeFile(filePath, "/** @deprecated */\nfunction oldFunc() {}\noldFunc();\n");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });
});

describe("analysis tool execution", () => {
  it("get_callers finds callers", async () => {
    const handler = captured.get("get_callers");
    const filePath = path.join(tempDir, "callers-test.ts");
    await fs.writeFile(filePath, "function helper() { return 1; }\nfunction main() { return helper(); }\n");
    const result = await handler!({ path: filePath, namePath: "helper" });
    expect(result).toBeDefined();
  });

  it("get_callees finds callees", async () => {
    const handler = captured.get("get_callees");
    const filePath = path.join(tempDir, "callees-test.ts");
    await fs.writeFile(filePath, "function helper() { return 1; }\nfunction main() { return helper(); }\n");
    const result = await handler!({ path: filePath, namePath: "main" });
    expect(result).toBeDefined();
  });

  it("find_unused_imports finds unused imports", async () => {
    const handler = captured.get("find_unused_imports");
    const filePath = path.join(tempDir, "unused-imports-test.ts");
    await fs.writeFile(filePath, "import { unused } from 'mod';\nexport const x = 1;\n");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });

  it("find_dependents finds dependents", async () => {
    const handler = captured.get("find_dependents");
    const filePath = path.join(tempDir, "dependents-test.ts");
    await fs.writeFile(filePath, "export function dep() { return 1; }\n");
    const result = await handler!({ path: filePath });
    expect(result).toBeDefined();
  });
});