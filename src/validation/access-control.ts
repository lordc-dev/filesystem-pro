/**
 * Access Control Module (SSOT for path access beyond roots)
 *
 * Three compensating controls for unrestricted mode (roots OFF or client
 * without roots support):
 *
 * 1. Deny-list (MCP_DENY_PATHS): absolute paths or glob patterns that are
 *    always rejected, regardless of roots state. Cheap sandbox for the
 *    "roots OFF" setup.
 * 2. Unrestricted acknowledgment (MCP_UNRESTRICTED_ACK): when roots are
 *    disabled AND no deny-list is configured, destructive tools refuse to
 *    run until the operator explicitly acknowledges unrestricted mode.
 * 3. Outside-cwd logging (MCP_LOG_OUTSIDE_CWD): warn when any operation
 *    touches a path outside the server's working directory — detects an
 *    agent wandering where it shouldn't.
 *
 * All settings resolve at call time via getConfig() — no restart needed.
 */

import path from "path";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { PathValidationError, ECODE } from "../errors/index.js";
import { incrementCounter } from "../utils/metrics.js";

// ============================================================================
// DENY-LIST
// ============================================================================

/** Cache of compiled deny patterns (invalidated when config changes) */
let compiledDeny: { patterns: RegExp[]; raw: string } | null = null;
/**
 * Convert a deny pattern to a regex.
 * Supports:
 *   - Absolute paths: /Users/x/.ssh  (prefix match: the path and everything under it)
 *   - Home-relative: ~/.ssh          (expanded before matching)
 *   - Glob patterns: double-star .env, double-star node_modules double-star
 */
function denyPatternToRegex(pattern: string): RegExp | null {
  let p = pattern.trim();
  if (p === "") return null;

  // Expand home
  if (p.startsWith("~/")) {
    p = path.join(process.env.HOME ?? "", p.slice(1));
  } else if (p === "~") {
    p = process.env.HOME ?? "";
  }

  // Plain absolute path (no glob chars) → prefix match
  if (!/[*?[\]]/.test(p)) {
    const escaped = p.replace(/[.+^${}()|\\]/g, "\\$&");
    return new RegExp(`^${escaped}(/.*)?$`);
  }

  // Glob → regex (** = any depth, * = within segment, ? = one char)
  const escaped = p
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000") // placeholder
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, ".*"); // eslint-disable-line no-control-regex -- placeholder sentinel swap
  return new RegExp(`^${escaped}(/.*)?$`);
}

function getDenyPatterns(): RegExp[] {
  const raw = getConfig().security.denyPaths;
  if (compiledDeny?.raw === raw.join("\u0000")) {
    return compiledDeny.patterns;
  }
  const patterns: RegExp[] = [];
  for (const p of raw) {
    const re = denyPatternToRegex(p);
    if (re) patterns.push(re);
  }
  compiledDeny = { patterns, raw: raw.join("\u0000") };
  return patterns;
}

/**
 * Check whether a path matches any deny pattern.
 * @returns the matching pattern, or null if allowed.
 */
export function matchDenyPath(targetPath: string): string | null {
  const raw = getConfig().security?.denyPaths ?? [];
  if (raw.length === 0) return null;
  const normalized = path.normalize(targetPath);
  const patterns = getDenyPatterns();
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(normalized)) return raw[i];
  }
  return null;
}

// ============================================================================
// UNRESTRICTED ACK
// ============================================================================

/**
 * Whether the server is fully sandboxed:
 * - roots enabled AND actively restricted (client provided roots), OR
 * - a deny-list is configured (partial sandbox counts as acknowledged intent).
 */
export function isSandboxed(): boolean {
  const config = getConfig();
  if (config.roots.enabled && rootsRestricted()) return true;
  if ((config.security?.denyPaths?.length ?? 0) > 0) return true;
  return false;
}

// Injected by roots-manager to avoid circular import (roots-manager imports this module)
let rootsRestrictedFn: () => boolean = () => false;
export function setRootsRestrictedProbe(fn: () => boolean): void {
  rootsRestrictedFn = fn;
}
function rootsRestricted(): boolean {
  return rootsRestrictedFn();
}

/**
 * Guard for destructive operations in unrestricted mode.
 * Throws unless the operator acknowledged unrestricted mode
 * (MCP_UNRESTRICTED_ACK=1) or a sandbox layer is active.
 */
export function assertDestructiveAllowed(toolName: string): void {
  const config = getConfig();
  if (isSandboxed() || config.security?.unrestrictedAck) return;
  incrementCounter("unrestricted_destructive_blocked", { tool: toolName });
  throw new PathValidationError("", "Destructive operation refused: server is in UNRESTRICTED mode (no roots, no deny-list). Set MCP_DENY_PATHS or MCP_UNRESTRICTED_ACK=1 to acknowledge.", { code: ECODE.PATH_TRAVERSAL });
}

// ============================================================================
// OUTSIDE-CWD LOGGING
// ============================================================================

/** Paths already warned about in this session (avoid log spam) */
const outsideCwdWarned = new Set<string>();

/**
 * Warn (once per path) when an operation touches a path outside cwd.
 * Controlled by MCP_LOG_OUTSIDE_CWD (default: true).
 */
export function logIfOutsideCwd(targetPath: string, toolName: string): void {
  const config = getConfig();
  if (!config.security?.logOutsideCwd) return;

  const cwd = process.cwd();
  const normalized = path.normalize(targetPath);
  if (normalized === cwd || normalized.startsWith(cwd + path.sep)) return;

  if (outsideCwdWarned.has(normalized)) return;
  outsideCwdWarned.add(normalized);
  incrementCounter("outside_cwd_access", { tool: toolName });
  logger.warn(`[Security] Tool '${toolName}' accessed path outside cwd: ${normalized}`);
}