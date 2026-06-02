/**
 * Python Language Configuration
 */

import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

/**
 * Python configuration
 */
export const pythonConfig: LanguageConfig = {
  symbolNodes: {
    // Classes
    class_definition: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      childContainers: ["block"],
    },
    
    // Functions
    function_definition: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    
    // Async functions
    async_function_definition: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    
    // Variables (assignments at module level)
    assignment: {
      kind: SymbolKind.Variable,
      nameField: "left",
      canHaveChildren: false,
    },
    
    // Type aliases (Python 3.12+)
    type_alias_statement: {
      kind: SymbolKind.TypeParameter,
      nameField: "name",
      canHaveChildren: false,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: ["decorator"],
  stringTypes: ["string", "concatenated_string"],
};
