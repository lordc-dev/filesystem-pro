/**
 * TypeScript/JavaScript Import Analyzer
 *
 * Extracts import information from TypeScript and JavaScript files using tree-sitter.
 * Handles: ES6 imports, dynamic imports, type-only imports, namespace imports.
 *
 * @module ts-import-analyzer
 */

import type { Parser, Language, Tree, Node as SyntaxNode } from "web-tree-sitter";
import type { ImportInfo, ImportSpecifier } from "./import-types.js";
import type { } from "./types.js";
import { nodeToLocation } from "./symbol-extractor-helpers.js";

/**
 * Extract string value from a string literal node (removes quotes)
 */
function getStringValue(node: SyntaxNode): string {
  const text = node.text;
  // Remove surrounding quotes (single, double, or backtick)
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith("`") && text.endsWith("`"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Extract imports from a TypeScript/JavaScript AST
 *
 * @param tree - The parsed syntax tree
 * @param content - The original source code content
 * @returns Array of ImportInfo objects
 */
export function extractTSJSImports(
  tree: Tree,
  content: string
): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const cursor = tree.walk();

  function visit(node: SyntaxNode): void {
    if (node.type === "import_statement") {
      const importInfo = parseImportStatement(node, content);
      if (importInfo) {
        imports.push(importInfo);
      }
    }

    // Also handle dynamic imports: import('module')
    if (node.type === "call_expression") {
      const func = node.childForFieldName("function");
      if (func?.type === "import") {
        const args = node.childForFieldName("arguments");
        const firstArg = args?.firstChild?.nextSibling; // Skip '('
        if (
          firstArg &&
          (firstArg.type === "string" || firstArg.type === "template_string")
        ) {
          imports.push({
            source: getStringValue(firstArg),
            specifiers: [],
            isDefault: false,
            isNamespace: false,
            isTypeOnly: false,
            isSideEffect: false,
            location: nodeToLocation(node),
            rawText: node.text,
          });
        }
      }
    }

    // Traverse children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  }

  if (cursor.gotoFirstChild()) {
    visit(tree.rootNode);
  }

  return imports;
}

/**
 * Parse a single import statement node
 */
function parseImportStatement(
  node: SyntaxNode,
  _content: string
): ImportInfo | null {
  let source = "";
  const specifiers: ImportSpecifier[] = [];
  let isDefault = false;
  let isNamespace = false;
  let isTypeOnly = false;
  let isSideEffect = true; // Assume side-effect until we find imports

  // Check for 'import type' (TypeScript)
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === "type") {
      isTypeOnly = true;
    }
  }

  // Find the source (string at the end)
  const sourceNode = node.childForFieldName("source");
  if (sourceNode) {
    source = getStringValue(sourceNode);
  } else {
    // Fallback: find string node
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child?.type === "string") {
        source = getStringValue(child);
        break;
      }
    }
  }

  if (!source) return null;

  // Find import clause
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (child.type === "import_clause") {
      isSideEffect = false;
      parseImportClause(child, specifiers, {
        isDefault: (v) => (isDefault = v),
        isNamespace: (v) => (isNamespace = v),
      });
    }
  }

  return {
    source,
    specifiers,
    isDefault,
    isNamespace,
    isTypeOnly,
    isSideEffect,
    location: nodeToLocation(node),
    rawText: node.text,
  };
}

/**
 * Parse an import clause (the part between 'import' and 'from')
 */
function parseImportClause(
  node: SyntaxNode,
  specifiers: ImportSpecifier[],
  flags: {
    isDefault: (v: boolean) => void;
    isNamespace: (v: boolean) => void;
  }
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    switch (child.type) {
      case "identifier": {
        // Default import: import Foo from 'module'
        flags.isDefault(true);
        specifiers.push({ name: "default", alias: child.text });
        break;
      }
      case "namespace_import": {
        // Namespace import: import * as foo from 'module'
        flags.isNamespace(true);
        const asIdent = child.childForFieldName("name") ?? child.lastChild;
        if (asIdent?.type === "identifier") {
          specifiers.push({ name: "*", alias: asIdent.text });
        }
        break;
      }

      case "named_imports":
        // Named imports: import { foo, bar as baz } from 'module'
        parseNamedImports(child, specifiers);
        break;
    }
  }
}

/**
 * Parse named imports: { foo, bar as baz, type Qux }
 */
function parseNamedImports(
  node: SyntaxNode,
  specifiers: ImportSpecifier[]
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (child.type === "import_specifier") {
      let name = "";
      let alias: string | undefined;
      let isTypeOnly = false;

      // Check for type keyword (import { type Foo })
      for (let j = 0; j < child.childCount; j++) {
        const grandchild = child.child(j);
        if (grandchild?.type === "type") {
          isTypeOnly = true;
        }
      }

      const nameNode = child.childForFieldName("name");
      const aliasNode = child.childForFieldName("alias");

      if (nameNode) {
        name = nameNode.text;
      }
      if (aliasNode) {
        alias = aliasNode.text;
      }

      if (name) {
        specifiers.push({ name, alias, isTypeOnly });
      }
    }
  }
}
