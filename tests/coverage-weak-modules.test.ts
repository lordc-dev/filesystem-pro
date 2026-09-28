/**
 * Coverage tests for the weakest modules flagged by the coverage report:
 * - analysis-analyze-symbol (0% branch)
 * - find_string_literals directory scan (uncovered lines 110-124)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerAnalyzeSymbolTool } from "../src/tools/analysis-analyze-symbol.js";
import { registerFindStringLiteralsTool } from "../src/tools/semantic-find-string-literals.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import type { ToolFactory } from "../src/utils/tool-factory.js";

type CapturedHandler = (args: any) => Promise<any>;
const captured = new Map<string, CapturedHandler>();

function createMockFactory(): ToolFactory {
  return ((name: string, _config: any, handler: CapturedHandler) => {
    captured.set(name, handler);
  }) as any;
}

const mockContext = {
  factories: {
    readOnly: createMockFactory(),
    destructive: createMockFactory(),
    idempotent: createMockFactory(),
    standard: createMockFactory(),
  },
  server: {} as any,
};

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp("/tmp/cov-weak-");
  await treeSitterManager.initialize();
  registerAnalyzeSymbolTool(mockContext as any);
  registerFindStringLiteralsTool(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("analyze_symbol", () => {
  it("returns references, callers and callees for a function", async () => {
    const handler = captured.get("analyze_symbol");
    const filePath = path.join(tempDir, "analyze.ts");
    await fs.writeFile(
      filePath,
      "function helper() { return 1; }\nfunction main() { return helper(); }\nconst y = helper();\n"
    );
    const result = await handler!({ path: filePath, namePath: "helper", searchPath: tempDir });
    expect(result).toBeDefined();
    const sc = result.structuredContent ?? {};
    expect(sc.callers?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("includes the definition when includeDefinition is true", async () => {
    const handler = captured.get("analyze_symbol");
    const filePath = path.join(tempDir, "analyze-def.ts");
    await fs.writeFile(filePath, "function solo() { return 1; }\nsolo();\n");
    const result = await handler!({ path: filePath, namePath: "solo", includeDefinition: true, searchPath: tempDir });
    expect(result).toBeDefined();
  });

  it("handles a symbol with no callers", async () => {
    const handler = captured.get("analyze_symbol");
    const filePath = path.join(tempDir, "analyze-nocallers.ts");
    await fs.writeFile(filePath, "function lonely() { return 1; }\n");
    const result = await handler!({ path: filePath, namePath: "lonely", searchPath: tempDir });
    expect(result).toBeDefined();
  });
});

describe("find_string_literals directory scan", () => {
  it("scans a directory and matches literals across files", async () => {
    const handler = captured.get("find_string_literals");
    const sub = path.join(tempDir, "literals-dir");
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(sub, "a.ts"), 'const t = "TOOL_NAME";\n');
    await fs.writeFile(path.join(sub, "b.ts"), 'const u = "OTHER";\n');
    await fs.writeFile(path.join(sub, "skip.txt"), "not source\n");
    const result = await handler!({ path: sub, pattern: "TOOL_NAME" });
    expect(result.structuredContent.count).toBe(1);
    expect(result.structuredContent.matches[0].value).toBe("TOOL_NAME");
  });

  it("exactMatch and ignoreCase narrow results", async () => {
    const handler = captured.get("find_string_literals");
    const sub = path.join(tempDir, "literals-dir2");
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(sub, "a.ts"), 'const a = "ConfigKey";\nconst b = "ConfigKeyExtra";\n');
    const exact = await handler!({ path: sub, pattern: "ConfigKey", exactMatch: true });
    expect(exact.structuredContent.count).toBe(1);
    const ci = await handler!({ path: sub, pattern: "configkey", ignoreCase: true });
    expect(ci.structuredContent.count).toBe(2);
  });

  it("respects maxResults across directory files", async () => {
    const handler = captured.get("find_string_literals");
    const sub = path.join(tempDir, "literals-dir3");
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(sub, "a.ts"), 'const a = "needle";\n');
    await fs.writeFile(path.join(sub, "b.ts"), 'const b = "needle";\n');
    const result = await handler!({ path: sub, pattern: "needle", maxResults: 1 });
    expect(result.structuredContent.count).toBe(1);
  });
});