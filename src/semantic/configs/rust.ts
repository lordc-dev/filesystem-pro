/**
 * Rust Language Configuration
 */

import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

/**
 * Rust configuration
 */
export const rustConfig: LanguageConfig = {
  symbolNodes: {
    // Structs
    struct_item: {
      kind: SymbolKind.Struct,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    
    // Enums
    enum_item: {
      kind: SymbolKind.Enum,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    
    // Functions
    function_item: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    
    // Impl blocks
    impl_item: {
      kind: SymbolKind.Class,
      nameField: "type",
      bodyField: "body",
      canHaveChildren: true,
    },
    
    // Traits
    trait_item: {
      kind: SymbolKind.Interface,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    
    // Modules
    mod_item: {
      kind: SymbolKind.Module,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    
    // Type aliases
    type_item: {
      kind: SymbolKind.TypeParameter,
      nameField: "name",
      canHaveChildren: false,
    },
    
    // Constants
    const_item: {
      kind: SymbolKind.Constant,
      nameField: "name",
      canHaveChildren: false,
    },
    
    // Static items
    static_item: {
      kind: SymbolKind.Variable,
      nameField: "name",
      canHaveChildren: false,
    },
  },
  commentTypes: ["line_comment", "block_comment"],
  decoratorTypes: ["attribute_item"],
  stringTypes: ["string_literal", "raw_string_literal"],
};
