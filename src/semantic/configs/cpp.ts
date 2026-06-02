/**
 * C++ Language Configuration
 */

import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";
import { cConfig } from "./c.js";

/**
 * C++ configuration (extends C)
 */
export const cppConfig: LanguageConfig = {
  symbolNodes: {
    ...cConfig.symbolNodes,
    
    // Classes
    class_specifier: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
      hasVisibility: true,
    },
    
    // Namespaces
    namespace_definition: {
      kind: SymbolKind.Namespace,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    
    // Templates
    template_declaration: {
      kind: SymbolKind.TypeParameter,
      nameField: "name",
      canHaveChildren: true,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: [],
  stringTypes: ["string_literal", "raw_string_literal"],
};
