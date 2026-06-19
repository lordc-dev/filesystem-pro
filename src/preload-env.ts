/**
 * Environment Preloader — MUST be the first import in the entry point.
 *
 * esbuild hoists and reorders ESM imports before module-level statements.
 * If `dotenv.config()` lives in index.ts as a statement (not an import),
 * it runs AFTER other modules' init code that calls `getConfig()`,
 * caching stale env values. This module ensures `.env` is loaded before
 * any config-dependent module initializes.
 *
 * `import "dotenv/config"` is a side-effect import — esbuild preserves
 * side-effect import execution order relative to other imports.
 */

import dotenv from "dotenv";

dotenv.config();