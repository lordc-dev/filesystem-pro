/**
 * Runtime Configuration Loader
 *
 * Loads and validates configuration from:
 * 1. Environment variables (highest priority)
 * 2. Config file (JSON, specified via MCP_CONFIG_FILE)
 * 3. Defaults from constants.ts (lowest priority)
 *
 * Config file format (mcp-filesystem.config.json):
 * ```json
 * {
 *   "roots": { "enabled": true },
 *   "cache": { "symbolCacheSize": 200, "symbolCacheTtlMs": 120000 },
 *   "undo": { "maxStackSize": 200, "persistDir": "/tmp/mcp-undo" },
 *   "search": { "maxResults": 200, "excludeDirs": ["node_modules", "dist"], "maxOutputBytes": 2097152 },
 *   "fileRead": { "maxFileSizeBytes": 52428800 },
 *   "stalenessGuard": { "enabled": true },
 *   "debug": false,
 * }
 * ```
 */

import fs from "fs/promises";
import { z } from "zod";
import { logger } from "../utils/logger.js";

// ============================================================================
// TYPES
// ============================================================================

export interface RootsConfig {
  enabled: boolean;
}

export interface CacheConfig {
  symbolCacheSize: number;
  symbolCacheTtlMs: number;
  astCacheSize: number;
  astCacheTtlMs: number;
  disabled: boolean;
}

export interface UndoConfig {
  maxStackSize: number;
  maxEntrySizeBytes: number;
  persistDir: string;
}

export interface SearchConfig {
  maxResults: number;
  excludeDirs: string[];
  maxOutputBytes: number;
}

export interface FileReadConfig {
  maxFileSizeBytes: number;
}

export interface StalenessGuardConfig {
  enabled: boolean;
}

export interface RuntimeConfig {
  roots: RootsConfig;
  cache: CacheConfig;
  undo: UndoConfig;
  search: SearchConfig;
  fileRead: FileReadConfig;
  stalenessGuard: StalenessGuardConfig;
  debug: boolean;
}

const RuntimeConfigSchema = z.object({
  roots: z.object({
    enabled: z.boolean(),
  }),
  cache: z.object({
    symbolCacheSize: z.number().int().positive(),
    symbolCacheTtlMs: z.number().int().positive(),
    astCacheSize: z.number().int().positive(),
    astCacheTtlMs: z.number().int().positive(),
    disabled: z.boolean(),
  }),
  undo: z.object({
    maxStackSize: z.number().int().positive(),
    maxEntrySizeBytes: z.number().int().positive(),
    persistDir: z.string(),
  }),
  search: z.object({
    maxResults: z.number().int().positive(),
    excludeDirs: z.array(z.string()),
    maxOutputBytes: z.number().int().positive(),
  }),
  fileRead: z.object({
    maxFileSizeBytes: z.number().int().positive(),
  }),
  stalenessGuard: z.object({
    enabled: z.boolean(),
  }),
  debug: z.boolean(),
});

const DEFAULT_CONFIG: RuntimeConfig = {
  roots: { enabled: true },
  cache: {
    symbolCacheSize: 100,
    symbolCacheTtlMs: 60000,
    astCacheSize: 25,
    astCacheTtlMs: 60000,
    disabled: false,
  },
  undo: { maxStackSize: 100, maxEntrySizeBytes: 1_000_000, persistDir: "" },
  search: { maxResults: 100, excludeDirs: ["node_modules", "dist", ".git", "build", "coverage"], maxOutputBytes: 2 * 1024 * 1024 },
  fileRead: { maxFileSizeBytes: 50 * 1024 * 1024 },
  stalenessGuard: { enabled: true },
  debug: false,
};

// ============================================================================
// FILE LOADER
// ============================================================================

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function loadConfigFile(configPath: string): Promise<Partial<RuntimeConfig> | null> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    logger.info(`[Config] Loaded config from ${configPath}`);
    return parsed;
  } catch (error: unknown) {
    if (isErrnoException(error)) {
      if (error.code === "ENOENT") {
        logger.debug?.(`[Config] Config file not found: ${configPath}`);
      } else if (error.code === "EACCES" || error.code === "EPERM") {
        logger.warn(`[Config] Permission denied reading config file: ${configPath}`);
      } else {
        logger.warn(`[Config] Failed to load config file ${configPath}: ${error}`);
      }
    }
    return null;
  }
}

// ============================================================================
// ENV OVERRIDE EXTRACTOR
// ============================================================================

function parseIntEnv(value: string | undefined, fieldName: string): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    logger.warn(`[Config] Invalid integer for ${fieldName}: "${value}" — ignoring`);
    return undefined;
  }
  return parsed;
}

function applyEnvOverrides(config: RuntimeConfig): RuntimeConfig {
  const c = { ...config };

  c.roots = { ...config.roots };
  c.cache = { ...config.cache };
  c.undo = { ...config.undo };
  c.search = { ...config.search };
  c.fileRead = { ...config.fileRead };
  c.stalenessGuard = { ...config.stalenessGuard };

  c.roots.enabled = process.env.MCP_ROOTS_RESTRICTION !== "0" && process.env.MCP_ROOTS_RESTRICTION !== "false" && c.roots.enabled;
  c.debug = process.env.DEBUG_MCP === "true" || process.env.MCP_DEBUG === "true" || c.debug;
  c.stalenessGuard.enabled = process.env.MCP_STALENESS_GUARD !== "0" && process.env.MCP_STALENESS_GUARD !== "false" && c.stalenessGuard.enabled;
  c.cache.disabled = process.env.MCP_CACHE_DISABLED === "true" || c.cache.disabled;

  const cacheSize = parseIntEnv(process.env.MCP_SYMBOL_CACHE_SIZE, "MCP_SYMBOL_CACHE_SIZE");
  if (cacheSize !== undefined) c.cache.symbolCacheSize = cacheSize;
  const cacheTtl = parseIntEnv(process.env.MCP_SYMBOL_CACHE_TTL, "MCP_SYMBOL_CACHE_TTL");
  if (cacheTtl !== undefined) c.cache.symbolCacheTtlMs = cacheTtl;
  const astSize = parseIntEnv(process.env.MCP_AST_CACHE_SIZE, "MCP_AST_CACHE_SIZE");
  if (astSize !== undefined) c.cache.astCacheSize = astSize;
  const astTtl = parseIntEnv(process.env.MCP_AST_CACHE_TTL, "MCP_AST_CACHE_TTL");
  if (astTtl !== undefined) c.cache.astCacheTtlMs = astTtl;
  const undoSize = parseIntEnv(process.env.MCP_UNDO_STACK_SIZE, "MCP_UNDO_STACK_SIZE");
  if (undoSize !== undefined) c.undo.maxStackSize = undoSize;
  const undoMaxEntry = parseIntEnv(process.env.MCP_UNDO_MAX_ENTRY_BYTES, "MCP_UNDO_MAX_ENTRY_BYTES");
  if (undoMaxEntry !== undefined) c.undo.maxEntrySizeBytes = undoMaxEntry;
  if (process.env.MCP_UNDO_PERSIST_DIR) {
    c.undo.persistDir = process.env.MCP_UNDO_PERSIST_DIR;
  }
  const maxFileSize = parseIntEnv(process.env.MCP_MAX_FILE_SIZE_BYTES, "MCP_MAX_FILE_SIZE_BYTES");
  if (maxFileSize !== undefined) c.fileRead.maxFileSizeBytes = maxFileSize;
  const maxOutput = parseIntEnv(process.env.MCP_MAX_SEARCH_OUTPUT_BYTES, "MCP_MAX_SEARCH_OUTPUT_BYTES");
  if (maxOutput !== undefined) c.search.maxOutputBytes = maxOutput;

  const validated = RuntimeConfigSchema.safeParse(c);
  if (!validated.success) {
    const issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    logger.warn(`[Config] Validation issues after env overrides: ${issues}. Using current config as fallback.`);
    return c;
  }
  return validated.data;
}

// ============================================================================
// DEEP MERGE
// ============================================================================

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result: Record<string, unknown> = JSON.parse(JSON.stringify(base));
  for (const key of Object.keys(override)) {
    const overrideVal = override[key as keyof T];
    const baseVal = result[key];
    if (
      isObject(overrideVal) &&
      isObject(baseVal)
    ) {
      result[key] = deepMerge(baseVal, overrideVal as Partial<object>);
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }
  return result as T;
}

// ============================================================================
// LOAD & RESOLVE
// ============================================================================

let resolvedConfig: RuntimeConfig | null = null;

export async function loadConfig(): Promise<RuntimeConfig> {
  if (resolvedConfig) return resolvedConfig;

  let config = { ...DEFAULT_CONFIG };

  const configPath = process.env.MCP_CONFIG_FILE;
  if (configPath) {
    const fileConfig = await loadConfigFile(configPath);
    if (fileConfig) {
      const merged = deepMerge<RuntimeConfig>(config, fileConfig);
      const validated = RuntimeConfigSchema.safeParse(merged);
      if (!validated.success) {
        const issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
        logger.warn(`[Config] File config validation issues: ${issues}. Using current config as fallback.`);
      } else {
        config = validated.data;
      }
    }
  }

  config = applyEnvOverrides(config);
  resolvedConfig = config;
  return config;
}

export function getConfig(): RuntimeConfig {
  if (resolvedConfig) return resolvedConfig;
  // Lazy init: apply defaults + env overrides when first accessed (before loadConfig())
  logger.debug?.("[Config] getConfig() called before loadConfig() — using defaults + env overrides");
  resolvedConfig = applyEnvOverrides({ ...DEFAULT_CONFIG });
  return resolvedConfig;
}

export function resetConfig(): void {
  resolvedConfig = null;
}
