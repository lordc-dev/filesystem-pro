/**
 * MCP Roots Protocol Manager
 * 
 * Manages filesystem roots provided by the client.
 * Roots define the boundaries of where the server can operate.
 * 
 * @see https://modelcontextprotocol.io/specification/2025-06-18/client/roots
 */

import path from "path";
import fs from "fs/promises";
import { isRootsRestrictionEnabled, shouldLogRootsEvents, getConfig } from "../config/index.js";
import { parseFileUri, cachedRealpath } from "./path-utils.js";
import { logger } from "../utils/logger.js";
import { PathValidationError, ECODE } from "../errors/index.js";
import { setRootsRestrictedProbe } from "./access-control.js";

export interface Root {
  uri: string;
  name?: string;
}

/** Resolve a configured root (absolute or ~-relative) to a real absolute path. */
async function resolveConfiguredRoot(root: string): Promise<string | null> {
  if (!root) return null;
  const expanded = root.startsWith("~/")
    ? path.join(process.env.HOME ?? "", root.slice(1))
    : root === "~" ? (process.env.HOME ?? "") : root;
  const normalized = path.normalize(expanded);
  try {
    return await fs.realpath(normalized);
  } catch {
    // Root doesn't exist (yet) — keep the normalized form; containment of
    // non-existent paths is handled by the ancestor-realpath fallback.
    return normalized;
  }
}

/** Load operator-configured roots (MCP_ALLOWED_ROOTS), realpath-resolved. */
async function loadConfiguredRoots(): Promise<string[]> {
  const configured = getConfig().roots?.allowedRoots ?? [];
  const resolved = await Promise.all(configured.map(resolveConfiguredRoot));
  return resolved.filter((p): p is string => p !== null);
}

/**
 * Manages allowed filesystem roots from the MCP client.
 *
 * FAIL-CLOSED: when roots restriction is enabled, at least one root must be
 * active (client roots or configured MCP_ALLOWED_ROOTS) before any path is
 * allowed. No roots = deny all, never unrestricted.
 *
 * When roots restriction is disabled (explicit operator opt-out), all paths
 * are allowed (legacy unrestricted mode).
 */
class RootsManager {
  private roots: Root[] = [];
  private resolvedPaths: string[] = [];
  private restrictToRoots: boolean = false;
  private clientRootsReceived: boolean = false;

  /**
   * Update the list of allowed roots
   * Now async to use SSOT parseFileUri from path-utils.ts
   */
  async setRoots(roots: Root[]): Promise<void> {
    if (!isRootsRestrictionEnabled()) {
      if (shouldLogRootsEvents()) {
        logger.info("[RootsManager] Roots restriction disabled via MCP_ROOTS_RESTRICTION=0 - ignoring roots");
      }
      return;
    }

    this.roots = roots;
    this.clientRootsReceived = roots.length > 0;

    // Use SSOT parseFileUri for URI parsing (async)
    const resolvedPromises = roots.map(root => parseFileUri(root.uri));
    const resolved = await Promise.all(resolvedPromises);
    const clientResolved = resolved.filter((p): p is string => p !== null);

    // FALLBACK policy: client roots are the boundary; operator-configured
    // MCP_ALLOWED_ROOTS apply ONLY when the client provides none. FAIL-CLOSED:
    // if neither exists, deny all.
    const configured = clientResolved.length > 0 ? [] : await loadConfiguredRoots();
    const merged = new Set([...clientResolved, ...configured]);
    this.resolvedPaths = [...merged];
    if (shouldLogRootsEvents() && clientResolved.length === 0 && this.resolvedPaths.length > 0) {
      logger.info(`[RootsManager] No client roots - using ${this.resolvedPaths.length} configured root(s) (MCP_ALLOWED_ROOTS)`);
    }

    this.restrictToRoots = true;

    if (shouldLogRootsEvents()) {
      if (this.resolvedPaths.length > 0) {
        logger.info(`[RootsManager] Restricted to ${this.resolvedPaths.length} root(s):`);
        this.resolvedPaths.forEach(p => logger.info(`  - ${p}`));
      } else {
        logger.warn("[RootsManager] FAIL-CLOSED: no client roots and no MCP_ALLOWED_ROOTS configured - denying all paths");
      }
    }
  }

  /**
   * Get the current list of roots
   */
  getRoots(): Root[] {
    return [...this.roots];
  }

  /**
   * Get resolved paths for all roots
   */
  getResolvedPaths(): string[] {
    return [...this.resolvedPaths];
  }

  /**
   * Check if restriction is enabled
   */
  isRestricted(): boolean {
    return this.restrictToRoots;
  }

  /**
   * Whether the client has provided any roots this session.
   */
  hasClientRoots(): boolean {
    return this.clientRootsReceived;
  }

  /**
   * Clear all roots (return to unrestricted mode)
   * Only meaningful when roots restriction is disabled — with restriction
   * enabled, clearing client roots falls back to configured allowedRoots.
   */
  async clearRoots(): Promise<void> {
    this.roots = [];
    this.clientRootsReceived = false;
    if (!isRootsRestrictionEnabled()) {
      this.resolvedPaths = [];
      this.restrictToRoots = false;
      if (shouldLogRootsEvents()) {
        logger.info("[RootsManager] Roots cleared - unrestricted mode");
      }
      return;
    }
    // FAIL-CLOSED: restriction enabled — fall back to configured roots
    this.resolvedPaths = await loadConfiguredRoots();
    this.restrictToRoots = true;
    if (shouldLogRootsEvents()) {
      if (this.resolvedPaths.length > 0) {
        logger.info(`[RootsManager] Client roots cleared - restricted to ${this.resolvedPaths.length} configured root(s)`);
      } else {
        logger.warn("[RootsManager] FAIL-CLOSED: roots cleared with no configured roots - denying all paths");
      }
    }
  }

  /**
   * Async version of isPathAllowed that resolves symlinks.
   * Use this for security-critical path validation.
   * 
   * Resolves symlinks via cachedRealpath to prevent symlink traversal
   * attacks that bypass root boundaries.
   * 
   * @param targetPath - Absolute path to check
   * @returns true if path is allowed, false if not
   */
  async isPathAllowedAsync(targetPath: string): Promise<boolean> {
    // Feature disabled = explicit operator opt-out of sandboxing
    if (!isRootsRestrictionEnabled()) {
      return true;
    }
    // FAIL-CLOSED: restriction enabled but no roots resolved yet (startup,
    // client without roots, empty MCP_ALLOWED_ROOTS) = deny all
    if (!this.restrictToRoots || this.resolvedPaths.length === 0) {
      return false;
    }

    // Resolve symlinks before checking containment. If the path itself
    // doesn't exist (new file / deleted tree), resolve the DEEPEST EXISTING
    // ancestor with realpath and re-append the missing tail — a parent
    // symlink pointing outside the roots must not slip through the
    // textual fallback.
    let resolvedTarget: string;
    try {
      resolvedTarget = await cachedRealpath(path.normalize(targetPath));
    } catch {
      const normalized = path.normalize(targetPath);
      let probe = path.dirname(normalized);
      let realAncestor: string | null = null;
      while (probe !== path.parse(probe).root) {
        try {
          realAncestor = await cachedRealpath(probe);
          break;
        } catch {
          const parent = path.dirname(probe);
          if (parent === probe) break;
          probe = parent;
        }
      }
      resolvedTarget = realAncestor !== null
        ? path.join(realAncestor, normalized.slice(probe.length + path.sep.length))
        : normalized;
    }

    // Check if resolved path is within any root (roots already resolved in setRoots)
    for (const rootPath of this.resolvedPaths) {
      const normalizedRoot = path.normalize(rootPath);
      
      if (resolvedTarget === normalizedRoot) {
        return true;
      }
      
      const relative = path.relative(normalizedRoot, resolvedTarget);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return true;
      }
    }

    return false;
  }

}

// Wire restricted-state probe into access-control (avoids circular import)
setRootsRestrictedProbe(() => rootsManager.isRestricted());

// Singleton instance
export const rootsManager = new RootsManager();

/**
 * Async version of validatePathAgainstRoots that resolves symlinks.
 * Use this for security-critical validation to prevent symlink traversal.
 * 
 * @param targetPath - Absolute path to validate
 * @throws PathValidationError if path is outside allowed roots (after symlink resolution)
 */
export async function validatePathAgainstRootsAsync(targetPath: string): Promise<void> {
  if (!(await rootsManager.isPathAllowedAsync(targetPath))) {
    throw new PathValidationError(targetPath, "Path is outside allowed roots", { code: ECODE.PATH_TRAVERSAL });
  }
}