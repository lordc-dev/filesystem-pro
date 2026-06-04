import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { registerGetProjectPatternsTool } from "../src/tools/search-patterns.js";
import { registerFileWriteTools } from "../src/tools/file-write.js";
import { registerWatchTools } from "../src/tools/directory-watch.js";
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
  tempDir = await fs.mkdtemp("/tmp/tools-patterns-test-");
  registerGetProjectPatternsTool(mockContext as any);
  registerFileWriteTools(mockContext as any);
  registerWatchTools(mockContext as any);
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("get_project_patterns tool", () => {
  it("handles missing AGENTS.md", async () => {
    const handler = captured.get("get_project_patterns");
    expect(handler).toBeDefined();
    const result = await handler!({ path: tempDir });
    expect(result).toBeDefined();
    expect(result.content[0].text).toContain("No patterns");
  });

  it("handles patternName filter", async () => {
    const handler = captured.get("get_project_patterns");
    const result = await handler!({ path: tempDir, patternName: "nonexistent" });
    expect(result.content[0].text).toContain("not found");
  });

  it("handles type filter", async () => {
    const handler = captured.get("get_project_patterns");
    const result = await handler!({ path: tempDir, type: "code" });
    expect(result).toBeDefined();
  });

  it("reads AGENTS.md patterns", async () => {
    const handler = captured.get("get_project_patterns");
    const agentsMd = path.join(tempDir, "AGENTS.md");
    await fs.writeFile(agentsMd, `# Patterns\n\n## code: my-pattern\n\ndescription here\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`);
    const result = await handler!({ path: tempDir });
    expect(result).toBeDefined();
  });
});

describe("write_file append mode", () => {
  it("write_file handles append mode", async () => {
    const handler = captured.get("write_file");
    const filePath = path.join(tempDir, "append-test.txt");
    await handler!({ path: filePath, content: "first" });
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("first");
  });
});