import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

export const cSharpConfig: LanguageConfig = {
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
    interface_declaration: {
      kind: SymbolKind.Interface,
      nameField: "name",
      canHaveChildren: true,
    },
    enum_declaration: {
      kind: SymbolKind.Enum,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    method_declaration: {
      kind: SymbolKind.Method,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    constructor_declaration: {
      kind: SymbolKind.Constructor,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    field_declaration: {
      kind: SymbolKind.Field,
      nameField: "declarator",
      canHaveChildren: false,
    },
    namespace_declaration: {
      kind: SymbolKind.Namespace,
      nameField: "name",
      canHaveChildren: true,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: ["attribute_list"],
  stringTypes: ["string_literal"],
};