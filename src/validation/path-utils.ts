/**
 * Path utilities for Unix/macOS systems
 * Simplified version - Windows/WSL handling removed
 * 
 * SSOT for all path manipulation and URI parsing.
 */

import path from "path";
import os from "os";
import fs from "fs/promises";
import { fileURLToPath } from "url";

/**
 * Normalizes a Unix path by:
 * - Removing surrounding quotes and whitespace
 * - Normalizing multiple slashes
 * - Removing trailing slashes
 * 
 * @param p - The path to normalize
 * @returns Normalized path
 */
export function normalizePath(p: string): string {
  // Remove surrounding quotes and whitespace
  let normalized = p.trim().replace(/^("|')(.*?)\1$/s, "$2").trim();
  
  // Use Node's path normalization
  normalized = path.normalize(normalized);
  
  // Remove trailing slashes (except for root)
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}

/**
 * Expands home directory tildes in paths
 * 
 * @param filepath - The path to expand
 * @returns Expanded path with ~ replaced by home directory
 * 
 * @example
 * expandHome("~/Documents") => "/Users/username/Documents"
 * expandHome("~") => "/Users/username"
 */
export function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Resolves a path to an absolute path, expanding home directory if needed
 * 
 * @param filepath - The path to resolve
 * @returns Absolute path
 */
export function resolvePath(filepath: string): string {
  const expanded = expandHome(filepath);
  return path.isAbsolute(expanded) 
    ? path.resolve(expanded)
    : path.resolve(process.cwd(), expanded);
}

/**
 * Parse a file:// URI or plain path to a validated filesystem path (SSOT)
 * 
 * This is the single source of truth for URI/path parsing.
 * Handles:
 * - file:// URIs (using Node's fileURLToPath for correctness)
 * - Plain filesystem paths
 * - Home directory expansion (~)
 * - Symlink resolution
 * 
 * @param uri - File URI (file://...) or plain directory path
 * @returns Promise resolving to validated real path, or null if invalid/inaccessible
 * 
 * @example
 * parseFileUri("file:///Users/name/project") => "/Users/name/project"
 * parseFileUri("~/Documents") => "/Users/name/Documents"
 * parseFileUri("/nonexistent") => null
 */
const realpathCache = new Map<string, { value: string; timestamp: number }>();
const REALPATH_CACHE_MAX_SIZE = 500;
const REALPATH_CACHE_TTL = 1_000;

/**
 * Cached realpath resolution with LRU eviction.
 *
 * SECURITY NOTE: The TTL introduces a TOCTOU window — if an external process
 * modifies a symlink between the cache hit and the subsequent fs operation, the
 * server may operate on a stale (now-different) target. In the MCP server context
 * this risk is low (single-user, tool-invocation granularity), but callers handling
 * security-critical paths (writes, deletes) should call `fs.realpath` directly
 * or invalidate the cache via `invalidateRealpathCache()` before the operation.
 *
 * TTL reduced from 5s to 1s to narrow the TOCTOU window (security audit finding #1).
 */
export async function cachedRealpath(p: string): Promise<string> {
  const now = Date.now();
  const cached = realpathCache.get(p);
  if (cached) {
    if (now - cached.timestamp < REALPATH_CACHE_TTL) {
      // Move to end (most recently used) — LRU via Map insertion order
      realpathCache.delete(p);
      realpathCache.set(p, cached);
      return cached.value;
    }
    realpathCache.delete(p);
  }
  const real = await fs.realpath(p);
  if (realpathCache.size >= REALPATH_CACHE_MAX_SIZE) {
    // Evict oldest entry (least recently used due to delete+reinsert LRU pattern)
    const oldestKey = realpathCache.keys().next().value;
    if (oldestKey !== undefined) realpathCache.delete(oldestKey);
  }
  realpathCache.set(p, { value: real, timestamp: now });
  return real;
}

/**
 * Invalidate cached realpath for a specific path.
 * Call after file writes (atomicWrite, etc.) to ensure symlink
 * resolution stays fresh.
 */
export function invalidateRealpathCache(p?: string): void {
  if (p) {
    realpathCache.delete(p);
  } else {
    realpathCache.clear();
  }
}

export async function parseFileUri(uri: string, options?: { bypassCache?: boolean }): Promise<string | null> {
  const bypassCache = options?.bypassCache ?? false;
  try {
    let rawPath: string;

    if (uri.startsWith("file://")) {
      rawPath = fileURLToPath(uri);
    } else {
      rawPath = uri;
    }

    const expandedPath = expandHome(rawPath);
    const absolutePath = path.resolve(expandedPath);
    const realPath = bypassCache
      ? await fs.realpath(absolutePath)
      : await cachedRealpath(absolutePath);

    return normalizePath(realPath);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
        throw new Error(`Permission denied: ${nodeError.path ?? uri}`, { cause: error });
      }
      if (nodeError.code === 'ENOENT') {
        return null;
      }
    }
    // For dangling symlinks and other unexpected errors, throw instead of silently returning null
    // This prevents treating inaccessible paths as "new file creation" which is a security risk
    throw new Error(`Failed to resolve path: ${uri}`, { cause: error });
  }
}
