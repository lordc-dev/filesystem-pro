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
  const toolsDir = path.join(import.meta.dirname, "..", "src", "tools");

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

  it("every *-tools.ts module on disk is imported by index.ts", () => {
    const onDisk = readdirSync(toolsDir).filter((f) => f.endsWith("-tools.ts"));
    const indexSrc = readFileSync(path.join(toolsDir, "index.ts"), "utf-8");
    // imports use ESM .js extensions: ./file-tools.js for file-tools.ts
    const missing = onDisk.filter((f) => !indexSrc.includes(`./${f.replace(/\.ts$/, ".js")}`));
    expect(missing, `modules not imported by index.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("structuredContent of a real tool call validates against its outputSchema", async () => {
    const { z } = await import("zod");
    const server = new McpServer({ name: "schema-test", version: "0.0.0" });
    const schemas = new Map<string, Record<string, import("zod").ZodTypeAny>>();
    const handlers = new Map<string, (args: unknown) => Promise<unknown>>();
    const origRegister = server.registerTool.bind(server);
    (server as unknown as { registerTool: typeof server.registerTool }).registerTool = ((
      name: string,
      config: { outputSchema?: Record<string, import("zod").ZodTypeAny> },
      handler: (args: unknown) => Promise<unknown>,
    ) => {
      if (config.outputSchema) schemas.set(name, config.outputSchema);
      handlers.set(name, handler);
      return origRegister(name, config as Parameters<typeof server.registerTool>[1], handler as Parameters<typeof server.registerTool>[2]);
    }) as typeof server.registerTool;
    const factories = setupToolFactories(server);
    registerAllTools({ server, factories });

    // Exercise one read-only tool end-to-end and validate its structuredContent
    const listHandler = handlers.get("list_directory");
    expect(listHandler).toBeDefined();
    const res = (await listHandler!({ path: toolsDir })) as { structuredContent?: Record<string, unknown> };
    expect(res.structuredContent).toBeDefined();
    const schema = schemas.get("list_directory");
    expect(schema).toBeDefined();
    const parsed = z.object(schema!).safeParse(res.structuredContent);
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
  });
});