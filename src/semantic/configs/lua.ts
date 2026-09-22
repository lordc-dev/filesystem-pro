import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

export const luaConfig: LanguageConfig = {
  symbolNodes: {
    function_definition_statement: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    local_function_definition_statement: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    function_definition: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    local_variable_declaration: {
      kind: SymbolKind.Variable,
      nameField: "name",
      canHaveChildren: false,
    },
    variable_assignment: {
      kind: SymbolKind.Variable,
      nameField: "name",
      canHaveChildren: false,
    },
    for_numeric_statement: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: true,
    },
    for_generic_statement: {
      kind: SymbolKind.Function,
      nameField: "left",
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
    table: {
      kind: SymbolKind.Object,
      nameField: "key",
      canHaveChildren: true,
      childContainers: ["field_list"],
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: [],
  stringTypes: ["string"],
};