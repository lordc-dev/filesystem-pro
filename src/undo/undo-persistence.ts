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

const PERSIST_DIR = getConfig().undo.persistDir;
const PERSIST_FILENAME = "undo-stack.json";

export function getPersistPath(): string | null {
  if (!PERSIST_DIR) return null;
  return path.join(PERSIST_DIR, PERSIST_FILENAME);
}

export async function ensurePersistDir(): Promise<boolean> {
  if (!PERSIST_DIR) return false;
  try {
    await fs.mkdir(PERSIST_DIR, { recursive: true });
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

export async function saveToDisk(entries: UndoEntry[]): Promise<void> {
  const persistPath = getPersistPath();
  if (!persistPath) return;

  if (!(await ensurePersistDir())) return;

  try {
    const data = JSON.stringify(entries);
    await atomicWrite(persistPath, data);
    try {
      const fd = await fs.open(persistPath, "r");
      await fd.sync();
      await fd.close();
    } catch {
      // fsync best-effort
    }
  } catch (error: unknown) {
    logger.debug?.(`[Undo] Failed to persist stack: ${error}`);
  }
}