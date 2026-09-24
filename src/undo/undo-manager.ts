/**
 * Undo Manager with Disk Persistence
 *
 * In-memory undo stack for filesystem operations with optional
 * persistence to disk so that the stack survives process restarts.
 *
 * Design:
 * - Stack per session (process lifetime) backed by JSON file
 * - Bounded size (default 100 entries)
 * - Stores full file content before each mutation
 * - Supports undo of last N operations or all operations
 * - Auto-prunes oldest entries when stack overflows
 * - Persistence: MCP_UNDO_PERSIST_DIR env var (disabled by default)
 * - Atomic writes via temp + rename
 */

import fs from "fs/promises";
import path from "path";
import { atomicWrite } from "../utils/fs-utils.js";
import { invalidateRealpathCache, normalizePath, resolvePath } from "../validation/path-utils.js";
import { stalenessGuard } from "./staleness-guard.js";
import { FILE_ENCODING } from "../constants.js";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { loadFromDisk, saveToDisk, ensurePersistDir } from "./undo-persistence.js";
import { validatePathAgainstRootsAsync } from "../validation/roots-manager.js";
import { matchDenyPath } from "../validation/access-control.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * What the file looked like before the recorded operation.
 * - created: the file did not exist before the operation; undo deletes it.
 * - snapshot: full previous content; undo restores it.
 * - notUndoable: no faithful snapshot exists (unreadable, too large, binary).
 *   Undo REFUSES to touch the file rather than guessing.
 */
export type PreviousState =
  | { kind: "created" }
  | { kind: "snapshot"; content: string }
  | { kind: "notUndoable"; reason: string };

export interface UndoEntry {
  filePath: string;
  previous: PreviousState;
  timestamp: number;
  description: string;
}

// Legacy on-disk shape (previousContent: string | null) — migrated on load
interface LegacyUndoEntry {
  filePath: string;
  previousContent: string | null;
  timestamp: number;
  description: string;
}

export interface UndoResult {
  undone: number;
  restored: Array<{ filePath: string; success: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const _config = getConfig();
const DEFAULT_MAX_STACK_SIZE = _config.undo.maxStackSize;
const DEFAULT_MAX_ENTRY_SIZE = _config.undo.maxEntrySizeBytes;
const PERSIST_DIR = _config.undo.persistDir;

// ---------------------------------------------------------------------------
// State capture
// ---------------------------------------------------------------------------

/**
 * Capture the pre-operation state of a file as an explicit union.
 * ENOENT → created; read error → notUndoable (never "created" — undo must
 * not delete a file it failed to read). Size limit uses bytes, not string
 * length, so multi-byte content is measured honestly.
 */
async function captureState(filePath: string): Promise<PreviousState> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { kind: "created" };
    return { kind: "notUndoable", reason: `stat failed: ${(err as Error).message}` };
  }

  if (stat.size > UndoManager.maxContentSize) {
    return { kind: "notUndoable", reason: `file is ${stat.size} bytes, exceeds snapshot limit ${UndoManager.maxContentSize}` };
  }

  try {
    const content = await fs.readFile(filePath, FILE_ENCODING);
    return { kind: "snapshot", content };
  } catch (err: unknown) {
    return { kind: "notUndoable", reason: `read failed: ${(err as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Undo Manager
// ---------------------------------------------------------------------------

/**
 * Migrate legacy on-disk entries (previousContent: string | null) to the
 * explicit PreviousState union. Legacy null is ambiguous — it meant both
 * "file did not exist" and "no snapshot". We cannot distinguish after the
 * fact, so legacy null becomes notUndoable: undo refuses rather than
 * risking a delete of a file it has no snapshot for.
 */
function migrateLegacyEntry(entry: UndoEntry | LegacyUndoEntry): UndoEntry {
  if ("previous" in entry) return entry;
  const legacy = entry as LegacyUndoEntry;
  return {
    filePath: legacy.filePath,
    timestamp: legacy.timestamp,
    description: legacy.description,
    previous: legacy.previousContent !== null
      ? { kind: "snapshot", content: legacy.previousContent }
      : { kind: "notUndoable", reason: "legacy entry without snapshot" },
  };
}

class UndoManager {
  private stack: UndoEntry[] = [];
  private readonly maxSize: number;
  private persistEnabled: boolean;

  constructor(maxSize = DEFAULT_MAX_STACK_SIZE) {
    this.maxSize = maxSize;
    this.persistEnabled = false;
  }

  /**
   * Initialize the undo manager. Loads persisted state if available.
   * Call once at server startup.
   */
  async initialize(): Promise<void> {
    if (!PERSIST_DIR) {
      this.persistEnabled = false;
      logger.debug?.("[Undo] Persistence disabled (MCP_UNDO_PERSIST_DIR not set)");
      return;
    }

    const dirOk = await ensurePersistDir();
    if (!dirOk) {
      this.persistEnabled = false;
      logger.warn("[Undo] Could not create persist dir, persistence disabled");
      return;
    }

    this.persistEnabled = true;

    const persisted = await loadFromDisk();
    if (persisted.length > 0) {
      this.stack = persisted.slice(-this.maxSize).map(migrateLegacyEntry);
      logger.info(`[Undo] Loaded ${this.stack.length} entries from disk`);
    } else {
      logger.debug?.("[Undo] No persisted undo state found");
    }
  }

  // ---- Record ----

  private static readonly MAX_CONTENT_SIZE = DEFAULT_MAX_ENTRY_SIZE;

  /** Snapshot byte limit — exposed for captureState. */
  static get maxContentSize(): number {
    return UndoManager.MAX_CONTENT_SIZE;
  }
  // ponytail: debounce trailing 500ms — serialize+fsync per edit taxed the hot path; flush() forces immediate write

  async record(filePath: string, description: string): Promise<void> {
    const previous = await captureState(filePath);
    this.pushEntry(filePath, previous, description);
    logger.debug?.(`[Undo] Recorded: ${description} (${filePath})`);
    await this.persist();
  }

  async recordBatch(
    entries: Array<{ filePath: string; description: string }>,
  ): Promise<void> {
    const results = await Promise.all(
      entries.map(async ({ filePath, description }) => {
        const previous = await captureState(filePath);
        return { filePath, previous, description } as const;
      })
    );

    for (const { filePath, previous, description } of results) {
      this.pushEntry(filePath, previous, description);
      logger.debug?.(`[Undo] Recorded: ${description} (${filePath})`);
    }

    await this.persist();
  }

  private pushEntry(filePath: string, previous: PreviousState, description: string): void {
    const entry: UndoEntry = {
      filePath,
      previous,
      timestamp: Date.now(),
      description,
    };
    this.stack.push(entry);
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }
  }

  // ---- Undo ----

  async undo(count = 1): Promise<UndoResult> {
    if (this.stack.length === 0) {
      return { undone: 0, restored: [] };
    }

    const start = Math.max(0, this.stack.length - count);
    const entries = this.stack.slice(start).reverse();

    const restored: UndoResult["restored"] = [];
    // Track success per ENTRY (index in the undo batch), not per path —
    // several entries may target the same file and only some fail.
    const succeeded = new Set<number>();
    for (const [batchIdx, entry] of entries.entries()) {
      try {
        // Re-validate at undo time BEFORE any mkdir: roots or symlinks may
        // have changed since the entry was recorded, and a rejected restore
        // must not leave created directories behind. The normalized path is
        // checked against roots/deny-list directly — the file (and possibly
        // its parents) may legitimately not exist yet, so no realpath here.
        const normalized = normalizePath(resolvePath(entry.filePath));
        const denied = matchDenyPath(normalized);
        if (denied) {
          throw new Error(`path denied by MCP_DENY_PATHS (matched: ${denied})`);
        }
        await validatePathAgainstRootsAsync(normalized);
        const validPath = normalized;

        if (entry.previous.kind === "notUndoable") {
          restored.push({
            filePath: entry.filePath,
            success: false,
            error: `not undoable (${entry.previous.reason}) — no faithful snapshot exists, file left untouched`,
          });
          continue;
        }

        if (entry.previous.kind === "created") {
          try {
            await fs.unlink(validPath);
            stalenessGuard.invalidate(validPath);
            invalidateRealpathCache(validPath);
          } catch {
            // already gone
          }
        } else {
          // Recreate parent only after validation passed — undoing a delete
          // may need to restore a directory tree that no longer exists.
          const dir = path.dirname(validPath);
          if (dir) {
            try {
              await fs.mkdir(dir, { recursive: true });
            } catch {
              // directory may already exist
            }
            invalidateRealpathCache(dir);
          }
          await atomicWrite(validPath, entry.previous.content);
          invalidateRealpathCache(validPath);
          // Restore mtime from original entry to prevent staleness false positive
          try {
            await fs.utimes(validPath, new Date(), new Date(entry.timestamp));
          } catch {
            // mtime restoration is best-effort
          }
        }
        succeeded.add(batchIdx);
        restored.push({ filePath: entry.filePath, success: true });
        logger.debug?.(
          `[Undo] Restored: ${entry.filePath} — ${entry.description}`,
        );
      } catch (error: unknown) {
        restored.push({
          filePath: entry.filePath,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        logger.error?.(
          `[Undo] Failed to restore ${entry.filePath}: ${error}`,
        );
      }
    }

    // Remove only the entries that were successfully restored (or safely
    // deleted); failures stay on the stack so a retry remains possible.
    // entries[] is the reversed tail of the stack: batchIdx i corresponds to
    // stack index (this.stack.length - 1 - i).
    this.stack = this.stack.filter((_, idx) => {
      if (idx < start) return true;
      const batchIdx = this.stack.length - 1 - idx;
      return !succeeded.has(batchIdx);
    });

    await this.persist();
    return { undone: succeeded.size, restored };
  }

  async undoAll(): Promise<UndoResult> {
    return this.undo(this.stack.length);
  }

  // ---- Query ----

  get size(): number {
    return this.stack.length;
  }

  peek(count = 5): UndoEntry[] {
    return this.stack.slice(-count);
  }

  get entries(): readonly UndoEntry[] {
    return [...this.stack];
  }

  async clear(): Promise<void> {
    this.stack = [];
    await this.persist();
  }

  get isPersistenceEnabled(): boolean {
    return this.persistEnabled;
  }

  // ---- Persistence ----

  private persistTimer: NodeJS.Timeout | null = null;

  private async persist(): Promise<void> {
    if (!this.persistEnabled) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    // Trailing debounce: batch rapid edits into one disk write
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void saveToDisk(this.stack);
    }, 500);
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.persistEnabled) await saveToDisk(this.stack);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const _defaultUndoManager = new UndoManager();
let _undoManager: UndoManager = _defaultUndoManager;

export function getUndoManager(): UndoManager { return _undoManager; }
export function setUndoManager(manager: UndoManager): void { _undoManager = manager; }
export function resetUndoManager(): void { _undoManager = _defaultUndoManager; }

/**
 * Default undo manager instance.
 * For testing, use setUndoManager() to inject a mock.
 */
export const undoManager: UndoManager = new Proxy({} as UndoManager, {
  get(_, prop) { return Reflect.get(_undoManager, prop); },
  set(_, prop, value) { return Reflect.set(_undoManager, prop, value); },
});
