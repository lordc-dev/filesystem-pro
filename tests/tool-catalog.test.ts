import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../src/tools/index.js";
import { setupToolFactories, isDestructiveTool } from "../src/utils/tool-factory.js";
import { readdirSync, readFileSync } from "fs";
import path from "path";

/**
 * Catalog contract: every tool registered on a real server, no duplicate
 * names, and every disk-writing tool is in the destructive guard registry.
 */

const WRITE_TOOLS = new Set([
  // direct file/dir mutation
  "write_file", "edit_file", "delete_file", "delete_path", "delete_directory",
  "move_file", "copy_file", "chmod", "create_symlink", "create_directory",
  "bulk_rename",
  // semantic edits
  "replace_symbol_body", "insert_before_symbol", "insert_after_symbol",
  "rename_symbol", "extract_method", "inline_variable", "introduce_parameter",
]);

function registeredToolNames(): string[] {
  const server = new McpServer({ name: "catalog-test", version: "0.0.0" });
  const names: string[] = [];
  const origRegister = server.registerTool.bind(server);
  (server as unknown as { registerTool: typeof server.registerTool }).registerTool = ((name: string, ...rest: unknown[]) => {
    names.push(name);
    return origRegister(name, ...(rest as Parameters<typeof server.registerTool>));
  }) as typeof server.registerTool;
  const factories = setupToolFactories(server);
  registerAllTools({ server, factories });
  return names;
}

describe("tool catalog contract", () => {
  it("registers every tool exactly once", () => {
    const names = registeredToolNames();
    expect(names.length).toBeGreaterThan(40);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length); // no duplicates
  });

  it("every disk-writing tool is in the destructive guard registry", () => {
    registeredToolNames(); // populate the registry
    for (const tool of WRITE_TOOLS) {
      expect(isDestructiveTool(tool), `${tool} must be registered via destructive()`).toBe(true);
    }
  });

  it("source files declare no more write tools than the catalog", () => {
    // Static scan: every factory call with a write-tool name uses destructive()
    const toolsDir = path.join(import.meta.dirname, "..", "src", "tools");
    const files = readdirSync(toolsDir).filter((f) => f.endsWith(".ts"));
    const offenders: string[] = [];
    for (const f of files) {
      const content = readFileSync(path.join(toolsDir, f), "utf8");
      const re = /(\w+)\(\s*\n?\s*"(\w+)",/g;
      let m;
      while ((m = re.exec(content))) {
        if (WRITE_TOOLS.has(m[2]) && m[1] !== "destructive") {
          offenders.push(`${f}: ${m[2]} registered via ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});