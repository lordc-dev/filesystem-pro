/**
 * Kotlin Language Configuration
 */

import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

/**
 * Kotlin configuration
 *
 * Maps tree-sitter-kotlin AST node types to SymbolKind values.
 * Based on tree-sitter-kotlin grammar.
 *
 * Note: tree-sitter-kotlin does NOT use named field names for most nodes.
 * Names appear as direct child nodes:
 * - class_declaration / object_declaration: type_identifier
 * - function_declaration: simple_identifier
 * - enum_entry: simple_identifier
 * - property_declaration: variable_declaration > simple_identifier
 *
 * We use nameField values that the fallback in getSymbolName() can handle,
 * and rely on the identifier-type fallback (identifier, type_identifier,
 * simple_identifier) rather than childForFieldName.
 */
export const kotlinConfig: LanguageConfig = {
  symbolNodes: {
    class_declaration: {
      kind: SymbolKind.Class,
      nameField: "type_identifier",
      bodyField: "class_body",
      canHaveChildren: true,
      childContainers: ["class_body"],
      hasVisibility: true,
    },

    interface_declaration: {
      kind: SymbolKind.Interface,
      nameField: "type_identifier",
      bodyField: "class_body",
      canHaveChildren: true,
      childContainers: ["class_body"],
      hasVisibility: true,
    },

    object_declaration: {
      kind: SymbolKind.Class,
      nameField: "type_identifier",
      bodyField: "class_body",
      canHaveChildren: true,
      childContainers: ["class_body"],
      hasVisibility: true,
    },

    enum_entry: {
      kind: SymbolKind.EnumMember,
      nameField: "simple_identifier",
      canHaveChildren: false,
    },

    function_declaration: {
      kind: SymbolKind.Function,
      nameField: "simple_identifier",
      bodyField: "function_body",
      canHaveChildren: false,
      hasVisibility: true,
      hasStatic: true,
    },

    secondary_constructor: {
      kind: SymbolKind.Constructor,
      nameField: "simple_identifier",
      canHaveChildren: false,
      hasVisibility: true,
    },

    property_declaration: {
      kind: SymbolKind.Property,
      nameField: "variable_declaration",
      canHaveChildren: false,
      hasVisibility: true,
      hasStatic: true,
    },

    variable_declaration: {
      kind: SymbolKind.Variable,
      nameField: "simple_identifier",
      canHaveChildren: false,
    },

    type_alias: {
      kind: SymbolKind.TypeParameter,
      nameField: "type_identifier",
      canHaveChildren: false,
    },

    getter: {
      kind: SymbolKind.Method,
      nameField: "simple_identifier",
      canHaveChildren: false,
    },

    setter: {
      kind: SymbolKind.Method,
      nameField: "simple_identifier",
      canHaveChildren: false,
    },
  },
  commentTypes: ["line_comment", "multiline_comment"],
  decoratorTypes: ["annotation"],
  stringTypes: ["string_literal", "character_literal", "interpolated_expression"],
  reclassifyWhenInside: {
    function_declaration: {
      [SymbolKind.Class]: SymbolKind.Method,
      [SymbolKind.Interface]: SymbolKind.Method,
    },
    property_declaration: {
      [SymbolKind.Class]: SymbolKind.Field,
      [SymbolKind.Interface]: SymbolKind.Field,
    },
  },
};