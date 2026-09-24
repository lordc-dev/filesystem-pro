import fs from "fs/promises";
import { randomBytes } from "crypto";
import { FILE_ENCODING } from "../constants.js";
import { getConfig } from "../config/index.js";
import { invalidateRealpathCache } from "../validation/path-utils.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { getLanguageFromPath } from "../semantic/types.js";
import { treeSitterManager, isSemanticAvailable } from "../semantic/tree-sitter-manager.js";

let tmpCounter = 0;

/**
 * After a write, warm the AST cache incrementally: O(delta) re-parse of the
 * changed region instead of O(file) on the next semantic tool call.
 * Best-effort and fully async-safe — failures fall back to full parse.
 */
async function warmAstCacheIncremental(filePath: string, newContent: string): Promise<void> {
  try {
    const language = getLanguageFromPath(filePath);
    if (!language || !isSemanticAvailable()) return;

    // Read the pre-write content from disk BEFORE the rename would be ideal,
    // but atomicWrite renames before this hook runs. Instead, capture the
    // old content via the undo manager's last recorded entry for this path.
    const { getUndoManager } = await import("../undo/undo-manager.js");
    const undo = getUndoManager();
    const lastEntry = undo.entries[undo.entries.length - 1];
    const oldContent = lastEntry?.filePath === filePath && lastEntry.previous.kind === "snapshot" ? lastEntry.previous.content : null;
    if (oldContent === null) return;

    await treeSitterManager.parseIncremental(oldContent, newContent, language);
  } catch {
    // Best-effort — never fail the write because cache warming failed
  }
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const suffix = `${process.pid}.${tmpCounter++}.${randomBytes(4).toString("hex")}`;
  const tmp = `${filePath}.${suffix}.tmp`;
  try {
    // Preserve the original's mode — the tmp file would otherwise land
    // with the default (0644), widening e.g. a 0600 private file on replace.
    let mode: number | undefined;
    try {
      mode = (await fs.stat(filePath)).mode & 0o777;
    } catch {
      // new file — open() default applies
    }
    const handle = await fs.open(tmp, "w", mode);
    try {
      await handle.writeFile(content, FILE_ENCODING);
      // fsync configurable: MCP_WRITE_FSYNC=0 skips it (rename is still atomic,
      // only crash-durability of the rename is traded for latency)
      // Defensive ?. — config snapshots from older tests/mocks may lack `write`
      if (getConfig().write?.fsync !== false) {
        await handle.sync();
      }
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Never leave an orphan .tmp behind — open, writeFile, sync or rename
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
  invalidateRealpathCache(filePath);
  await stalenessGuard.recordFromPath(filePath);
  // Fire-and-forget: cache warming must never block or fail the write
  void warmAstCacheIncremental(filePath, content);
}