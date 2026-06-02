import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

export const scalaConfig: LanguageConfig = {
  symbolNodes: {
    class_definition: {
      kind: SymbolKind.Class,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    trait_definition: {
      kind: SymbolKind.Interface,
      nameField: "name",
      canHaveChildren: true,
    },
    object_definition: {
      kind: SymbolKind.Class,
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
    val_definition: {
      kind: SymbolKind.Variable,
      nameField: "name",
      canHaveChildren: false,
    },
    var_definition: {
      kind: SymbolKind.Variable,
      nameField: "name",
      canHaveChildren: false,
    },
    type_definition: {
      kind: SymbolKind.TypeParameter,
      nameField: "name",
      canHaveChildren: false,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: [],
  stringTypes: ["string_literal"],
};