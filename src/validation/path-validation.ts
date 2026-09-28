/**
 * Validates and resolves a path for filesystem operations.
 * 
 * Provides basic path safety checks and normalization.
 * Integrates with MCP Roots Protocol for access control.
 */

import path from "path";
import fs from "fs/promises";
import { PathValidationError, ECODE } from "../errors/index.js";
import { normalizePath, resolvePath, parseFileUri, cachedRealpath } from "./path-utils.js";
import { validatePathAgainstRootsAsync } from "./roots-manager.js";
import { matchDenyPath, logIfOutsideCwd } from "./access-control.js";

export interface ValidatePathOptions {
  /**
   * When true, bypass the realpath cache and resolve symlinks directly
   * via fs.realpath(). Recommended for security-critical operations to
   * eliminate the TOCTOU window from cached realpath (CWE-363/367).
   *
   * Defaults to true for maximum security. Set to false for read-heavy
   * hot paths where the 1s TOCTOU window is acceptable.
   *
   * @default true
   */
  bypassCache?: boolean;
}

/**
 * Assert every descendant of `dir` passes the deny-list (SSOT for
 * recursive operations: copy/move/delete/chmod must refuse a tree that
 * contains a denied path — validating only the root leaves descendants
 * unchecked). Does NOT follow symlinks (readdir Dirent classifies links as
 * links, not dirs) — callers that skip links stay safe.
 * When `destRoot` is given, ALSO checks the path each descendant would
 * PROJECT to under it (copy/move write there) — a deny rule naming a
 * concrete path inside the destination must block the operation.
 * Roots containment is inherited from the parent (already validated);
 * only the deny-list can name paths INSIDE an allowed root.
 * Fail-closed caps: >MAX_ENTRIES or >MAX_DEPTH throws (same policy as
 * the chmod walk) — a runaway tree must not exhaust resources.
 */
export async function assertTreeAllowed(dir: string, destRoot?: string): Promise<void> {
  const MAX_ENTRIES = 10_000;
  const MAX_DEPTH = 32;
  let count = 0;
  const walk = async (d: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) throw new Error(`assertTreeAllowed: recursion depth > ${MAX_DEPTH} at ${d}`);
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      if (++count > MAX_ENTRIES) throw new Error(`assertTreeAllowed: more than ${MAX_ENTRIES} entries under ${dir} — narrow the path`);
      const p = path.join(d, entry.name);
      const denied = matchDenyPath(p);
      if (denied) {
        throw new PathValidationError(p, `Path is denied by MCP_DENY_PATHS (matched: ${denied})`, { code: ECODE.PATH_TRAVERSAL });
      }
      if (destRoot !== undefined) {
        const projected = path.join(destRoot, path.relative(dir, p));
        const deniedDest = matchDenyPath(projected);
        if (deniedDest) {
          throw new PathValidationError(projected, `Destination path is denied by MCP_DENY_PATHS (matched: ${deniedDest})`, { code: ECODE.PATH_TRAVERSAL });
        }
      }
      if (entry.isDirectory()) {
        await walk(p, depth + 1);
      }
    }
  };
  await walk(dir, 1);
}

/**
 * Validates and resolves a path for filesystem operations.
 * 
 * This function:
 * 1. Expands home directory (~)
 * 2. Resolves to absolute path
 * 3. Normalizes the path
 * 4. Validates against MCP roots (if configured)
 * 5. For existing files, resolves symlinks to their real path
 * 6. For new files, verifies parent directory exists
 * 
 * @param requestedPath - The path to validate
 * @param options - Optional configuration
 * @returns Promise resolving to the validated absolute path
 * @throws Error if path is outside allowed roots
 * @throws Error if parent directory doesn't exist for new files
 */
export async function validatePath(requestedPath: string, options?: ValidatePathOptions): Promise<string> {
  const bypassCache = options?.bypassCache ?? true;

  // Deny-list check first — applies regardless of roots state
  const candidate = normalizePath(resolvePath(requestedPath));
  const denied = matchDenyPath(candidate);
  if (denied) {
    throw new PathValidationError(candidate, `Path is denied by MCP_DENY_PATHS (matched: ${denied})`, { code: ECODE.PATH_TRAVERSAL });
  }

  // Use parseFileUri as SSOT for path resolution (handles ~, symlinks, URIs)
  const resolved = await parseFileUri(requestedPath, { bypassCache });
  
  if (resolved) {
    // Re-check deny-list after symlink resolution (symlink may point into denied area)
    const deniedResolved = matchDenyPath(resolved);
    if (deniedResolved) {
      throw new PathValidationError(resolved, `Path is denied by MCP_DENY_PATHS (matched: ${deniedResolved})`, { code: ECODE.PATH_TRAVERSAL });
    }
    logIfOutsideCwd(resolved, "validatePath");
    // Path exists - parseFileUri already resolved symlinks
    // Validate against MCP roots with symlink resolution (throws if not allowed)
    await validatePathAgainstRootsAsync(resolved);
    return resolved;
  }
  
  // Path doesn't exist - fall back to resolvePath for new file creation
  const absolute = resolvePath(requestedPath);
  const normalized = normalizePath(absolute);
  logIfOutsideCwd(normalized, "validatePath");

  // Validate against MCP roots with symlink resolution even for non-existent paths.
  // We validate the parent directory (which must exist) with async symlink resolution,
  // and check the normalized path itself is within root boundaries.
  await validatePathAgainstRootsAsync(normalized);

  // For new files, verify parent directory exists
  const parentDir = path.dirname(normalized);
  let realParentDir: string;
  try {
    realParentDir = bypassCache
      ? await import("fs/promises").then(fs => fs.realpath(parentDir))
      : await cachedRealpath(parentDir);
  } catch (err: unknown) {
    // Preserve the cause: EACCES/ENOTDIR are not "does not exist"
    const code = (err as NodeJS.ErrnoException).code;
    const reason = code && code !== "ENOENT" ? `${code}: ${err instanceof Error ? err.message : String(err)}` : "does not exist";
    throw new PathValidationError(parentDir, `parent directory ${reason}`, { cause: err instanceof Error ? err : undefined });
  }

  // Validate the real parent path too (with symlink resolution)
  try {
    await validatePathAgainstRootsAsync(realParentDir);
  } catch (err: unknown) {
    if (err instanceof PathValidationError) throw err;
    throw new PathValidationError(realParentDir, `parent directory rejected by roots check: ${err instanceof Error ? err.message : String(err)}`, { cause: err instanceof Error ? err : undefined });
  }

  return normalized;
}
