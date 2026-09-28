/**
 * Undo Stack Disk Persistence
 *
 * Handles loading/saving the undo stack to a JSON file.
 * Extracted from UndoManager for separation of concerns.
 *
 * Persistence is disabled by default (MCP_UNDO_PERSIST_DIR env var).
 * When enabled, the stack is serialized as JSON and written atomically
 * via temp + rename for crash safety.
 */

import fs from "fs/promises";
import path from "path";
import { atomicWrite } from "../utils/fs-utils.js";
import { FILE_ENCODING } from "../constants.js";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";
import type { UndoEntry } from "./undo-manager.js";

// Lazy: read on first use so a JSON config loaded via loadConfig() applies.
const PERSIST_DIR = () => getConfig().undo.persistDir;
const PERSIST_FILENAME = "undo-stack.json";

export function getPersistPath(): string | null {
  const dir = PERSIST_DIR();
  if (!dir) return null;
  return path.join(dir, PERSIST_FILENAME);
}

export async function ensurePersistDir(): Promise<boolean> {
  const dir = PERSIST_DIR();
  if (!dir) return false;
  try {
    // 0700: the stack holds file snapshots — other local users must not read
    // them (audit P1). mkdir mode is umask-narrowed only, never widened.
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      await fs.chmod(dir, 0o700);
    } catch {
      // pre-existing dir owned by another user — chmod fails, load will warn
    }
    return true;
  } catch {
    return false;
  }
}

export async function loadFromDisk(): Promise<UndoEntry[]> {
  const persistPath = getPersistPath();
  if (!persistPath) return [];

  try {
    const data = await fs.readFile(persistPath, FILE_ENCODING);
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

/** Warn once if the persisted stack is readable beyond the owner (audit P1). */
export async function warnIfPersistedInsecure(): Promise<void> {
  const persistPath = getPersistPath();
  if (!persistPath) return;
  try {
    const mode = (await fs.stat(persistPath)).mode & 0o777;
    if (mode & 0o077) {
      logger.warn(`[Undo] Persist file is group/other-readable (mode ${mode.toString(8)}) — run: chmod 600 ${persistPath}`);
    }
  } catch {
    // absent file — nothing to check
  }
}

export async function saveToDisk(entries: UndoEntry[]): Promise<void> {
  const persistPath = getPersistPath();
  if (!persistPath) return;

  if (!(await ensurePersistDir())) {
    logger.warn("[Undo] Cannot create persist dir — undo stack will NOT survive restarts");
    return;
  }

  try {
    const data = JSON.stringify(entries);
    // atomicWrite already fsyncs the temp file before rename — no second fsync needed.
    // 0600: snapshots contain private file content (audit P1).
    await atomicWrite(persistPath, data, 0o600);
  } catch (error: unknown) {
    // Persistence failure means undo state is lost on restart — the user
    // must be told, not just the debug log (audit: silent failure).
    logger.error(`[Undo] Failed to persist stack: ${error instanceof Error ? error.message : String(error)} — undo state will NOT survive restarts`);
  }
}