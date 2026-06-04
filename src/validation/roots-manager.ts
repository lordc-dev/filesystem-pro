/**
 * MCP Roots Protocol Manager
 * 
 * Manages filesystem roots provided by the client.
 * Roots define the boundaries of where the server can operate.
 * 
 * @see https://modelcontextprotocol.io/specification/2025-06-18/client/roots
 */

import path from "path";
import { isRootsRestrictionEnabled, shouldLogRootsEvents } from "../config/index.js";
import { parseFileUri, cachedRealpath } from "./path-utils.js";
import { logger } from "../utils/logger.js";
import { PathValidationError, ECODE } from "../errors/index.js";

export interface Root {
  uri: string;
  name?: string;
}

/**
 * Manages allowed filesystem roots from the MCP client.
 * 
 * When roots are configured:
 * - Only paths within these roots are allowed
 * - Paths outside roots are rejected
 * 
 * When no roots are configured:
 * - All paths are allowed (unrestricted mode)
 */
class RootsManager {
  private roots: Root[] = [];
  private resolvedPaths: string[] = [];
  private restrictToRoots: boolean = false;
  

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
    
    // Use SSOT parseFileUri for URI parsing (async)
    const resolvedPromises = roots.map(root => parseFileUri(root.uri));
    const resolved = await Promise.all(resolvedPromises);
    this.resolvedPaths = resolved.filter((p): p is string => p !== null);
    
    // Enable restriction if we have valid roots
    this.restrictToRoots = this.resolvedPaths.length > 0;
    
    if (shouldLogRootsEvents()) {
      if (this.restrictToRoots) {
        logger.info(`[RootsManager] Restricted to ${this.resolvedPaths.length} root(s):`);
        this.resolvedPaths.forEach(p => logger.info(`  - ${p}`));
      } else {
        logger.info("[RootsManager] No roots configured - unrestricted mode");
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
   * Clear all roots (return to unrestricted mode)
   */
  clearRoots(): void {
    this.roots = [];
    this.resolvedPaths = [];
    this.restrictToRoots = false;
    if (shouldLogRootsEvents()) {
      logger.info("[RootsManager] Roots cleared - unrestricted mode");
    }
  }

  /**
   * Check if a path is within allowed roots
   * 
   * @deprecated Use isPathAllowedAsync() for security-critical validation.
   * This sync method does NOT resolve symlinks, which creates a bypass vector.
   * See security audit finding #2 (CWE-59 / CWE-668).
   * Calling this method will log a deprecation warning.
   * 
   * @param targetPath - Absolute path to check
   * @returns true if path is allowed, false if not
   */
  isPathAllowed(targetPath: string): boolean {
    if (shouldLogRootsEvents()) {
      logger.warn("[RootsManager] DEPRECATED: isPathAllowed() called — use isPathAllowedAsync() for security-critical validation. This sync method does not resolve symlinks.");
    }
    // If feature disabled or no restriction, allow all paths
    if (!isRootsRestrictionEnabled() || !this.restrictToRoots) {
      return true;
    }

    // Normalize without symlink resolution
    // SECURITY: This does NOT resolve symlinks — use isPathAllowedAsync() for mutations
    const normalizedTarget = path.normalize(targetPath);

    // Check if path is within any root (using pre-resolved root paths)
    for (const rootPath of this.resolvedPaths) {
      const normalizedRoot = path.normalize(rootPath);
      
      // Check if target is the root itself or a descendant
      if (normalizedTarget === normalizedRoot) {
        return true;
      }
      
      // Check if target is inside the root
      const relative = path.relative(normalizedRoot, normalizedTarget);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return true;
      }
    }

    return false;
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
    // If feature disabled or no restriction, allow all paths
    if (!isRootsRestrictionEnabled() || !this.restrictToRoots) {
      return true;
    }

    // Resolve symlinks before checking containment
    let resolvedTarget: string;
    try {
      resolvedTarget = await cachedRealpath(path.normalize(targetPath));
    } catch {
      // Path doesn't exist yet — use normalized path as fallback
      resolvedTarget = path.normalize(targetPath);
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

// Singleton instance
export const rootsManager = new RootsManager();

/**
 * Validate that a path is within allowed roots (SYNC — does NOT resolve symlinks).
 *
 * @security DO NOT USE for existing filesystem paths. This sync method does not
 * resolve symlinks, which creates a bypass vector for symlink traversal attacks
 * (CWE-59 / CWE-668). Use {@link validatePathAgainstRootsAsync} for any path that may
 * already exist on disk. This function is safe ONLY for paths that are known
 * to not yet exist (e.g., write targets for new files).
 *
 * @deprecated Use validatePathAgainstRootsAsync() for security-critical validation.
 *   Calling this function will log a deprecation warning.
 * @param targetPath - Absolute path to validate
 * @throws PathValidationError if path is outside allowed roots
 */
export function validatePathAgainstRoots(targetPath: string): void {
  if (shouldLogRootsEvents()) {
    logger.warn("[RootsManager] DEPRECATED: validatePathAgainstRoots() called — use validatePathAgainstRootsAsync() for security-critical validation. This sync method does not resolve symlinks.");
  }
  if (!rootsManager.isPathAllowed(targetPath)) {
    throw new PathValidationError(targetPath, "Path is outside allowed roots", { code: ECODE.PATH_TRAVERSAL });
  }
}

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