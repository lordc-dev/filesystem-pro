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
import { } from "../constants.js";
import type { ToolContext } from "./types.js";
import { undoManager } from "../undo/undo-manager.js";

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
      const validPath = await validatePath(filePath);
      const stats = await fs.stat(validPath);

      if (stats.isDirectory()) {
        throw new DirectoryError(filePath, "delete-dir-with-file-flag");
      }

      await undoManager.record(validPath, `delete_file: ${validPath}`);
      await fs.unlink(validPath);
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
      const validPath = await validatePath(dirPath);
      const stats = await fs.stat(validPath);

      if (!stats.isDirectory()) {
        throw new DirectoryError(dirPath, "delete-file-with-dir-flag");
      }

      if (recursive) {
        // Record all files inside the directory for undo before deletion
        const entries: string[] = [];
        async function walk(dir: string): Promise<void> {
          const items = await fs.readdir(dir, { withFileTypes: true });
          for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
              await walk(fullPath);
            } else if (item.isFile()) {
              entries.push(fullPath);
            }
          }
        }
        await walk(validPath);
        await undoManager.recordBatch(entries.map(p => ({ filePath: p, description: `delete_directory: ${p}` })));
        await fs.rm(validPath, { recursive: true, force: true });
        return pathSuccessResponse("deleted directory recursively", dirPath);
      } else {
        await fs.rmdir(validPath);
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
      const validPath = await validatePath(targetPath);
      const stats = await fs.stat(validPath);
      const isDir = stats.isDirectory();

      if (isDir) {
        if (recursive) {
          // Record all files inside the directory for undo before deletion
          const entries: string[] = [];
          async function walk(dir: string): Promise<void> {
            const items = await fs.readdir(dir, { withFileTypes: true });
            for (const item of items) {
              const fullPath = path.join(dir, item.name);
              if (item.isDirectory()) {
                await walk(fullPath);
              } else if (item.isFile()) {
                entries.push(fullPath);
              }
            }
          }
          await walk(validPath);
          await undoManager.recordBatch(entries.map(p => ({ filePath: p, description: `delete_path: ${p}` })));
          await fs.rm(validPath, { recursive: true, force: true });
        } else {
          await fs.rmdir(validPath);
        }
      } else {
        await undoManager.record(validPath, `delete_path: ${validPath}`);
        await fs.unlink(validPath);
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
