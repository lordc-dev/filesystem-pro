/**
 * Delete File/Directory Tools
 */

import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { DirectoryError } from "../errors/index.js";
import { validatePath } from "../validation/path-validation.js";
import { pathSuccessResponse } from "../utils/response-helpers.js";
import { PathSchema, PathSuccessShape, SuccessShape } from "../schemas/index.js";
import type { ToolContext } from "./types.js";
import { undoManager } from "../undo/undo-manager.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { invalidateRealpathCache, normalizePath, resolvePath } from "../validation/path-utils.js";

async function collectFilesInDir(dir: string): Promise<string[]> {
  const entries: string[] = [];
  async function walk(d: string): Promise<void> {
    const items = await fs.readdir(d, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(d, item.name);
      if (item.isDirectory()) {
        await walk(fullPath);
        // Capture empty dirs so undo can recreate the full tree shape.
        // Non-empty dirs are recreated implicitly by file restores (mkdir -p).
        const items = await fs.readdir(fullPath);
        if (items.length === 0) entries.push(fullPath);
      } else {
        // Everything that is not a directory: regular files, symlinks,
        // fifos... captureState classifies each (symlinks become
        // link snapshots, fifos become notUndoable) — undo decides.
        entries.push(fullPath);
      }
    }
  }
  await walk(dir);
  return entries;
}

export function registerDeleteTools({ factories }: ToolContext): void {
  const { destructive } = factories;

  destructive(
    "delete_file",
    {
      title: "Delete File",
      description: "Delete a file. Can be undone with filesystem_undo.",
      inputSchema: {
        path: PathSchema.describe("Path to the file to delete"),
      },
      outputSchema: PathSuccessShape,
      annotations: { idempotentHint: true },
    },
    async ({ path: filePath }) => {
      const validPath = await validatePath(filePath, { bypassCache: true });

      // validatePath resolves symlinks — for a symlink, delete the LINK
      // itself, never the target (unlink on the resolved path would delete
      // the destination file and leave the link behind).
      const linkPath = normalizePath(resolvePath(filePath));
      let isLink = false;
      try {
        isLink = (await fs.lstat(linkPath)).isSymbolicLink();
      } catch {
        // not a symlink or lstat failed — fall through to resolved path
      }
      if (isLink) {
        await undoManager.record(linkPath, `delete_file: ${linkPath}`);
        await fs.unlink(linkPath);
        stalenessGuard.invalidate(linkPath);
        invalidateRealpathCache(linkPath);
        return pathSuccessResponse("deleted symlink", filePath);
      }

      const stats = await fs.stat(validPath);

      if (stats.isDirectory()) {
        throw new DirectoryError(filePath, "delete-dir-with-file-flag");
      }

      await undoManager.record(validPath, `delete_file: ${validPath}`);
      await fs.unlink(validPath);
      stalenessGuard.invalidate(validPath);
      invalidateRealpathCache(validPath);
      return pathSuccessResponse("deleted file", filePath);
    }
  );

  destructive(
    "delete_directory",
    {
      title: "Delete Directory",
      description:
        "Delete a directory. Use recursive=true to delete non-empty directories. Can be undone with filesystem_undo.",
      inputSchema: {
        path: PathSchema.describe("Path to the directory to delete"),
        recursive: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, delete directory and all contents. If false, only delete if empty."
          ),
      },
      outputSchema: PathSuccessShape,
      annotations: { idempotentHint: true },
    },
    async ({ path: dirPath, recursive }) => {
      const validPath = await validatePath(dirPath, { bypassCache: true });
      const stats = await fs.stat(validPath);

      if (!stats.isDirectory()) {
        throw new DirectoryError(dirPath, "delete-file-with-dir-flag");
      }

      if (recursive) {
        const entries = await collectFilesInDir(validPath);
        await undoManager.recordBatch(entries.map(p => ({ filePath: p, description: `delete_directory: ${p}` })));
        await fs.rm(validPath, { recursive: true, force: true });
        for (const entry of entries) stalenessGuard.invalidate(entry);
        stalenessGuard.invalidate(validPath);
        invalidateRealpathCache(validPath);
        return pathSuccessResponse("deleted directory recursively", dirPath);
      } else {
        await undoManager.record(validPath, `delete_directory: ${validPath}`);
        await fs.rmdir(validPath);
        stalenessGuard.invalidate(validPath);
        invalidateRealpathCache(validPath);
        return pathSuccessResponse("deleted empty directory", dirPath);
      }
    }
  );

  destructive(
    "delete_path",
    {
      title: "Delete Path",
      description:
        "Delete a file or directory. Automatically detects type. Use recursive=true for non-empty directories. Can be undone with filesystem_undo.",
      inputSchema: {
        path: PathSchema.describe("Path to the file or directory to delete"),
        recursive: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true and path is a directory, delete all contents. Required for non-empty directories."
          ),
      },
      outputSchema: {
        ...SuccessShape,
        path: z.string(),
        type: z.enum(["file", "directory"]).describe("Type of the deleted item"),
      },
      annotations: { idempotentHint: true },
    },
    async ({ path: targetPath, recursive }) => {
      const validPath = await validatePath(targetPath, { bypassCache: true });
      const stats = await fs.stat(validPath);
      const isDir = stats.isDirectory();

      if (isDir) {
        if (recursive) {
          const entries = await collectFilesInDir(validPath);
          await undoManager.recordBatch(entries.map(p => ({ filePath: p, description: `delete_path: ${p}` })));
          await fs.rm(validPath, { recursive: true, force: true });
          for (const entry of entries) stalenessGuard.invalidate(entry);
          stalenessGuard.invalidate(validPath);
          invalidateRealpathCache(validPath);
        } else {
          await undoManager.record(validPath, `delete_path: ${validPath}`);
          await fs.rmdir(validPath);
          stalenessGuard.invalidate(validPath);
          invalidateRealpathCache(validPath);
        }
      } else {
        const linkPath = normalizePath(resolvePath(targetPath));
        let isLink = false;
        try {
          isLink = (await fs.lstat(linkPath)).isSymbolicLink();
        } catch {
          // not a symlink — fall through
        }
        if (isLink) {
          await undoManager.record(linkPath, `delete_path: ${linkPath}`);
          await fs.unlink(linkPath);
          stalenessGuard.invalidate(linkPath);
          invalidateRealpathCache(linkPath);
        } else {
          await undoManager.record(validPath, `delete_path: ${validPath}`);
          await fs.unlink(validPath);
          stalenessGuard.invalidate(validPath);
          invalidateRealpathCache(validPath);
        }
      }

      const message = `Successfully deleted ${isDir ? "directory" : "file"}: ${targetPath}`;
      return {
        content: [{ type: "text" as const, text: message }],
        structuredContent: {
          success: true,
          message,
          path: targetPath,
          type: isDir ? "directory" : "file",
        },
      };
    }
  );
}
