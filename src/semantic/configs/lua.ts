import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

export const luaConfig: LanguageConfig = {
  symbolNodes: {
    function_declaration: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    variable_declaration: {
      kind: SymbolKind.Variable,
      nameField: "name",
      canHaveChildren: false,
    },
    assignment_statement: {
      kind: SymbolKind.Variable,
      nameField: "name",
      canHaveChildren: false,
    },
    for_statement: {
      kind: SymbolKind.Function,
      nameField: "clause",
      bodyField: "body",
      canHaveChildren: true,
    },
    if_statement: {
      kind: SymbolKind.Function,
      nameField: "condition",
      bodyField: "consequence",
      canHaveChildren: true,
    },
    while_statement: {
      kind: SymbolKind.Function,
      nameField: "condition",
      bodyField: "body",
      canHaveChildren: true,
    },
    repeat_statement: {
      kind: SymbolKind.Function,
      nameField: "condition",
      bodyField: "body",
      canHaveChildren: true,
    },
    table_constructor: {
      kind: SymbolKind.Object,
      nameField: "key",
      canHaveChildren: true,
      childContainers: ["field"],
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: [],
  stringTypes: ["string"],
};