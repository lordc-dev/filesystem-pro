/**
 * JavaScript/JSX Language Configuration
 */

import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

/**
 * JavaScript/JSX configuration
 */
export const javascriptConfig: LanguageConfig = {
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
    
    // Variable declarations (includes arrow functions)
    lexical_declaration: {
      kind: SymbolKind.Variable,
      nameField: "declarator",
      canHaveChildren: false,
      hasExport: true,
    },
    variable_declaration: {
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
      hasStatic: true,
    },
    field_definition: {
      kind: SymbolKind.Field,
      nameField: "property",
      canHaveChildren: false,
      hasStatic: true,
    },
  },
  commentTypes: ["comment", "multiline_comment"],
  decoratorTypes: ["decorator"],
  stringTypes: ["string", "template_string"],
};
