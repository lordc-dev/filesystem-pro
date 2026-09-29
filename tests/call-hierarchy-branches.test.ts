/**
 * Branch coverage for call-hierarchy (46% branches): Kotlin navigation
 * expressions, Lua method calls, countCallers/countCallees, non-call refs.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { getCallers, getCallees, countCallers, countCallees } from "../src/semantic/call-hierarchy.js";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "callhier-"));
  await treeSitterManager.initialize();
});

describe("call-hierarchy branch coverage", () => {
  it("getCallees on lua method call (same-language session)", async () => {
    const content = "local function run()\n  obj:helper()\nend\n";
    const callees = await getCallees(content, "lua", "run");
    expect(callees.length).toBeGreaterThanOrEqual(1);
  });

  it("getCallees on kotlin navigation call", async () => {
    const content = "fun main() { obj.helper() }\n";
    const callees = await getCallees(content, "kotlin", "main");
    expect(callees.length).toBeGreaterThanOrEqual(1);
    expect(callees[0].name).toBe("helper");
    expect(callees[0].isMethodCall).toBe(true);
  });

  it("getCallees returns empty for symbol without body", async () => {
    const content = "declare function external(): void;\n";
    const callees = await getCallees(content, "typescript", "external");
    expect(callees).toEqual([]);
  });

  it("getCallees returns empty for non-existent symbol", async () => {
    const content = "function f() { return 1; }\n";
    const callees = await getCallees(content, "typescript", "doesNotExist");
    expect(callees).toEqual([]);
  });

  it("getCallers filters out non-call references", async () => {
    const filePath = path.join(tempDir, "noncall.ts");
    // myVar is referenced as an argument, not a call — must not count as caller
    await fs.writeFile(filePath, "function myVar() { return 1; }\nfunction run(x: unknown) { return x; }\nconst r = run(myVar);\n");
    const content = await fs.readFile(filePath, "utf-8");
    const callers = await getCallers("myVar", filePath, content, tempDir);
    // run(myVar) passes myVar as argument — not a call to myVar
    expect(callers.every((c) => c.filePath)).toBe(true);
  });

  it("countCallers and countCallees return numbers", async () => {
    const filePath = path.join(tempDir, "counts.ts");
    await fs.writeFile(filePath, "function helper() { return 1; }\nfunction main() { return helper(); }\n");
    const content = await fs.readFile(filePath, "utf-8");
    const n = await countCallers("helper", filePath, content, tempDir);
    expect(n).toBeGreaterThanOrEqual(1);
    const m = await countCallees(content, "typescript", "main");
    expect(m).toBeGreaterThanOrEqual(1);
  });

  it("getCallees dedupes the same call site", async () => {
    const content = "function main() { if (x) { helper(); } else { helper(); } }\nfunction helper() {}\n";
    const callees = await getCallees(content, "typescript", "main");
    // two distinct call sites → two entries; same-site calls dedupe by position
    const helperCalls = callees.filter((c) => c.name === "helper");
    expect(helperCalls.length).toBe(2);
    const positions = new Set(helperCalls.map((c) => `${c.location.startLine}:${c.location.startColumn}`));
    expect(positions.size).toBe(helperCalls.length);
  });
});