/**
 * Tools Module Index
 *
 * Single synchronous registration path. Each *-tools.ts module exports a
 * `register*Tools(context: ToolContext): void` function and is listed in
 * MODULES below — the tool-catalog test fails if a module is missing.
 */

import type { ToolContext } from "./types.js";
import { registerFileTools } from "./file-tools.js";
import { registerDirectoryTools } from "./directory-tools.js";
import { registerSearchTools } from "./search-tools.js";
import { registerSemanticTools } from "./semantic-tools.js";
import { registerAnalysisTools } from "./analysis-tools.js";
import { registerEditingTools } from "./editing-tools.js";
import { registerUndoTools } from "./undo-tools.js";
import { registerServerStatsTools } from "./server-stats-tools.js";

// ponytail: explicit list over dynamic discovery — the catalog test checks
// every *-tools.ts file on disk has an entry here, so a new module cannot
// silently go unregistered.
const MODULES: Array<(ctx: ToolContext) => void> = [
  registerFileTools,
  registerDirectoryTools,
  registerSearchTools,
  registerSemanticTools,
  registerAnalysisTools,
  registerEditingTools,
  registerUndoTools,
  registerServerStatsTools,
];

export function registerAllTools(context: ToolContext): void {
  for (const register of MODULES) {
    register(context);
  }
}

export type { ToolContext, ToolFactories, ToolRegistrar } from "./types.js";