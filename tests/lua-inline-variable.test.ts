/**
 * Lua inline_variable regression test
 *
 * Covers the P3-10 fix: `local x = ...` declarations in Lua must be found
 * by the regex fallback when symbol extraction misses them.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { inlineVariable } from "../src/undo/inline-variable.js";
import { resetConfig } from "../src/config/runtime-config.js";
import { stalenessGuard } from "../src/undo/staleness-guard.js";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";

await treeSitterManager.initialize();
await treeSitterManager.loadLanguage("lua");

let tmpDir: string;

beforeEach(async () => {
  resetConfig();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fspro-lua-inline-"));
});

afterEach(async () => {
  resetConfig();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("inline_variable with Lua locals", () => {
  it("inlines a local variable with a simple initializer", async () => {
    const file = path.join(tmpDir, "test.lua");
    const content = [
      "local greeting = 'hello'",
      "print(greeting)",
      "print(greeting)",
    ].join("\n");
    await fs.writeFile(file, content, "utf-8");
    await stalenessGuard.recordFromPath(path.resolve(file));

    const result = await inlineVariable(path.resolve(file), content, {
      variableName: "greeting",
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.diff).toContain("print('hello')");
  });

  it("fails cleanly when variable does not exist", async () => {
    const file = path.join(tmpDir, "test2.lua");
    const content = "print('nothing here')";
    await fs.writeFile(file, content, "utf-8");

    const result = await inlineVariable(path.resolve(file), content, {
      variableName: "missing",
      dryRun: true,
    });

    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/not found/i);
  });
});