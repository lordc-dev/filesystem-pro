/**
 * Staleness Guard
 *
 * Tracks file metadata (mtime, size) at read time and rejects edits
 * when the file has changed externally since the last read.
 *
 * This prevents the agent from silently overwriting changes made by
 * another process between the read and the edit.
 *
 * Design:
 * - In-memory Map of path → { mtimeMs, size }
 * - Populated on every read operation (read_text_file, read_multiple_files, etc.)
 * - Checked on every destructive write (write_file, edit_file, replace_symbol_body, etc.)
 * - Opt-in: set MCP_ENABLE_STALENESS_GUARD=true to activate
 * - When disabled (default), all writes proceed without checking
 * - When enabled, stale files return an error with the expected vs actual metadata
 */

import fs from "fs/promises";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { MAX_FINGERPRINTS } from "../constants.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileFingerprint {
  /** Modification time in ms since epoch */
  mtimeMs: number;
  /** File size in bytes */
  size: number;
}

export interface StalenessCheckResult {
  /** Whether the file is stale (changed since last read) */
  stale: boolean;
  /** Current fingerprint (if file exists) */
  current: FileFingerprint | null;
  /** Expected fingerprint (from last read) */
  expected: FileFingerprint | null;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ENABLED = getConfig().stalenessGuard.enabled;

// ---------------------------------------------------------------------------
// Staleness Guard
// ---------------------------------------------------------------------------

class StalenessGuard {
  private fingerprints = new Map<string, FileFingerprint>();

  /**
   * Record a file's fingerprint after reading.
   * Called automatically by read operations.
   */
  record(filePath: string, fingerprint: FileFingerprint): void {
    if (!ENABLED) return;
    if (this.fingerprints.size >= MAX_FINGERPRINTS) {
      const firstKey = this.fingerprints.keys().next().value;
      if (firstKey !== undefined) this.fingerprints.delete(firstKey);
    }
    this.fingerprints.set(filePath, fingerprint);
    logger.debug?.(
      `[StalenessGuard] Recorded: ${filePath} mtime=${fingerprint.mtimeMs} size=${fingerprint.size}`,
    );
  }

  /**
   * Record from a file path (reads current stat).
   * Convenience method for single-file read handlers.
   */
  async recordFromPath(filePath: string): Promise<void> {
    if (!ENABLED) return;
    try {
      const stat = await fs.stat(filePath);
      this.record(filePath, { mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      // File doesn't exist — nothing to record
    }
  }

  /**
   * Record fingerprints for multiple files in parallel.
   * Optimized for read_multiple_files which has many paths at once.
   */
  async recordBatch(filePaths: string[]): Promise<void> {
    if (!ENABLED) return;
    const results = await Promise.all(
      filePaths.map(async (fp) => {
        try {
          const stat = await fs.stat(fp);
          return { fp, mtimeMs: stat.mtimeMs, size: stat.size } as const;
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r) this.record(r.fp, { mtimeMs: r.mtimeMs, size: r.size });
    }
  }

  /**
   * Check if a file has changed since the last read.
   * Returns the check result regardless of whether the guard is enabled.
   * Callers should check `result.stale` and reject writes if true.
   */
  async check(filePath: string): Promise<StalenessCheckResult> {
    const expected = this.fingerprints.get(filePath);

    if (!expected) {
      // No fingerprint on record — allow write (first edit in session)
      return { stale: false, current: null, expected: null };
    }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      // File was deleted since read — not stale, just gone
      return { stale: false, current: null, expected };
    }

    const current: FileFingerprint = { mtimeMs: stat.mtimeMs, size: stat.size };

    const stale =
      current.mtimeMs !== expected.mtimeMs || current.size !== expected.size;

    if (stale) {
      logger.warn?.(
        `[StalenessGuard] STALE: ${filePath}\n` +
          `  Expected: mtime=${expected.mtimeMs} size=${expected.size}\n` +
          `  Current:  mtime=${current.mtimeMs} size=${current.size}`,
      );
    }

    return { stale, current, expected };
  }

  /**
   * Check staleness and return an error message if stale.
   * Returns null if the write should proceed.
   */
  async checkAndGetError(filePath: string): Promise<string | null> {
    if (!ENABLED) return null;

    const result = await this.check(filePath);
    if (!result.stale) return null;

    return (
      `File changed externally since last read: ${filePath}\n` +
      `Expected: mtime=${result.expected!.mtimeMs} size=${result.expected!.size}\n` +
      `Current:  mtime=${result.current!.mtimeMs} size=${result.current!.size}\n` +
      `Re-read the file to get the latest version before editing.`
    );
  }

  /**
   * Remove a file's fingerprint (e.g., after successful write).
   * The next read will re-populate it.
   */
  invalidate(filePath: string): void {
    this.fingerprints.delete(filePath);
  }

  /** Clear all fingerprints */
  clear(): void {
    this.fingerprints.clear();
  }

  /** Number of tracked files */
  get size(): number {
    return this.fingerprints.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const stalenessGuard = new StalenessGuard();