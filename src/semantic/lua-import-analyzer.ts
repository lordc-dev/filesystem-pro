/**
 * Lua Import Analyzer
 *
 * Extracts require() calls, dofile(), loadfile(), and @resource imports
 * from Lua source files using Tree-sitter AST.
 *
 * FiveM/Lua patterns:
 * - local foo = require('module')       → source: 'module', specifier: 'foo'
 * - local foo = lib.require('module')    → source: 'module', specifier: 'foo'
 * - require('module')                    → side-effect import
 * - dofile('path/to/file.lua')           → source: 'path/to/file.lua'
 * - loadfile('path/to/file.lua')         → source: 'path/to/file.lua'
 * - @ox_lib/init.lua in fxmanifest        → handled by manifest, not code
 */

import type { Node as SyntaxNode } from "web-tree-sitter";
import type { ImportInfo, ImportSpecifier } from "./import-types.js";
import type { SymbolLocation } from "./types.js";

function nodeToLocation(node: SyntaxNode): SymbolLocation {
  return {
    startLine: node.startPosition.row,
    startColumn: node.startPosition.column,
    endLine: node.endPosition.row,
    endColumn: node.endPosition.column,
    startOffset: node.startIndex,
    endOffset: node.endIndex,
  };
}

function extractStringArg(node: SyntaxNode): string | null {
  if (node.type === "string") {
    const text = node.text;
    if ((text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    if (text.startsWith("[[")) {
      return text.slice(2, -2);
    }
    return text;
  }
  return null;
}

function findStringInNode(node: SyntaxNode): SyntaxNode | null {
  if (node.type === "string") return node;
  for (const child of node.namedChildren) {
    if (child) {
      const found = findStringInNode(child);
      if (found) return found;
    }
  }
  return null;
}

function findRequireCalls(root: SyntaxNode): ImportInfo[] {
  const imports: ImportInfo[] = [];

  function walk(node: SyntaxNode): void {
    if (node.type === "call") {
      const func = node.namedChildren.find(c => c?.type === "variable" || c?.type === "identifier");
      const funcText = func?.text ?? "";

      const isRequire = funcText === "require" || funcText === "dofile" || funcText === "loadfile" || funcText.endsWith(".require");

      if (isRequire) {
        // Find string argument anywhere inside the call's arguments
        const argList = node.namedChildren.find(c => c?.type === "argument_list");
        const stringArg = argList ? findStringInNode(argList) : null;

        if (stringArg) {
          const source = extractStringArg(stringArg);
          if (source) {
            const isSideEffect = funcText === "require" && !isInAssignment(node);

            const specifiers: ImportSpecifier[] = [];
            let isDefault = false;

            if (!isSideEffect) {
              const localDecl = findEnclosingLocalDecl(node);
              if (localDecl) {
                const varList = localDecl.namedChildren.find(c => c?.type === "variable_list");
                if (varList) {
                  const vars = varList.namedChildren.filter(c => c?.type === "variable");
                  for (const v of vars) {
                    const id = v.namedChildren.find(c => c?.type === "identifier");
                    if (id) {
                      specifiers.push({ name: id.text });
                      isDefault = true;
                    }
                  }
                }
              }
            }

            imports.push({
              source,
              specifiers: specifiers.length > 0 ? specifiers : [{ name: "default" }],
              isDefault,
              isNamespace: false,
              isTypeOnly: false,
              isSideEffect,
              location: nodeToLocation(node),
              rawText: node.text,
            });
          }
        }
      }
    }

    for (const child of node.namedChildren) {
      if (child) walk(child);
    }
  }

  walk(root);
  return imports;
}

function isInAssignment(node: SyntaxNode): boolean {
  let parent: SyntaxNode | null = node.parent;
  while (parent) {
    if (parent.type === "local_variable_declaration" || parent.type === "variable_assignment") {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function findEnclosingLocalDecl(node: SyntaxNode): SyntaxNode | null {
  let parent: SyntaxNode | null = node.parent;
  while (parent) {
    if (parent.type === "local_variable_declaration") {
      return parent;
    }
    parent = parent.parent;
  }
  return null;
}

export function extractLuaImports(tree: SyntaxNode, _content: string): ImportInfo[] {
  return findRequireCalls(tree);
}