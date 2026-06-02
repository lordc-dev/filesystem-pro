/**
 * Go Language Configuration
 */

import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

/**
 * Go configuration
 */
export const goConfig: LanguageConfig = {
  symbolNodes: {
    // Functions
    function_declaration: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    
    // Methods
    method_declaration: {
      kind: SymbolKind.Method,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    
    // Types (struct, interface)
    type_declaration: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "type",
      canHaveChildren: true,
    },
    
    // Interfaces
    interface_type: {
      kind: SymbolKind.Interface,
      nameField: "name",
      canHaveChildren: true,
    },
    
    // Struct
    struct_type: {
      kind: SymbolKind.Struct,
      nameField: "name",
      canHaveChildren: true,
    },
    
    // Variables
    var_declaration: {
      kind: SymbolKind.Variable,
      nameField: "name",
      canHaveChildren: false,
    },
    
    // Constants
    const_declaration: {
      kind: SymbolKind.Constant,
      nameField: "name",
      canHaveChildren: false,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: [],
  stringTypes: ["raw_string_literal", "interpreted_string_literal"],
};
