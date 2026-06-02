/**
 * Tools Module Index
 *
 * Auto-registers all tool modules by convention.
 * Each *-tools.ts file must export a `register*Tools(context: ToolContext): void` function.
 * Adding a new tool file? Just follow the naming pattern — no index edits needed.
 */

import type { ToolContext } from "./types.js";

const TOOL_MODULES = [
  import("./file-tools.js"),
  import("./directory-tools.js"),
  import("./search-tools.js"),
  import("./semantic-tools.js"),
  import("./analysis-tools.js"),
  import("./editing-tools.js"),
  import("./undo-tools.js"),
  import("./server-stats-tools.js"),
] as const;

const REGISTRY = new Map<string, (ctx: ToolContext) => void>();
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  const mods = await Promise.all(TOOL_MODULES);
  for (const mod of mods) {
    for (const [key, val] of Object.entries(mod)) {
      if (key.startsWith("register") && key.endsWith("Tools") && typeof val === "function") {
        REGISTRY.set(key, val as (ctx: ToolContext) => void);
      }
    }
  }
  loaded = true;
}

export async function registerAllToolsAsync(context: ToolContext): Promise<void> {
  await ensureLoaded();
  for (const regFn of REGISTRY.values()) {
    regFn(context);
  }
}

export type { ToolContext, ToolFactories, ToolRegistrar } from "./types.js";

// Synchronous registration (for backward compat — all modules eagerly imported)
import { registerFileTools } from "./file-tools.js";
import { registerDirectoryTools } from "./directory-tools.js";
import { registerSearchTools } from "./search-tools.js";
import { registerSemanticTools } from "./semantic-tools.js";
import { registerAnalysisTools } from "./analysis-tools.js";
import { registerEditingTools } from "./editing-tools.js";
import { registerUndoTools } from "./undo-tools.js";
import { registerServerStatsTools } from "./server-stats-tools.js";

export {
  registerFileTools,
  registerDirectoryTools,
  registerSearchTools,
  registerSemanticTools,
  registerAnalysisTools,
  registerEditingTools,
  registerUndoTools,
  registerServerStatsTools,
};

export function registerAllTools(context: ToolContext): void {
  registerFileTools(context);
  registerDirectoryTools(context);
  registerSearchTools(context);
  registerSemanticTools(context);
  registerAnalysisTools(context);
  registerEditingTools(context);
  registerUndoTools(context);
  registerServerStatsTools(context);
}