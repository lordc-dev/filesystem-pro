/**
 * Language Configuration
 * 
 * Mappings from tree-sitter node types to SymbolKind for each supported language.
 * These mappings define how AST nodes are interpreted as code symbols.
 * 
 * Module Structure:
 * - language-config-types.ts - Type definitions (NodeTypeConfig, LanguageConfig)
 * - configs/                  - Individual language configurations
 *   - typescript.ts, javascript.ts, python.ts, rust.ts, go.ts, java.ts, c.ts, cpp.ts, kotlin.ts
 * - language-config.ts        - This file (LANGUAGE_CONFIGS map and utilities)
 */

import type { SupportedLanguage } from "./types.js";
import { ConfigError } from "../errors/index.js";

// Re-export types for backwards compatibility
export type { NodeTypeConfig, LanguageConfig } from "./language-config-types.js";

// Import all language configurations
import {
  typescriptConfig,
  javascriptConfig,
  pythonConfig,
  rustConfig,
  goConfig,
  javaConfig,
  cConfig,
  cppConfig,
  kotlinConfig,
  bashConfig,
  cSharpConfig,
  rubyConfig,
  phpConfig,
  htmlConfig,
  cssConfig,
  scalaConfig,
  swiftConfig,
} from "./configs/index.js";

import type { LanguageConfig, NodeTypeConfig } from "./language-config-types.js";

/**
 * Map of language to configuration
 */
export const LANGUAGE_CONFIGS: Record<SupportedLanguage, LanguageConfig> = {
  typescript: typescriptConfig,
  tsx: typescriptConfig,
  javascript: javascriptConfig,
  jsx: javascriptConfig,
  python: pythonConfig,
  rust: rustConfig,
  go: goConfig,
  java: javaConfig,
  c: cConfig,
  cpp: cppConfig,
  kotlin: kotlinConfig,
  bash: bashConfig,
  c_sharp: cSharpConfig,
  ruby: rubyConfig,
  php: phpConfig,
  html: htmlConfig,
  css: cssConfig,
  scala: scalaConfig,
  swift: swiftConfig,
};

/**
 * Get configuration for a language
 */
export function getLanguageConfig(language: SupportedLanguage): LanguageConfig {
  const config = LANGUAGE_CONFIGS[language];
  if (!config) {
    throw new ConfigError("language-config", `no config for ${language}`);
  }
  return config;
}

/**
 * Check if a node type is a symbol in the given language
 */
export function isSymbolNode(language: SupportedLanguage, nodeType: string): boolean {
  const config = getLanguageConfig(language);
  return nodeType in config.symbolNodes;
}

/**
 * Get node configuration for a symbol type
 */
export function getNodeConfig(
  language: SupportedLanguage,
  nodeType: string
): NodeTypeConfig | undefined {
  const config = getLanguageConfig(language);
  return config.symbolNodes[nodeType];
}