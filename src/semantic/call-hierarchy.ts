/**
 * Call Hierarchy Module
 * 
 * Provides call hierarchy analysis: finding callers (upstream) and callees (downstream)
 * for functions and methods using Tree-sitter AST analysis.
 * 
 * @example
 * ```typescript
 * import { getCallers, getCallees } from './call-hierarchy';
 *
 * const callers = await getCallers('myFunction', filePath, searchPath);
 *
 * const callees = await getCallees(content, 'typescript', 'MyClass/myMethod');
 * ```
 */

import type { Node as SyntaxNode } from "web-tree-sitter";
import { treeSitterManager } from "./tree-sitter-manager.js";
import type { SupportedLanguage, SymbolLocation } from "./types.js";
import { findReferencesFromDefinition } from "./reference-finder.js";
import { findSymbol } from "./symbol-lookup.js";

/**
 * Information about a caller of a symbol
 */
export interface CallerInfo {
  /** Path to the file containing the caller */
  filePath: string;
  /** Name of the calling function/method (if determinable) */
  callerSymbol?: string;
  /** Location of the call */
  location: SymbolLocation;
  /** Context line showing the call */
  context: string;
}

/**
 * Information about a callee (function called within a symbol)
 */
export interface CalleeInfo {
  /** Name of the called function/method */
  name: string;
  /** Location of the call within the parent symbol */
  location: SymbolLocation;
  /** Whether it's a method call (has receiver) */
  isMethodCall: boolean;
  /** Receiver object for method calls (e.g., "this", "foo") */
  receiver?: string;
}

/**
 * Find all callers of a symbol across the codebase
 * 
 * Uses findReferencesFromDefinition and filters for call-type references.
 * 
 * @param symbolPath - Symbol name path (e.g., 'MyClass/myMethod')
 * @param definitionPath - Path to the file containing the symbol definition
 * @param definitionContent - Content of the definition file
 * @param searchPath - Directory to search for callers
 * @returns Array of caller information
 */
export async function getCallers(
  symbolPath: string,
  definitionPath: string,
  definitionContent: string,
  searchPath: string
): Promise<CallerInfo[]> {
  const result = await findReferencesFromDefinition(
    definitionPath,
    definitionContent,
    symbolPath,
    searchPath,
    { includeDefinition: false }
  );
  
  // Filter for call references
  const callers: CallerInfo[] = [];
  
  for (const ref of result.references) {
    // Only include actual calls and type references
    if (ref.referenceType !== 'call' && ref.referenceType !== 'type' && ref.referenceType !== 'new') {
      continue;
    }
    
    callers.push({
      filePath: ref.filePath,
      callerSymbol: undefined, // Could be enhanced to find enclosing symbol
      location: ref.location,
      context: ref.context ?? '',
    });
  }
  
  return callers;
}

/**
 * Find all functions/methods called within a symbol's body
 * 
 * Parses the symbol body with Tree-sitter and extracts call expressions.
 * 
 * @param content - Source code content
 * @param language - Programming language
 * @param symbolPath - Symbol name path (e.g., 'MyClass/myMethod')
 * @returns Array of callee information
 */
export async function getCallees(
  content: string,
  language: SupportedLanguage,
  symbolPath: string
): Promise<CalleeInfo[]> {
  const lookupResult = await findSymbol(
    { content, language },
    symbolPath,
    { includeBody: true, exactMatch: true }
  );
  
  if (!lookupResult?.body) {
    return [];
  }
  
  // Get the symbol's body and its start location
  const symbolLocation = lookupResult.symbol.location;
  
  // Parse the body to find call expressions
  const tree = await treeSitterManager.parse(content, language);
  if (!tree) {
    return [];
  }
  
  const callees: CalleeInfo[] = [];
  const seenCalls = new Set<string>();
  
  function extractCallInfo(node: SyntaxNode): CalleeInfo | null {
    // Determine function node: try field name first, then fallback for Kotlin (no field names)
    let functionNode: SyntaxNode | null = node.childForFieldName('function');
    if (!functionNode) {
      // Kotlin/Java: call_expression has navigation_expression or simple_identifier as first named child
      const firstNamed = node.namedChildren[0];
      if (firstNamed && (firstNamed.type === 'navigation_expression' || firstNamed.type === 'simple_identifier' || firstNamed.type === 'identifier')) {
        functionNode = firstNamed;
      }
    }
    
    if (!functionNode) {
      return null;
    }
    
    let name: string;
    let isMethodCall = false;
    let receiver: string | undefined;
    
    // Kotlin navigation_expression (method call: obj.method)
    if (functionNode.type === 'navigation_expression') {
      isMethodCall = true;
      // navigation_expression has: [object, navigation_suffix(...)]
      // Try field names first, then fallback by child type
      let objectNode = functionNode.childForFieldName('object') ?? functionNode.childForFieldName('receiver');
      let propertyNode = functionNode.childForFieldName('property') ?? functionNode.childForFieldName('selector');
      
      if (!objectNode || !propertyNode) {
        // Fallback: iterate named children
        for (const child of functionNode.namedChildren) {
          if (!child) continue;
          if (child.type === 'simple_identifier' && !objectNode) {
            // First simple_identifier is the object/receiver
            objectNode = objectNode ?? child;
          }
          if (child.type === 'navigation_suffix') {
            // navigation_suffix contains the method name
            const selector = child.childForFieldName('selector') ?? child.namedChildren.find(c => c?.type === 'simple_identifier' || c?.type === 'identifier');
            if (selector) {
              propertyNode = selector;
            }
          }
        }
      }
      
      if (propertyNode) {
        name = propertyNode.text;
        receiver = objectNode?.text;
      } else {
        // No selector found, use the whole expression
        name = functionNode.text;
        receiver = undefined;
      }
    } else if (functionNode.type === 'member_expression' || functionNode.type === 'postfix_expression') {
      // JS/TS or other member access
      isMethodCall = true;
      const objectNode = functionNode.childForFieldName('object') ?? functionNode.childForFieldName('receiver');
      const propertyNode = functionNode.childForFieldName('property') ?? functionNode.childForFieldName('selector');
      
      if (propertyNode) {
        name = propertyNode.text;
        receiver = objectNode?.text;
      } else {
        name = functionNode.text;
        receiver = undefined;
      }
    } else if (functionNode.type === 'identifier' || functionNode.type === 'simple_identifier') {
      // Direct function call: func()
      name = functionNode.text;
    } else {
      // Other patterns (e.g., IIFE, computed properties)
      return null;
    }
    
    return {
      name,
      location: {
        startLine: node.startPosition.row,
        endLine: node.endPosition.row,
        startColumn: node.startPosition.column,
        endColumn: node.endPosition.column,
        startOffset: 0,
        endOffset: 0
      },
      isMethodCall,
      receiver,
    };
  }
  
  /**
   * Walk the AST to find call expressions within the symbol's range
   */
  function walkForCalls(node: SyntaxNode): void {
    const nodeStart = node.startPosition.row;
    const nodeEnd = node.endPosition.row;
    
    // Check if node is within the symbol's body
    if (nodeStart < symbolLocation.startLine || nodeEnd > symbolLocation.endLine) {
      // Skip nodes outside the symbol
      if (nodeStart > symbolLocation.endLine) {
        return;
      }
    }
    
    // Check for call expressions (JS/TS: call_expression, Java: new_expression, Kotlin: call_expression)
    if (node.type === 'call_expression' || node.type === 'new_expression' || node.type === 'call') {
      const callInfo = extractCallInfo(node);
      if (callInfo) {
        // Deduplicate by name + location
        const key = `${callInfo.name}:${callInfo.location.startLine}:${callInfo.location.startColumn}`;
        if (!seenCalls.has(key)) {
          seenCalls.add(key);
          callees.push(callInfo);
        }
      }
    }
    
    // Recurse into children
    for (const child of node.children) {
      if (child) walkForCalls(child);
    }
  }
  
  walkForCalls(tree.rootNode);
  
  return callees;
}

/**
 * Count callers of a symbol
 */
export async function countCallers(
  symbolPath: string,
  definitionPath: string,
  definitionContent: string,
  searchPath: string
): Promise<number> {
  const callers = await getCallers(symbolPath, definitionPath, definitionContent, searchPath);
  return callers.length;
}

/**
 * Count callees in a symbol
 */
export async function countCallees(
  content: string,
  language: SupportedLanguage,
  symbolPath: string
): Promise<number> {
  const callees = await getCallees(content, language, symbolPath);
  return callees.length;
}
