/**
 * Language Configuration Types
 * 
 * Type definitions for language-specific AST configurations.
 */

import type { SymbolKind } from "./types.js";

/**
 * Configuration for extracting symbols from a specific node type
 */
export interface NodeTypeConfig {
  /** The SymbolKind this node type maps to */
  kind: SymbolKind;
  /** Field name containing the symbol name (e.g., "name", "declarator") */
  nameField: string;
  /** Field name containing the body (optional) */
  bodyField?: string;
  /** Whether this node can contain child symbols */
  canHaveChildren: boolean;
  /** Additional child node types to check for nested symbols */
  childContainers?: string[];
  /** Whether to extract visibility modifiers */
  hasVisibility?: boolean;
  /** Whether to check for static modifier */
  hasStatic?: boolean;
  /** Whether to check for export */
  hasExport?: boolean;
}

/**
 * Language-specific configuration
 */
export interface LanguageConfig {
  /** Node types that represent symbols */
  symbolNodes: Record<string, NodeTypeConfig>;
  /** Comment node types for documentation extraction */
  commentTypes: string[];
  /** Decorator/annotation node types */
  decoratorTypes: string[];
  /** String literal types for documentation */
  stringTypes: string[];
  /**
   * Reclassify symbols based on parent kind.
   * Key: node type (e.g., "function_declaration")
   * Value: map from parent SymbolKind to override SymbolKind
   * Example: { function_declaration: { [SymbolKind.Class]: SymbolKind.Method } }
   */
  reclassifyWhenInside?: Record<string, Partial<Record<SymbolKind, SymbolKind>>>;
}