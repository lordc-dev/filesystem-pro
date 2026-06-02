import { SymbolKind } from "../types.js";
import type { LanguageConfig } from "../language-config-types.js";

export const bashConfig: LanguageConfig = {
  symbolNodes: {
    function_definition: {
      kind: SymbolKind.Function,
      nameField: "name",
      bodyField: "body",
      canHaveChildren: false,
    },
    variable_assignment: {
      kind: SymbolKind.Variable,
      nameField: "name",
      canHaveChildren: false,
    },
  },
  commentTypes: ["comment"],
  decoratorTypes: [],
  stringTypes: ["raw_string", "simple_expansion", "string_expansion"],
};