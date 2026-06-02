/**
 * C Language Configuration
 */

import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

/**
 * C configuration
 */
export const cConfig: LanguageConfig = {
  symbolNodes: {
    // Functions
    function_definition: {
      kind: SymbolKind.Function,
      nameField: "declarator",
      bodyField: "body",
      canHaveChildren: false,
    },
    
    // Function declarations (prototypes)
    declaration: {
      kind: SymbolKind.Function,
      nameField: "declarator",
      canHaveChildren: false,
    },
    
    // Structs
    struct_specifier: {
      kind: SymbolKind.Struct,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    
    // Enums
    enum_specifier: {
      kind: SymbolKind.Enum,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    
    // Type definitions
    type_definition: {
      kind: SymbolKind.TypeParameter,
      nameField: "declarator",
      canHaveChildren: false,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: [],
  stringTypes: ["string_literal"],
};
