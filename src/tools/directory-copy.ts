/**
 * Copy / chmod / symlink tools — close the remaining bash file-op gaps.
 */

import fs from "fs/promises";
import { randomBytes } from "crypto";
import { z } from "zod";
import { validatePath, assertTreeAllowed, walkTree } from "../validation/path-validation.js";
import { dualPathSuccessResponse, pathSuccessResponse, errorResponse } from "../utils/response-helpers.js";
import { DualPathSuccessShape, PathSchema, PathSuccessShape } from "../schemas/index.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { invalidateRealpathCache } from "../validation/path-utils.js";
import type { ToolContext } from "./types.js";

// lchmod (no symlink follow) only exists on macOS/BSD and cannot chmod
// directories (open(O_WRONLY) fails with EISDIR). On Linux fs.lchmod EXISTS
// as a key but throws "not implemented" when called — probe once at module
// load instead of trusting the key. Directories cannot hide behind a
// symlink-follow here — lstat already told us what we are touching — so
// plain chmod is safe for them.
const hasLchmod = await (async () => {
  const lchmod = (fs as typeof fs & { lchmod?: (p: string, m: number) => Promise<void> }).lchmod;
  if (!lchmod) return false;
  try {
    // probe on /: Linux rejects, macOS succeeds (mode unchanged 0755)
    await lchmod.call(fs, "/", 0o755);
    return true;
  } catch {
    return false;
  }
})();
const chmodNoFollow: (p: string, mode: number, isDirectory: boolean) => Promise<void> =
  hasLchmod
    ? async (p, mode, isDirectory) => {
        if (isDirectory) {
          await fs.chmod(p, mode);
          return;
        }
        await (fs as typeof fs & { lchmod: (p: string, m: number) => Promise<void> }).lchmod(p, mode);
      }
    : (p, mode) => fs.chmod(p, mode);

/**
 * Copy a file into an O_EXCL destination handle. The open fd holds
 * exclusivity for the whole copy — a concurrent creator of the destination
 * gets EEXIST, never a silent overwrite (no TOCTOU window).
 * Shared by copy_file and move_file (SSOT).
 */
export async function copyFileNoReplace(srcPath: string, dstPath: string): Promise<void> {
  const src = await fs.open(srcPath, "r");
  let dst;
  try {
    dst = await fs.open(dstPath, "wx");
    // Preserve source permissions (private files stay private) — fchmod
    // on the exclusive fd, before anyone can see the file via the path.
    const mode = (await src.stat()).mode;
    await dst.chmod(mode & 0o7777);
    const BUF = 1 << 16;
    const buf = Buffer.alloc(BUF);
    let pos = 0;
    for (;;) {
      const { bytesRead } = await src.read(buf, 0, BUF, pos);
      if (bytesRead === 0) break;
      await dst.write(bytesRead === BUF ? buf : buf.subarray(0, bytesRead), 0, bytesRead);
      pos += bytesRead;
    }
  } catch (err) {
    // A failed copy must not leave an incomplete destination behind —
    // the "wx" open promised exclusivity, so the partial file is ours.
    if (dst) await fs.unlink(dstPath).catch(() => {});
    throw err;
  } finally {
    await src.close();
    if (dst) await dst.close();
  }
}

/** Copy a file without overwrite — O_EXCL handle holds exclusivity. */
async function copyFileExclusive(validSource: string, validDest: string): Promise<void> {
  await copyFileNoReplace(validSource, validDest);
}

/** Roll back a failed exclusive dir copy: remove the temp sibling and the
 * (still-empty) mkdir probe — never delete content that is not ours.
 * rmdir only removes EMPTY dirs and only when WE created the probe, so a
 * pre-existing empty destination survives a failed copy (audit P1). */
async function rollbackDirCopy(tmpDest: string, validDest: string, probeCreated: boolean): Promise<void> {
  await fs.rm(tmpDest, { recursive: true, force: true }).catch(() => {});
  if (probeCreated) await fs.rmdir(validDest).catch(() => {});
}

/** Copy a directory without overwrite — temp sibling + mkdir probe + rename. */
async function copyDirExclusive(validSource: string, validDest: string): Promise<void> {
  // fs.cp cannot target a handle. Copy to a temp sibling, then ATOMICALLY
  // take the destination name with a mkdir probe and rename over OUR OWN
  // probe. A concurrent creator gets EEXIST at the mkdir; a probe filled in
  // the gap makes rename fail ENOTEMPTY (probe rolled back, nothing of
  // theirs touched).
  // random suffix: pid+Date.now() collides for concurrent copies in the same
  // process — a loser's rollback would rm the winner's shared temp (audit P1)
  const tmpDest = `${validDest}.tmp-${process.pid}-${Date.now()}-${randomBytes(6).toString("hex")}`;
  let probeCreated = false;
  try {
    await fs.cp(validSource, tmpDest, { recursive: true });
    await fs.mkdir(validDest);
    probeCreated = true;
    await fs.rename(tmpDest, validDest);
  } catch (err: unknown) {
    await rollbackDirCopy(tmpDest, validDest, probeCreated);
    throw err;
  }
}

export function registerCopyFileTool({ factories }: ToolContext): void {
  const { destructive } = factories;

  destructive(
    "copy_file",
    {
      title: "Copy File",
      description: "Copy a file or directory. Recursive for directories. " +
        "Rejects existing destinations unless overwrite: true. NOT undoable — the destination is not snapshotted; use delete_file on the copy to revert.",
      inputSchema: {
        source: z.string().describe("Source path"),
        destination: z.string().describe("Destination path"),
        overwrite: z.boolean().default(false).describe("Allow overwriting an existing destination (destructive, not undoable)"),
      },
      outputSchema: DualPathSuccessShape,
    },
    async ({ source, destination, overwrite }) => {
      const validSource = await validatePath(source, { bypassCache: true });
      const validDest = await validatePath(destination, { bypassCache: true });
      // Deny-list must cover every descendant of the source tree AND every
      // projected path under the destination — copying must not create a
      // file at a denied destination path (audit P1, round 2).
      const sourceStat = await fs.lstat(validSource);
      if (sourceStat.isDirectory()) {
        await assertTreeAllowed(validSource, validDest);
      }
      try {
        if (overwrite) {
          await fs.cp(validSource, validDest, { recursive: true, force: true });
        } else if (sourceStat.isDirectory()) {
          await copyDirExclusive(validSource, validDest);
        } else {
          await copyFileExclusive(validSource, validDest);
        }
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (!overwrite && (code === "EEXIST" || code === "ENOTEMPTY")) {
          return errorResponse(`Destination exists: ${validDest} — pass overwrite: true to replace it (not undoable)`, { source: validSource, destination: validDest });
        }
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Copy failed: ${msg}`, { source: validSource, destination: validDest });
      }
      await stalenessGuard.recordFromPath(validDest);
      invalidateRealpathCache(validDest);
      return dualPathSuccessResponse("copied", source, destination);
    }
  );

  destructive(
    "chmod",
    {
      title: "Change Permissions",
      description: "Change file/directory permissions. Accepts octal (e.g. 0o755, 755) or symbolic (e.g. 'u+x', 'go-w') mode.",
      inputSchema: {
        path: PathSchema,
        mode: z.string().describe("Octal (755, 0o644) or symbolic (u+x) mode"),
        recursive: z.boolean().default(false).describe("Apply to directory contents recursively"),
      },
      outputSchema: PathSuccessShape,
    },
    async ({ path: filePath, mode, recursive }) => {
      const validPath = await validatePath(filePath, { bypassCache: true });
      try {
        const stat = await fs.lstat(validPath);
        const numeric = parseMode(mode, stat.mode);
        if (numeric === null) {
          return errorResponse(`Invalid mode: ${mode}. Use octal (755, 0o644) or symbolic (u+x).`, { path: validPath });
        }
        if (recursive && stat.isDirectory()) {
          // ponytail: walkTree SSOT — deny-list + caps live in one place;
          // symlinks are SKIPPED on every platform (no lchmod on Linux;
          // chmod would follow the link)
          await walkTree(
            validPath,
            async (p, e) => {
              if (e.isSymbolicLink()) return; // never chmod through a link
              const s = await fs.lstat(p);
              if (!e.isDirectory()) {
                await chmodNoFollow(p, parseMode(mode, s.mode) ?? numeric, false);
              }
            },
            undefined,
            // post-order: chmod the dir AFTER its children, so a
            // restrictive mode cannot break the ongoing traversal
            async (p) => {
              const s = await fs.lstat(p);
              await chmodNoFollow(p, parseMode(mode, s.mode) ?? numeric, true);
            },
          );
          await chmodNoFollow(validPath, numeric, true);
        } else if (stat.isSymbolicLink()) {
          return errorResponse("chmod on a symbolic link is not supported — chmod the target directly.", { path: validPath });
        } else {
          await chmodNoFollow(validPath, numeric, stat.isDirectory());
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`chmod failed: ${msg}`, { path: validPath });
      }
      return pathSuccessResponse("changed permissions on", filePath);
    }
  );

  destructive(
    "create_symlink",
    {
      title: "Create Symlink",
      description: "Create a symbolic link. The link path must not already exist.",
      inputSchema: {
        target: z.string().describe("Path the link points to"),
        linkPath: z.string().describe("Path of the symlink to create"),
      },
      outputSchema: DualPathSuccessShape,
    },
    async ({ target, linkPath }) => {
      const validTarget = await validatePath(target, { bypassCache: true });
      const validLink = await validatePath(linkPath, { bypassCache: true });
      try {
        await fs.symlink(validTarget, validLink);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(`Symlink failed: ${msg}`, { target: validTarget, linkPath: validLink });
      }
      invalidateRealpathCache(validLink);
      return dualPathSuccessResponse("linked", target, linkPath);
    }
  );
}

/** Parse octal (755, 0o644) or symbolic (u+x, go-w, a=rw) into a numeric mode. */
export function parseMode(mode: string, currentMode: number): number | null {
  const trimmed = mode.trim();
  if (/^0o?[0-7]{3,4}$/.test(trimmed) || /^[0-7]{3,4}$/.test(trimmed)) {
    return parseInt(trimmed.replace(/^0o?/, ""), 8);
  }
  // ponytail: single-clause symbolic parser — no comma lists or X bit; upgrade if needed
  const m = /^([ugoa]*)([+\-=])([rwx]+)$/.exec(trimmed);
  if (!m) return null;
  const who = m[1] === "" ? "ugoa" : m[1];
  const op = m[2] as "+" | "-" | "=";
  let permBits = 0;
  if (m[3]!.includes("r")) permBits |= 4;
  if (m[3]!.includes("w")) permBits |= 2;
  if (m[3]!.includes("x")) permBits |= 1;

  let result = currentMode & 0o777;
  for (const w of who) {
    const shift = w === "u" ? 6 : w === "g" ? 3 : w === "o" ? 0 : -1;
    if (shift === -1) {
      // 'a' = all three
      for (const s of [6, 3, 0]) {
        const cur = (result >> s) & 7;
        result = applyOp(result, s, cur, permBits, op);
      }
    } else {
      const cur = (result >> shift) & 7;
      result = applyOp(result, shift, cur, permBits, op);
    }
  }
  return result;
}

function applyOp(result: number, shift: number, cur: number, permBits: number, op: "+" | "-" | "="): number {
  let newBits: number;
  if (op === "+") newBits = cur | permBits;
  else if (op === "-") newBits = cur & ~permBits;
  else newBits = permBits;
  return (result & ~(7 << shift)) | (newBits << shift);
}