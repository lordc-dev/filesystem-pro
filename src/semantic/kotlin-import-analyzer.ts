import type { Parser, Language, Tree, Node as SyntaxNode } from "web-tree-sitter";
import type { ImportInfo, ImportSpecifier } from "./import-types.js";
import { nodeToLocation } from "./symbol-extractor-helpers.js";

export function extractKotlinImports(
  tree: Tree,
  _content: string
): ImportInfo[] {
  const imports: ImportInfo[] = [];

  function visit(node: SyntaxNode): void {
    if (node.type === "import_header") {
      const importInfo = parseImportHeader(node);
      if (importInfo) {
        imports.push(importInfo);
      }
      return;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  }

  visit(tree.rootNode);
  return imports;
}

function parseImportHeader(node: SyntaxNode): ImportInfo | null {
  let identifierNode: SyntaxNode | null = null;
  let hasWildcard = false;
  let aliasNode: SyntaxNode | null = null;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (child.type === "identifier") {
      identifierNode = child;
    } else if (child.type === "wildcard_import") {
      hasWildcard = true;
    } else if (child.type === "import_alias") {
      aliasNode = child;
    }
  }

  if (!identifierNode) return null;

  const source = identifierNode.text;
  const specifiers: ImportSpecifier[] = [];
  

  if (hasWildcard) {
    
    specifiers.push({ name: "*" });
  } else {
    const lastPart = source.split(".").pop() ?? source;
    if (aliasNode) {
      const aliasName = aliasNode.childForFieldName("type_identifier")?.text
        ?? aliasNode.descendantsOfType("type_identifier")[0]?.text
        ?? aliasNode.text.replace(/^as\s+/, "");
      specifiers.push({ name: lastPart, alias: aliasName });
    } else {
      specifiers.push({ name: lastPart });
    }
  }

  return {
    source,
    specifiers,
    isDefault: false,
    isNamespace: hasWildcard,
    isTypeOnly: false,
    isSideEffect: false,
    location: nodeToLocation(node),
    rawText: node.text,
  };
}