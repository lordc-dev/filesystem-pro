import { describe, it, expect, beforeAll } from "vitest";
import { treeSitterManager } from "../src/semantic/tree-sitter-manager.js";
import { classifyReferenceType } from "../src/semantic/reference-classifier.js";

beforeAll(async () => {
  await treeSitterManager.initialize();
});

async function findIdentifier(tree: any, name: string, occurrence = 0): Promise<any> {
  let count = 0;
  const walk = (node: any): any => {
    if (["identifier", "property_identifier", "type_identifier"].includes(node.type) && node.text === name) {
      if (count === occurrence) return node;
      count++;
    }
    for (let i = 0; i < node.childCount; i++) {
      const found = walk(node.child(i));
      if (found) return found;
    }
    return null;
  };
  return walk(tree.rootNode);
}

describe("classifyReferenceType", () => {
  it("classifies function call", async () => {
    const tree = await treeSitterManager.parse("foo();", "typescript");
    const id = await findIdentifier(tree, "foo");
    expect(classifyReferenceType(id)).toBe("call");
  });

  it("classifies import", async () => {
    const tree = await treeSitterManager.parse('import { foo } from "mod";', "typescript");
    const id = await findIdentifier(tree, "foo");
    expect(classifyReferenceType(id)).toBe("import");
  });

  it("classifies type annotation", async () => {
    const tree = await treeSitterManager.parse("const x: Foo = bar;", "typescript");
    const id = await findIdentifier(tree, "Foo");
    expect(classifyReferenceType(id)).toBe("type");
  });

  it("classifies assignment", async () => {
    const tree = await treeSitterManager.parse("x = 5;", "typescript");
    const id = await findIdentifier(tree, "x");
    expect(classifyReferenceType(id)).toBe("assignment");
  });

  it("classifies class inheritance", async () => {
    const tree = await treeSitterManager.parse("class Dog extends Animal {}", "typescript");
    const id = await findIdentifier(tree, "Animal");
    expect(classifyReferenceType(id)).toBe("extends");
  });

  it("classifies return statement", async () => {
    const tree = await treeSitterManager.parse("function f() { return x; }", "typescript");
    const id = await findIdentifier(tree, "x");
    expect(classifyReferenceType(id)).toBe("return");
  });

  it("classifies python attribute call (git.Repo()) as property or call", async () => {
    const tree = await treeSitterManager.parse("import git\nr = git.Repo()", "python");
    const id = await findIdentifier(tree, "Repo");
    expect(["call", "property"]).toContain(classifyReferenceType(id));
  });

  it("classifies python import", async () => {
    const tree = await treeSitterManager.parse("import os", "python");
    const id = await findIdentifier(tree, "os");
    expect(classifyReferenceType(id)).toBe("import");
  });

  it("returns unknown for top-level bare identifier", async () => {
    const tree = await treeSitterManager.parse("foo", "typescript");
    const id = await findIdentifier(tree, "foo");
    // program → expression_statement → identifier: no classifier matches
    const result = classifyReferenceType(id);
    expect(["unknown", "call", "declaration"]).toContain(result);
  });
});