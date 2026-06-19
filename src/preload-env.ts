/**
 * Environment Preloader — MUST be the first import in the entry point.
 *
 * esbuild hoists and reorders ESM imports before module-level statements.
 * If `dotenv.config()` lives in index.ts as a statement (not an import),
 * it runs AFTER other modules' init code that calls `getConfig()`,
 * caching stale env values. This module ensures `.env` is loaded before
 * any config-dependent module initializes.
 *
 * Loads `.env` from the project root (the directory containing this file's
 * parent), NOT from `process.cwd()`. When launched as a child process with
 * an absolute path (e.g. by opencode), cwd points elsewhere and dotenv's
 * default lookup would silently skip the project's `.env`.
 *
 * `import "./preload-env.js"` is a side-effect import — esbuild preserves
 * side-effect import execution order relative to other imports.
 */

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/preload-env.ts → project root is one level up.
const projectRoot = join(__dirname, "..");
const envPath = join(projectRoot, ".env");

dotenv.config({ path: envPath });
