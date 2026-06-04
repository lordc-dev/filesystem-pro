import type { SupportedLanguage, SymbolLocation } from "./types.js";
import type { Node as SyntaxNode } from "web-tree-sitter";
import { treeSitterManager } from "./tree-sitter-manager.js";

const STRING_NODE_TYPES = new Set([
  "string",
  "string_fragment",
  "template_string",
  "template_literal_type",
  "string_content",
  "string_literal",
]);

export interface StringLiteralResult {
  value: string;
  rawText: string;
  location: SymbolLocation;
  parentType: string;
  grandparentType?: string;
}

export interface StringLiteralOptions {
  exactMatch?: boolean;
  ignoreCase?: boolean;
  maxResults?: number;
}

export async function findStringLiterals(
  source: { content: string; language: SupportedLanguage },
  pattern: string,
  options: StringLiteralOptions = {}
): Promise<StringLiteralResult[]> {
  const { content, language } = source;
  const { exactMatch = false, ignoreCase = false, maxResults } = options;

  const tree = await treeSitterManager.parse(content, language);
  const results: StringLiteralResult[] = [];

  const normalizedPattern = ignoreCase ? pattern.toLowerCase() : pattern;

  function traverse(node: SyntaxNode): void {
    if (maxResults && results.length >= maxResults) return;

    if (STRING_NODE_TYPES.has(node.type)) {
      const rawText = node.text;
      const value = rawText.replace(/^["'`]/, "").replace(/["'`]$/, "");
      const normalizedValue = ignoreCase ? value.toLowerCase() : value;

      const matches = exactMatch
        ? normalizedValue === normalizedPattern
        : normalizedValue.includes(normalizedPattern);

      if (matches) {
        results.push({
          value,
          rawText,
          location: {
            startLine: node.startPosition.row,
            endLine: node.endPosition.row,
            startColumn: node.startPosition.column,
            endColumn: node.endPosition.column,
            startOffset: node.startIndex,
            endOffset: node.endIndex,
          },
          parentType: node.parent?.type ?? "unknown",
          grandparentType: node.parent?.parent?.type,
        });
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) traverse(child);
    }
  }

  traverse(tree.rootNode);
  return results;
}

export async function findStringIdentifiers(
  source: { content: string; language: SupportedLanguage },
  pattern: string,
  options: StringLiteralOptions = {}
): Promise<StringLiteralResult[]> {
  const results = await findStringLiterals(source, pattern, options);

  const identifierParents = new Set([
    "pair",
    "property_identifier",
    "arguments",
    "call_expression",
    "array",
    "subscript_expression",
    "member_expression",
  ]);

  return results.filter(r =>
    identifierParents.has(r.parentType) ||
    (r.grandparentType && identifierParents.has(r.grandparentType))
  );
}