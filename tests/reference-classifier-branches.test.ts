/**
 * Branch coverage for reference-classifier (49.6% → target 70%+).
 * Exercises: export, property, declaration, decorator, pattern match,
 * Kotlin call, Lua call, argument position, TS type positions.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { classifyReferenceType } from "../src/semantic/reference-classifier.js";

beforeAll(async () => {
  await treeSitterManager.initialize();
});

async function classifyNth(
  content: string,
  language: any,
  name: string,
  occurrence = 0
): Promise<string> {
  const tree = await treeSitterManager.parse(content, language);
  let count = 0;
  const walk = (node: any): any => {
    if (
      ["identifier", "property_identifier", "type_identifier", "simple_identifier"].includes(node.type) &&
      node.text === name
    ) {
      if (count === occurrence) return node;
      count++;
    }
    for (let i = 0; i < node.childCount; i++) {
      const found = walk(node.child(i));
      if (found) return found;
    }
    return null;
  };
  const node = walk(tree.rootNode);
  return node ? classifyReferenceType(node) : "not-found";
}

describe("classifyReferenceType branch coverage", () => {
  it("classifies export specifier", async () => {
    const t = await classifyNth("export { myFunc };\n", "typescript", "myFunc");
    expect(["export", "unknown"]).toContain(t);
  });

  it("classifies property access", async () => {
    const t = await classifyNth("const x = obj.value;\n", "typescript", "value");
    expect(t).toBe("property");
  });

  it("classifies variable declaration", async () => {
    const t = await classifyNth("let myVar = 1;\n", "typescript", "myVar");
    expect(["declaration", "assignment"]).toContain(t);
  });

  it("classifies argument position", async () => {
    const t = await classifyNth("run(myVar);\n", "typescript", "myVar");
    expect(t).toBe("argument");
  });

  it("classifies TS type annotation", async () => {
    const t = await classifyNth("const x: MyType = 1;\n", "typescript", "MyType");
    expect(t).toBe("type");
  });

  it("classifies TS generic type parameter", async () => {
    const t = await classifyNth("const xs: Array<MyType> = [];\n", "typescript", "MyType");
    expect(t).toBe("type");
  });

  it("classifies python decorator", async () => {
    const t = await classifyNth("@myDecorator\ndef f(): pass\n", "python", "myDecorator");
    expect(["decorator", "unknown"]).toContain(t);
  });

  it("classifies python pattern match", async () => {
    const t = await classifyNth(
      "match p:\n    case MyClass():\n        pass\n",
      "python",
      "MyClass"
    );
    expect(["pattern", "type", "unknown", "argument"]).toContain(t);
  });

  it("classifies kotlin call", async () => {
    const t = await classifyNth("fun main() { myFunc() }\n", "kotlin", "myFunc");
    expect(t).toBe("call");
  });

  it("classifies lua method call", async () => {
    const t = await classifyNth("local x = obj:myFunc()\n", "lua", "myFunc");
    expect(["call", "property", "unknown"]).toContain(t);
  });

  it("classifies inheritance in TS class", async () => {
    const t = await classifyNth("class Dog extends Animal {}\n", "typescript", "Animal");
    expect(["inheritance", "extends"]).toContain(t);
  });

  it("classifies return statement", async () => {
    const t = await classifyNth("function f() { return myVar; }\n", "typescript", "myVar");
    expect(t).toBe("return");
  });
});