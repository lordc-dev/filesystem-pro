/**
 * Java Language Configuration
 */

import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

/**
 * Java configuration
 */
export const javaConfig: LanguageConfig = {
  symbolNodes: {
    // Classes
    class_declaration: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      hasVisibility: true,
    },
    
    // Interfaces
    interface_declaration: {
      kind: SymbolKind.Interface,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      hasVisibility: true,
    },
    
    // Enums
    enum_declaration: {
      kind: SymbolKind.Enum,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      hasVisibility: true,
    },
    
    // Methods
    method_declaration: {
      kind: SymbolKind.Method,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
      hasVisibility: true,
      hasStatic: true,
    },
    
    // Constructors
    constructor_declaration: {
      kind: SymbolKind.Constructor,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
      hasVisibility: true,
    },
    
    // Fields
    field_declaration: {
      kind: SymbolKind.Field,
      nameField: "declarator",
      canHaveChildren: false,
      hasVisibility: true,
      hasStatic: true,
    },
  },
  commentTypes: ["line_comment", "block_comment"],
  decoratorTypes: ["annotation"],
  stringTypes: ["string_literal"],
};
