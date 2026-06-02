import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setupToolFactories } from "../src/utils/tool-factory.js";
import { registerAllTools } from "../src/tools/index.js";
import { resetMetrics } from "../src/utils/metrics.js";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), "mcp-fs-e2e-test");

describe("E2E: MCP Tool Roundtrip", () => {
  let server: McpServer;
  let registeredTools: Record<string, { handler: (args: Record<string, unknown>, extra: unknown) => Promise<unknown> }>;

  beforeEach(() => {
    resetMetrics();
    server = new McpServer({ name: "test-server", version: "0.0.1" });
    const factories = setupToolFactories(server);
    registerAllTools({ server, factories });
    registeredTools = (server as unknown as { _registeredTools: typeof registeredTools })._registeredTools;

    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, "hello.txt"), "hello world\nsecond line\n");
    writeFileSync(join(TEST_DIR, "searchable.ts"), "function foo() { return 42; }\nfunction bar() { return foo(); }\n");
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  async function callTool(name: string, args: Record<string, unknown>) {
    const tool = registeredTools[name];
    if (!tool) throw new Error(`Tool "${name}" not registered`);
    return tool.handler(args, { meta: {} });
  }

  it("registers all expected tools", () => {
    const expected = [
      "read_text_file", "write_file", "edit_file", "search_content",
      "list_directory", "create_directory", "get_file_info",
      "get_server_stats",
    ];
    for (const name of expected) {
      expect(registeredTools[name], `Tool "${name}" should be registered`).toBeDefined();
    }
  });

  it("read_text_file returns file content", async () => {
    const result = await callTool("read_text_file", { path: join(TEST_DIR, "hello.txt") });
    const text = JSON.stringify(result);
    expect(text).toContain("hello world");
    expect(text).toContain("second line");
  });

  it("search_content finds pattern", async () => {
    const result = await callTool("search_content", {
      path: TEST_DIR,
      pattern: "function foo",
    });
    const text = JSON.stringify(result);
    expect(text).toContain("searchable.ts");
  });

  it("write_file response includes path info", async () => {
    const target = join(TEST_DIR, "new-file.txt");
    const result = await callTool("write_file", { path: target, content: "created by e2e" });
    expect(existsSync(target)).toBe(true);
  });

  it("list_directory returns entries", async () => {
    const result = await callTool("list_directory", { path: TEST_DIR });
    const text = JSON.stringify(result);
    expect(text).toContain("hello.txt");
    expect(text).toContain("searchable.ts");
  });

  it("get_file_info returns metadata", async () => {
    const result = await callTool("get_file_info", { path: join(TEST_DIR, "hello.txt") });
    const text = JSON.stringify(result);
    expect(text).toContain("size");
  });

  it("get_server_stats returns server metrics", async () => {
    const result = await callTool("get_server_stats", {});
    const text = JSON.stringify(result);
    expect(text).toContain("uptimeMs");
  });

  it("rejects path traversal via read_text_file", async () => {
    try {
      await callTool("read_text_file", { path: join(TEST_DIR, "../../../etc/passwd") });
      expect.unreachable("Should have thrown");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg.toLowerCase()).toMatch(/error|denied|invalid|outside|validation|traversal/);
    }
  });
});