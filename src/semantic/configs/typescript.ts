/**
 * TypeScript/TSX Language Configuration
 */

import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

/**
 * TypeScript/TSX configuration
 */
export const typescriptConfig: LanguageConfig = {
  symbolNodes: {
    // Classes
    class_declaration: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      childContainers: ["class_body"],
      hasExport: true,
    },
    abstract_class_declaration: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      childContainers: ["class_body"],
      hasExport: true,
    },
    
    // Interfaces
    interface_declaration: {
      kind: SymbolKind.Interface,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      hasExport: true,
    },
    
    // Type aliases
    type_alias_declaration: {
      kind: SymbolKind.TypeParameter,
      nameField: "name",
      bodyField: "value",
      canHaveChildren: false,
      hasExport: true,
    },
    
    // Enums
    enum_declaration: {
      kind: SymbolKind.Enum,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      hasExport: true,
    },
    
    // Functions
    function_declaration: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
      hasExport: true,
    },
    generator_function_declaration: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
      hasExport: true,
    },
    
    // Arrow functions (when assigned to variable)
    lexical_declaration: {
      kind: SymbolKind.Variable,
      nameField: "declarator",
      canHaveChildren: false,
      hasExport: true,
    },
    
    // Methods
    method_definition: {
      kind: SymbolKind.Method,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
      hasVisibility: true,
      hasStatic: true,
    },
    public_field_definition: {
      kind: SymbolKind.Field,
      nameField: "name",
      canHaveChildren: false,
      hasVisibility: true,
      hasStatic: true,
    },
    
    // Properties in interfaces/types
    property_signature: {
      kind: SymbolKind.Property,
      nameField: "name",
      canHaveChildren: false,
    },
    method_signature: {
      kind: SymbolKind.Method,
      nameField: "name",
      canHaveChildren: false,
    },
    
    // Namespace/Module
    module_declaration: {
      kind: SymbolKind.Module,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      hasExport: true,
    },
    internal_module: {
      kind: SymbolKind.Namespace,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      hasExport: true,
    },
    
    // Enum members
    enum_assignment: {
      kind: SymbolKind.EnumMember,
      nameField: "name",
      canHaveChildren: false,
    },
  },
  commentTypes: ["comment", "multiline_comment"],
  decoratorTypes: ["decorator"],
  stringTypes: ["string", "template_string"],
};
