/**
 * Config Module
 *
 * Centralized configuration for server behavior.
 * SSOT: runtime-config.ts (env vars + file config + defaults)
 *
 * IMPORTANT: loadConfig() must be called at server startup before any
 * config-dependent operations. After loadConfig() resolves, the config
 * singleton is populated and all getter functions below return correct values.
 * Before loadConfig(), getters return defaults + env-only overrides.
 *
 * Exported getter functions (not constants) ensure values always reflect the
 * latest resolved config — including config file values loaded by loadConfig().
 */

export {
  loadConfig,
  getConfig,
  resetConfig,
  type RuntimeConfig,
  type RootsConfig,
  type CacheConfig,
  type UndoConfig,
  type SearchConfig,
  type FileReadConfig,
  type StalenessGuardConfig,
} from "./runtime-config.js";

import { getConfig } from "./runtime-config.js";

/**
 * Whether roots restriction is enabled.
 * Always reads from resolved config — reflects loadConfig() changes.
 */
export function isRootsRestrictionEnabled(): boolean {
  return getConfig().roots.enabled;
}

/**
 * Whether to log roots protocol events.
 * Always reads from resolved config.
 */
export function shouldLogRootsEvents(): boolean {
  const config = getConfig();
  return config.debug || config.roots.enabled;
}