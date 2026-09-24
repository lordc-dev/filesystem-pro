/**
 * Copy / chmod / symlink tools — close the remaining bash file-op gaps.
 */

import fs from "fs/promises";
import { z } from "zod";
import { validatePath } from "../validation/path-validation.js";
import { dualPathSuccessResponse, pathSuccessResponse, errorResponse } from "../utils/response-helpers.js";
import { DualPathSuccessShape, PathSchema, PathSuccessShape } from "../schemas/index.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { invalidateRealpathCache } from "../validation/path-utils.js";
import type { ToolContext } from "./types.js";

// lchmod (no symlink follow) only exists on macOS/BSD and cannot chmod
// directories (open(O_WRONLY) fails with EISDIR). Directories cannot hide
// behind a symlink-follow here — lstat already told us what we are touching —
// so plain chmod is safe for them. Fall back to chmod where lchmod is absent.
const chmodNoFollow: (p: string, mode: number, isDirectory: boolean) => Promise<void> =
  (fs as typeof fs & { lchmod?: (p: string, m: number) => Promise<void> }).lchmod
    ? async (p, mode, isDirectory) => {
        if (isDirectory) {
          await fs.chmod(p, mode);
          return;
        }
        await (fs as typeof fs & { lchmod: (p: string, m: number) => Promise<void> }).lchmod(p, mode);
      }
    : (p, mode) => fs.chmod(p, mode);

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
      if (!overwrite) {
        // O_EXCL create as an ATOMIC exclusivity lock — see move_file.
        let handle;
        try {
          handle = await fs.open(validDest, "wx");
        } catch {
          return errorResponse(`Destination exists: ${validDest} — pass overwrite: true to replace it (not undoable)`, { source: validSource, destination: validDest });
        }
        await handle.close();
        await fs.unlink(validDest);
      }
      try {
        await fs.cp(validSource, validDest, { recursive: true, force: true });
      } catch (err: unknown) {
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
          // ponytail: lstat walk — symlinks are SKIPPED on every platform (no
          // lchmod on Linux; chmod would follow the link); depth/entry caps
          // stop runaway trees
          const MAX_ENTRIES = 10_000;
          const MAX_DEPTH = 32;
          let count = 0;
          const walk = async (dir: string, depth: number): Promise<void> => {
            if (depth > MAX_DEPTH) throw new Error(`recursion depth > ${MAX_DEPTH}`);
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
              if (++count > MAX_ENTRIES) throw new Error(`more than ${MAX_ENTRIES} entries — narrow the path`);
              const p = `${dir}/${e.name}`;
              if (e.isSymbolicLink()) continue; // never chmod through a link
              const s = await fs.lstat(p);
              if (e.isDirectory()) {
                await walk(p, depth + 1);
                // post-order: chmod the dir AFTER its children, so a
                // restrictive mode cannot break the ongoing traversal
                await chmodNoFollow(p, parseMode(mode, s.mode) ?? numeric, true);
              } else {
                await chmodNoFollow(p, parseMode(mode, s.mode) ?? numeric, false);
              }
            }
          };
          await walk(validPath, 1);
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