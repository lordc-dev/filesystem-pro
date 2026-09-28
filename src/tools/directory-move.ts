/**
 * Move File/Directory Tool
 */

import fs from "fs/promises";
import { z } from "zod";
import { validatePath, assertTreeAllowed } from "../validation/path-validation.js";
import { dualPathSuccessResponse } from "../utils/response-helpers.js";
import { DualPathSuccessShape } from "../schemas/index.js";
import type { ToolContext } from "./types.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { invalidateRealpathCache } from "../validation/path-utils.js";
import { copyFileNoReplace } from "./directory-copy.js";

export function registerMoveFileTool({ factories }: ToolContext): void {
  const { destructive } = factories;

  destructive(
    "move_file",
    {
      title: "Move File",
      description: "Move or rename files and directories. Atomic operation — the source path no longer exists after a successful move. NOT undoable — no snapshot is recorded; the source is moved, not copied. Rejects existing destinations unless overwrite: true.",
      inputSchema: {
        source: z.string().describe("Source path"),
        destination: z.string().describe("Destination path"),
        overwrite: z.boolean().default(false).describe("Allow replacing an existing destination (destructive, not undoable)"),
      },
      outputSchema: DualPathSuccessShape,
    },
    async ({ source, destination, overwrite }) => {
      const validSource = await validatePath(source, { bypassCache: true });
      const validDest = await validatePath(destination, { bypassCache: true });
      // Moving a folder moves every descendant — the deny-list must cover
      // the whole source tree AND every projected destination path
      // (audit P1, round 2).
      if ((await fs.lstat(validSource)).isDirectory()) {
        await assertTreeAllowed(validSource, validDest);
      }
      if (!overwrite) {
        // Files: hardlink+unlink is atomic and fails with EEXIST if the
        // destination appears at ANY point — no TOCTOU window at all.
        // Directories: cannot hardlink; keep the O_EXCL probe but verify
        // the rename target is still the probe inode (see below).
        const sourceStat = await fs.lstat(validSource);
        if (!sourceStat.isDirectory()) {
          try {
            // Atomic same-device move: hardlink+unlink. Fails EEXIST if the
            // destination appears at ANY point — zero TOCTOU window.
            await fs.link(validSource, validDest);
          } catch (err: unknown) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "EEXIST") {
              throw new Error(`destination exists: ${validDest} — pass overwrite: true to replace it (not undoable)`, { cause: err });
            }
            if (code !== "EXDEV" && code !== "EPERM") throw err;
            // Cross-device: copy into an O_EXCL handle (fd holds exclusivity)
            await copyFileNoReplace(validSource, validDest);
          }
          await fs.unlink(validSource);
          stalenessGuard.invalidate(validSource);
          invalidateRealpathCache(validSource);
          await stalenessGuard.recordFromPath(validDest);
          invalidateRealpathCache(validDest);
          return dualPathSuccessResponse("moved", source, destination);
        }
        // Directory move: mkdir probe ATOMICALLY takes the destination name.
        // rename then replaces OUR OWN (empty) probe dir — a concurrent
        // creator gets EEXIST at the mkdir, and rename can never swap out
        // a directory it didn't create. No TOCTOU window.
        try {
          await fs.mkdir(validDest);
        } catch {
          throw new Error(`destination exists: ${validDest} — pass overwrite: true to replace it (not undoable)`);
        }
      }
      try {
        await fs.rename(validSource, validDest);
      } catch (err: unknown) {
        // Roll back the probe so we don't leave an empty dir behind
        if (!overwrite) await fs.rmdir(validDest).catch(() => {});
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOTEMPTY" || code === "EEXIST") {
          throw new Error(`destination exists: ${validDest} — pass overwrite: true to replace it (not undoable)`, { cause: err });
        }
        throw err;
      }
      stalenessGuard.invalidate(validSource);
      invalidateRealpathCache(validSource);
      await stalenessGuard.recordFromPath(validDest);
      invalidateRealpathCache(validDest);
      return dualPathSuccessResponse("moved", source, destination);
    }
  );
}
