/**
 * Incremental parsing verification (round 4 optimization).
 *
 * Verifies parseIncremental() produces a tree equivalent to a full parse
 * after an edit, and that the AST cache is warmed for the new content.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { symbolCache } from "../src/semantic/symbol-cache.js";

const OLD_CODE = `function alpha() {
  const x = 1;
  return x;
}

function beta() {
  return 2;
}
`;

describe("parseIncremental", () => {
  beforeAll(async () => {
    await treeSitterManager.initialize();
  });

  it("produces a tree equivalent to full parse after a mid-file edit", async () => {
    // Full parse of old content — populates AST cache
    const oldTree = await treeSitterManager.parse(OLD_CODE, "typescript");
    expect(oldTree).toBeTruthy();

    // Edit: insert a new function between alpha and beta
    const NEW_CODE = OLD_CODE.replace(
      "function beta()",
      "function gamma() {\n  return 3;\n}\n\nfunction beta()"
    );

    const cached = await treeSitterManager.parseIncremental(OLD_CODE, NEW_CODE, "typescript");
    expect(cached).toBe(true);

    // The incremental tree must be served on next parse() of new content (cache hit)
    const incTree = await treeSitterManager.parse(NEW_CODE, "typescript");
    expect(incTree).toBeTruthy();

    // Equivalence: root span matches content, and all three functions exist
    const root = incTree.rootNode;
    expect(root.startIndex).toBe(0);
    expect(root.endIndex).toBe(NEW_CODE.length);

    const fnNames = root.descendantsOfType("function_declaration").map(n => {
      const nameNode = n.childForFieldName("name");
      return nameNode ? nameNode.text : "";
    });
    expect(fnNames).toContain("alpha");
    expect(fnNames).toContain("gamma");
    expect(fnNames).toContain("beta");
  });

  it("falls back gracefully when old content is not cached", async () => {
    const uncached = "const neverParsed = true;\n";
    const edited = "const neverParsed = false;\n";
    const result = await treeSitterManager.parseIncremental(uncached, edited, "typescript");
    expect(result).toBe(false);
  });

  it("handles identical content as a no-op", async () => {
    const result = await treeSitterManager.parseIncremental(OLD_CODE, OLD_CODE, "typescript");
    expect(result).toBe(true);
  });

  it("produces correct symbol extraction from the incremental tree", async () => {
    // Extract symbols from new content — must go through the warmed cache
    const { extractSymbols } = await import("../src/semantic/symbol-extractor.js");
    const NEW_CODE = OLD_CODE.replace("return x;", "return x + 10;");
    await treeSitterManager.parseIncremental(OLD_CODE, NEW_CODE, "typescript");

    const symbols = await extractSymbols(NEW_CODE, "typescript");
    const names = symbols.map(s => s.name);
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
    // Body of alpha must reflect the edit
    const alpha = symbols.find(s => s.name === "alpha");
    expect(alpha).toBeTruthy();
    const { getSymbolBody } = await import("../src/semantic/symbol-extractor.js");
    const body = getSymbolBody(alpha!, NEW_CODE);
    expect(body).toContain("return x + 10;");
  });
});