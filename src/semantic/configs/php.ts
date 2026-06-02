import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

export const phpConfig: LanguageConfig = {
  symbolNodes: {
    class_declaration: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    interface_declaration: {
      kind: SymbolKind.Interface,
      nameField: "name",
      canHaveChildren: true,
    },
    trait_declaration: {
      kind: SymbolKind.Struct,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    function_definition: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    method_declaration: {
      kind: SymbolKind.Method,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    enum_declaration: {
      kind: SymbolKind.Enum,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    namespace_declaration: {
      kind: SymbolKind.Namespace,
      nameField: "name",
      canHaveChildren: true,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: ["attribute"],
  stringTypes: ["string_literal"],
};