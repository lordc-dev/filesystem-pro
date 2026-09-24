import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setupToolFactories, isDestructiveTool } from "../src/utils/tool-factory.js";

describe("destructive tool registry (SSOT)", () => {
  it("registers destructive() tools in the guard registry, not standard() ones", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const { destructive, standard } = setupToolFactories(server);

    destructive("write_file", {
      title: "Write",
      description: "test",
      inputSchema: {},
      outputSchema: {},
    }, async () => ({ content: [] }));

    standard("list_directory", {
      title: "List",
      description: "test",
      inputSchema: {},
      outputSchema: {},
    }, async () => ({ content: [] }));

    expect(isDestructiveTool("write_file")).toBe(true);
    expect(isDestructiveTool("list_directory")).toBe(false);
  });
});