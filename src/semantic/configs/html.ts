import type { LanguageConfig } from "../language-config-types.js";

export const htmlConfig: LanguageConfig = {
  symbolNodes: {},
  commentTypes: ["comment"],
  decoratorTypes: ["attribute"],
  stringTypes: ["quoted_attribute_value"],
};