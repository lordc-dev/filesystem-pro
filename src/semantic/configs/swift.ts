import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

export const swiftConfig: LanguageConfig = {
  symbolNodes: {
    class_declaration: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    struct_declaration: {
      kind: SymbolKind.Struct,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    enum_declaration: {
      kind: SymbolKind.Enum,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    protocol_declaration: {
      kind: SymbolKind.Interface,
      nameField: "name",
      canHaveChildren: true,
    },
    function_declaration: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    property_declaration: {
      kind: SymbolKind.Field,
      nameField: "name",
      canHaveChildren: false,
    },
    extension_declaration: {
      kind: SymbolKind.Namespace,
      nameField: "name",
      canHaveChildren: true,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: [],
  stringTypes: ["string_literal"],
};