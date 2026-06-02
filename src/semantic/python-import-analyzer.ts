/**
 * Python Import Analyzer
 *
 * Extracts import information from Python files using tree-sitter.
 * Handles: import statements, from...import statements, aliased imports, wildcard imports.
 *
 * @module python-import-analyzer
 */

import type { Parser, Language, Tree, Node as SyntaxNode } from "web-tree-sitter";
import type { ImportInfo, ImportSpecifier } from "./import-types.js";

import { nodeToLocation } from "./symbol-extractor-helpers.js";

/**
 * Extract imports from a Python AST
 *
 * @param tree - The parsed syntax tree
 * @param content - The original source code content (unused but kept for API consistency)
 * @returns Array of ImportInfo objects
 */
export function extractPythonImports(
  tree: Tree,
  _content: string
): ImportInfo[] {
  const imports: ImportInfo[] = [];

  function visit(node: SyntaxNode): void {
    // import foo, bar
    if (node.type === "import_statement") {
      const importInfo = parsePythonImport(node);
      if (importInfo) {
        imports.push(...importInfo);
      }
    }

    // from foo import bar, baz
    if (node.type === "import_from_statement") {
      const importInfo = parsePythonFromImport(node);
      if (importInfo) {
        imports.push(importInfo);
      }
    }

    // Traverse children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  }

  visit(tree.rootNode);
  return imports;
}

/**
 * Parse Python 'import foo, bar' statement
 */
function parsePythonImport(node: SyntaxNode): ImportInfo[] {
  const imports: ImportInfo[] = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (child.type === "dotted_name") {
      imports.push({
        source: child.text,
        specifiers: [],
        isDefault: false,
        isNamespace: true, // Python imports are namespace-style
        isTypeOnly: false,
        isSideEffect: false,
        location: nodeToLocation(node),
        rawText: node.text,
      });
    }

    if (child.type === "aliased_import") {
      const nameNode = child.childForFieldName("name");
      const aliasNode = child.childForFieldName("alias");

      if (nameNode) {
        imports.push({
          source: nameNode.text,
          specifiers: aliasNode
            ? [{ name: nameNode.text, alias: aliasNode.text }]
            : [],
          isDefault: false,
          isNamespace: true,
          isTypeOnly: false,
          isSideEffect: false,
          location: nodeToLocation(node),
          rawText: node.text,
        });
      }
    }
  }

  return imports;
}

/**
 * Parse Python 'from foo import bar, baz' statement
 */
function parsePythonFromImport(node: SyntaxNode): ImportInfo | null {
  let source = "";
  const specifiers: ImportSpecifier[] = [];
  let isNamespace = false;

  // Find module name
  const moduleNode = node.childForFieldName("module_name");
  if (moduleNode) {
    source = moduleNode.text;
  } else {
    // Fallback: find dotted_name
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child?.type === "dotted_name" || child?.type === "relative_import") {
        source = child.text;
        break;
      }
    }
  }

  if (!source) return null;

  // Find imports
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    // from foo import *
    if (child.type === "wildcard_import") {
      isNamespace = true;
      specifiers.push({ name: "*" });
    }

    // Named imports
    if (child.type === "dotted_name" && i > 0) {
      // Skip the module name
      specifiers.push({ name: child.text });
    }

    if (child.type === "aliased_import") {
      const nameNode = child.childForFieldName("name");
      const aliasNode = child.childForFieldName("alias");

      if (nameNode) {
        specifiers.push({
          name: nameNode.text,
          alias: aliasNode?.text,
        });
      }
    }
  }

  return {
    source,
    specifiers,
    isDefault: false,
    isNamespace,
    isTypeOnly: false,
    isSideEffect: specifiers.length === 0,
    location: nodeToLocation(node),
    rawText: node.text,
  };
}
