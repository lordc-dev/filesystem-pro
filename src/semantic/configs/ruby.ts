import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

export const rubyConfig: LanguageConfig = {
  symbolNodes: {
    class: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    module: {
      kind: SymbolKind.Namespace,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    method: {
      kind: SymbolKind.Method,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    singleton_method: {
      kind: SymbolKind.Method,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: [],
  stringTypes: ["string_literal", "string_content"],
};