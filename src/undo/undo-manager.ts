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
import { applyPatch } from "diff";
import { atomicWrite } from "../utils/fs-utils.js";
import { invalidateRealpathCache } from "../validation/path-utils.js";
import { stalenessGuard } from "./staleness-guard.js";
import { FILE_ENCODING } from "../constants.js";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { loadFromDisk, saveToDisk, ensurePersistDir } from "./undo-persistence.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UndoEntry {
  filePath: string;
  previousContent: string | null;
  diffPatch?: string;
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
// Undo Manager
// ---------------------------------------------------------------------------

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
      this.stack = persisted.slice(-this.maxSize);
      logger.info(`[Undo] Loaded ${this.stack.length} entries from disk`);
    } else {
      logger.debug?.("[Undo] No persisted undo state found");
    }
  }

  // ---- Record ----

  private static readonly MAX_CONTENT_SIZE = DEFAULT_MAX_ENTRY_SIZE;
  // ponytail: debounce trailing 500ms — serialize+fsync per edit taxed the hot path; flush() forces immediate write

  async record(filePath: string, description: string): Promise<void> {
    let previousContent: string | null;
    try {
      previousContent = await fs.readFile(filePath, FILE_ENCODING);
    } catch {
      previousContent = null;
    }

    this.pushEntry(filePath, previousContent, description);
    logger.debug?.(`[Undo] Recorded: ${description} (${filePath})`);
    await this.persist();
  }

  async recordBatch(
    entries: Array<{ filePath: string; description: string }>,
  ): Promise<void> {
    const results = await Promise.all(
      entries.map(async ({ filePath, description }) => {
        let previousContent: string | null;
        try {
          previousContent = await fs.readFile(filePath, FILE_ENCODING);
        } catch {
          previousContent = null;
        }
        return { filePath, previousContent, description } as const;
      })
    );

    for (const { filePath, previousContent, description } of results) {
      this.pushEntry(filePath, previousContent, description);
      logger.debug?.(`[Undo] Recorded: ${description} (${filePath})`);
    }

    await this.persist();
  }

  private pushEntry(filePath: string, previousContent: string | null, description: string): void {
    const entry: UndoEntry = {
      filePath,
      previousContent: (previousContent && previousContent.length <= UndoManager.MAX_CONTENT_SIZE) ? previousContent : null,
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
    const entries = this.stack.splice(-count);
    if (entries.length === 0) {
      return { undone: 0, restored: [] };
    }

    entries.reverse();

    const restored: UndoResult["restored"] = [];
    for (const entry of entries) {
      try {
        if (entry.previousContent === null && !entry.diffPatch) {
          try {
            await fs.unlink(entry.filePath);
            stalenessGuard.invalidate(entry.filePath);
            invalidateRealpathCache(entry.filePath);
          } catch {
            // already gone
          }
        } else if (entry.diffPatch) {
          // Reconstruct previous content from diff patch
          try {
            
            
            const patch = JSON.parse(entry.diffPatch);
            const reconstructed = applyPatch("", patch);
            if (typeof reconstructed === "string") {
              // Ensure parent directory exists (needed when undoing deletes)
              const dir = path.dirname(entry.filePath);
              if (dir) {
                try {
                  await fs.mkdir(dir, { recursive: true });
                } catch {
                  // directory may already exist
                }
                invalidateRealpathCache(dir);
              }
              await atomicWrite(entry.filePath, reconstructed);
              invalidateRealpathCache(entry.filePath);
            } else {
              throw new Error("Failed to apply diff patch for " + entry.filePath + ": " + reconstructed);
            }
          } catch (patchError: unknown) {
            logger.warn("[Undo] Could not apply diff patch for " + entry.filePath + ": " + patchError);
            restored.push({ filePath: entry.filePath, success: false, error: String(patchError) });
            continue;
          }
        } else {
          // Ensure parent directory exists (needed when undoing deletes
          // that removed the containing directory)
          const dir = path.dirname(entry.filePath);
          if (dir) {
            try {
              await fs.mkdir(dir, { recursive: true });
            } catch {
              // directory may already exist
            }
            invalidateRealpathCache(dir);
          }
          await atomicWrite(entry.filePath, entry.previousContent!);
          invalidateRealpathCache(entry.filePath);
          // Restore mtime from original entry to prevent staleness false positive
          try {
            await fs.utimes(entry.filePath, new Date(), new Date(entry.timestamp));
          } catch {
            // mtime restoration is best-effort
          }
        }
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

    await this.persist();
    return { undone: entries.length, restored };
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
