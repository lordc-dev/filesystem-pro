/**
 * Symbol Extractor Helpers
 *
 * Internal helper functions for extracting symbols from tree-sitter AST nodes.
 * These are used by the main symbol-extractor module.
 */

import type { Parser, Language, Tree, Node as SyntaxNode } from "web-tree-sitter";
import type {
  Symbol,
  SymbolLocation,
  SymbolKind,
  SymbolMetadata,
  SupportedLanguage,
} from "./types.js";
import type { LanguageConfig, NodeTypeConfig } from "./language-config.js";
import { getNodeConfig } from "./language-config.js";

/**
 * Options for symbol extraction
 */
export interface ExtractionOptions {
  /** Maximum depth for nested symbols (default: unlimited) */
  maxDepth?: number;
  /** Include documentation comments */
  includeDocumentation?: boolean;
  /** Include metadata (visibility, static, async, etc.) */
  includeMetadata?: boolean;
  /** Filter by symbol kinds */
  kinds?: SymbolKind[];
}

/**
 * Extract location from tree-sitter node
 */
export function nodeToLocation(node: SyntaxNode): SymbolLocation {
  return {
    startLine: node.startPosition.row,
    startColumn: node.startPosition.column,
    endLine: node.endPosition.row,
    endColumn: node.endPosition.column,
    startOffset: node.startIndex,
    endOffset: node.endIndex,
  };
}

/**
 * Get symbol name from node based on language configuration
 */
export function getSymbolName(
  node: SyntaxNode,
  config: NodeTypeConfig,
  _sourceCode: string
): string | null {
  // Handle special cases for variable declarations
  if (config.nameField === "declarator") {
    const declarator =
      node.childForFieldName("declarator") ??
      node.namedChildren.find((c): c is SyntaxNode => c !== null && c.type.includes("declarator"));

    if (declarator) {
      const nameNode =
        declarator.childForFieldName("name") ??
        declarator.namedChildren.find((c): c is SyntaxNode => c !== null && c.type === "identifier");
      if (nameNode) {
        return nameNode.text;
      }
      if (declarator.type === "identifier") {
        return declarator.text;
      }
    }
    return null;
  }

  // Standard name field lookup
  const nameNode = node.childForFieldName(config.nameField);
  if (nameNode) {
    return nameNode.text;
  }

  // Handle nameField that references a child node type (e.g. Kotlin)
  // Some grammars don't use named fields — names are child nodes typed as
  // type_identifier, simple_identifier, variable_declaration, etc.
  const childByNameType = node.namedChildren.find(
    (c): c is SyntaxNode => c !== null && c.type === config.nameField
  );
  if (childByNameType) {
    // If the matched child is a container (e.g. variable_declaration),
    // extract the name from its simple_identifier child
    if (childByNameType.type === "variable_declaration") {
      const innerName = childByNameType.namedChildren.find(
        (c): c is SyntaxNode => c !== null && c.type === "simple_identifier"
      );
      if (innerName) return innerName.text;
    }
    return childByNameType.text;
  }

  // Try to find identifier child as fallback
  const identifier = node.namedChildren.find(
    (c): c is SyntaxNode =>
      c !== null &&
      (c.type === "identifier" ||
      c.type === "property_identifier" ||
      c.type === "type_identifier" ||
      c.type === "simple_identifier")
  );
  if (identifier) {
    return identifier.text;
  }

  return null;
}

/**
 * Get body location if available
 */
export function getBodyLocation(
  node: SyntaxNode,
  config: NodeTypeConfig
): SymbolLocation | undefined {
  if (!config.bodyField) {
    return undefined;
  }

  // Standard field name lookup
  const bodyNode = node.childForFieldName(config.bodyField);
  if (bodyNode) {
    return nodeToLocation(bodyNode);
  }

  // Fallback: search named children by type (tree-sitter-kotlin doesn't use field names)
  const childByType = node.namedChildren.find(
    (c): c is SyntaxNode => c !== null && c.type === config.bodyField
  );
  if (childByType) {
    return nodeToLocation(childByType);
  }

  return undefined;
}

/**
 * Extract metadata from node
 */
export function extractMetadata(
  node: SyntaxNode,
  config: NodeTypeConfig,
  langConfig: LanguageConfig
): SymbolMetadata {
  const metadata: SymbolMetadata = {};

  // Check for visibility modifiers
  if (config.hasVisibility) {
    const modifiers = node.namedChildren.filter(
      (c): c is SyntaxNode =>
        c !== null &&
        (c.type === "accessibility_modifier" ||
        c.type === "modifier" ||
        c.type === "visibility_modifier" ||
        ["public", "private", "protected", "internal"].includes(c.text))
    );

    for (const mod of modifiers) {
      const text = mod.text.toLowerCase();
      if (text === "public" || text === "private" || text === "protected" || text === "internal") {
        metadata.visibility = text as "public" | "private" | "protected";
        break;
      }
    }
  }

  // Check for static modifier
  if (config.hasStatic) {
    const hasStatic = node.namedChildren.some((c) => c !== null && (c.text === "static" || c.type === "static"));
    if (hasStatic) {
      metadata.isStatic = true;
    }
  }

  // Check for async
  const hasAsync = node.namedChildren.some((c) => c !== null && (c.text === "async" || c.type === "async"));
  if (hasAsync) {
    metadata.isAsync = true;
  }

  // Check for export
  if (config.hasExport) {
    const parent = node.parent;
    if (parent) {
      const hasExport =
        parent.type === "export_statement" ||
        parent.namedChildren.some((c) => c !== null && (c.type === "export" || c.text === "export"));
      if (hasExport) {
        metadata.isExported = true;
      }
    }
  }

  // Extract decorators
  const decorators: string[] = [];
  let prevSibling = node.previousNamedSibling;
  while (prevSibling && langConfig.decoratorTypes.includes(prevSibling.type)) {
    decorators.unshift(prevSibling.text);
    prevSibling = prevSibling.previousNamedSibling;
  }
  if (decorators.length > 0) {
    metadata.decorators = decorators;
  }

  return metadata;
}

/**
 * Extract documentation comment preceding a node
 */
export function extractDocumentation(
  node: SyntaxNode,
  langConfig: LanguageConfig
): string | undefined {
  let prevSibling = node.previousNamedSibling;

  // Skip decorators to find comment
  while (prevSibling && langConfig.decoratorTypes.includes(prevSibling.type)) {
    prevSibling = prevSibling.previousNamedSibling;
  }

  if (prevSibling && langConfig.commentTypes.includes(prevSibling.type)) {
    return prevSibling.text;
  }

  // For exported symbols, the JSDoc comment may be before the export_statement
  // e.g.: /** @deprecated */ export function foo() {}
  const parent = node.parent;
  if (parent?.type === "export_statement") {
    let parentPrevSibling = parent.previousNamedSibling;

    // Skip decorators
    while (parentPrevSibling && langConfig.decoratorTypes.includes(parentPrevSibling.type)) {
      parentPrevSibling = parentPrevSibling.previousNamedSibling;
    }

    if (parentPrevSibling && langConfig.commentTypes.includes(parentPrevSibling.type)) {
      return parentPrevSibling.text;
    }
  }

  return undefined;
}

/**
 * Recursively extract symbols from a node
 */
export function extractSymbolsFromNode(
  node: SyntaxNode,
  sourceCode: string,
  language: SupportedLanguage,
  langConfig: LanguageConfig,
  options: ExtractionOptions,
  parentPath: string = "",
  depth: number = 0,
  parentKind?: SymbolKind,
): Symbol[] {
  const symbols: Symbol[] = [];

  // Check depth limit
  if (options.maxDepth !== undefined && depth > options.maxDepth) {
    return symbols;
  }

  // Guard against null nodes (can occur with incomplete/malformed source)
  if (!node?.type) {
    return symbols;
  }

  // Process current node if it's a symbol
  const nodeConfig = getNodeConfig(language, node.type);

  if (nodeConfig) {
    const name = getSymbolName(node, nodeConfig, sourceCode);

    if (name) {
      // Check kind filter
      if (options.kinds && !options.kinds.includes(nodeConfig.kind)) {
        // Skip this symbol but continue to children
      } else {
        const namePath = parentPath ? `${parentPath}/${name}` : name;

        const symbol: Symbol = {
          name,
          namePath,
          kind: nodeConfig.kind,
          location: nodeToLocation(node),
          children: [],
          parent: parentPath || undefined,
        };

        // Reclassify based on parent context (e.g., function_declaration inside class → Method)
        if (langConfig.reclassifyWhenInside && node.type in langConfig.reclassifyWhenInside) {
          const parentKindMap = langConfig.reclassifyWhenInside[node.type];
          const override = parentKind != null ? parentKindMap[parentKind] : undefined;
          if (override !== undefined) {
            symbol.kind = override;
          }
        }

        // Add body location if available
        const bodyLoc = getBodyLocation(node, nodeConfig);
        if (bodyLoc) {
          symbol.bodyLocation = bodyLoc;
        }

        // Add metadata if requested
        if (options.includeMetadata) {
          symbol.metadata = extractMetadata(node, nodeConfig, langConfig);
        }

        // Add documentation if requested
        if (options.includeDocumentation) {
          const doc = extractDocumentation(node, langConfig);
          if (doc) {
            symbol.metadata ??= {};
            symbol.metadata.documentation = doc;
          }
        }

        // Extract child symbols if applicable
        if (nodeConfig.canHaveChildren) {
          const containers = nodeConfig.childContainers ?? [];
          let childNodes: SyntaxNode[] = [];

          if (containers.length > 0) {
            for (const containerType of containers) {
              const container = node.namedChildren.find((c): c is SyntaxNode => c !== null && c.type === containerType);
              if (container) {
                childNodes.push(...container.namedChildren.filter((c): c is SyntaxNode => c !== null));
              }
            }
          } else {
            childNodes = node.namedChildren.filter((c): c is SyntaxNode => c !== null);
          }

          for (const childNode of childNodes) {
            const childSymbols = extractSymbolsFromNode(
              childNode,
              sourceCode,
              language,
              langConfig,
              options,
              namePath,
              depth + 1,
              symbol.kind,
            );
            symbol.children.push(...childSymbols);
          }
        }

        symbols.push(symbol);
        return symbols; // Don't process children again at top level
      }
    }
  }

  // Process children for non-symbol nodes (or filtered symbols)
  for (const child of node.namedChildren) {
    if (!child) continue;
    const childSymbols = extractSymbolsFromNode(
      child,
      sourceCode,
      language,
      langConfig,
      options,
      parentPath,
      depth
    );
    symbols.push(...childSymbols);
  }

  return symbols;
}

/**
 * Count total symbols including nested ones
 */
export function countSymbols(symbols: Symbol[]): number {
  let count = symbols.length;
  for (const symbol of symbols) {
    count += countSymbols(symbol.children);
  }
  return count;
}
