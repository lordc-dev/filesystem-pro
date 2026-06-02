/**
 * List Directory Tools
 *
 * Tools for listing directory contents.
 */

import { z } from "zod";
import { validatePath } from "../validation/path-validation.js";
import { formatSize } from "../utils/text-utils.js";
import { listDirectory } from "../file-operations/directory-utils.js";
import { jsonResponse } from "../utils/response-helpers.js";
import { PathSchema, DirectoryEntrySchema, TreeEntrySchema } from "../schemas/index.js";
import { buildTree, type BuildTreeOptions } from "./directory-helpers.js";
import { DEFAULT_EXCLUDE_DIRS, DEFAULT_TREE_MAX_DEPTH, DEFAULT_TREE_MAX_ENTRIES } from "../constants.js";
import type { ToolContext } from "./types.js";

export function registerListDirectoryTools({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "list_directory",
    {
      title: "List Directory",
      description: "List files and directories with [FILE] and [DIR] prefixes.",
      inputSchema: {
        path: PathSchema,
      },
      outputSchema: {
        entries: z.array(DirectoryEntrySchema).describe("Directory entries"),
      },
    },
    async ({ path: dirPath }) => {
      const validPath = await validatePath(dirPath);
      const entries = await listDirectory(validPath);

      const formatted = entries.map(
        (e) => `${e.isDirectory ? "[DIR]" : "[FILE]"} ${e.name}`
      );
      const structuredEntries = entries.map((e) => ({
        name: e.name,
        type: (e.isDirectory ? "directory" : "file") as "file" | "directory",
      }));

      return {
        content: [{ type: "text" as const, text: formatted.join("\n") }],
        structuredContent: { entries: structuredEntries },
      };
    }
  );

  readOnly(
    "list_directory_with_sizes",
    {
      title: "List Directory with Sizes",
      description: "List files and directories with size information.",
      inputSchema: {
        path: PathSchema,
        sortBy: z
          .enum(["name", "size"])
          .optional()
          .default("name")
          .describe("Sort order"),
      },
      outputSchema: {
        entries: z.array(DirectoryEntrySchema),
        summary: z.object({
          totalFiles: z.number(),
          totalDirectories: z.number(),
          totalSize: z.number(),
        }),
      },
    },
    async ({ path: dirPath, sortBy }) => {
      const validPath = await validatePath(dirPath);
      const entries = await listDirectory(validPath, { withSizes: true, sortBy });

      const formatted = entries.map(
        (e) =>
          `${e.isDirectory ? "[DIR]" : "[FILE]"} ${e.name.padEnd(30)} ${e.isDirectory ? "" : formatSize(e.size ?? 0).padStart(10)}`
      );

      const totalFiles = entries.filter((e) => !e.isDirectory).length;
      const totalDirs = entries.filter((e) => e.isDirectory).length;
      const totalSize = entries.reduce(
        (sum, e) => sum + (e.isDirectory ? 0 : e.size ?? 0),
        0
      );

      formatted.push(
        "",
        `Total: ${totalFiles} files, ${totalDirs} directories`,
        `Combined size: ${formatSize(totalSize)}`
      );

      const structuredEntries = entries.map((e) => ({
        name: e.name,
        type: (e.isDirectory ? "directory" : "file") as "file" | "directory",
        size: e.isDirectory ? undefined : e.size,
      }));

      return {
        content: [{ type: "text" as const, text: formatted.join("\n") }],
        structuredContent: {
          entries: structuredEntries,
          summary: { totalFiles, totalDirectories: totalDirs, totalSize },
        },
      };
    }
  );

  readOnly(
    "directory_tree",
    {
      title: "Directory Tree",
      description: `Get a recursive tree view as JSON. Defaults: maxDepth=${DEFAULT_TREE_MAX_DEPTH}, maxEntries=${DEFAULT_TREE_MAX_ENTRIES}. Excludes common non-source directories.`,
      inputSchema: {
        path: PathSchema,
        exclude: z
          .array(z.string())
          .optional()
          .describe(
            `Directories to exclude. Defaults to: ${DEFAULT_EXCLUDE_DIRS.join(", ")}. Pass empty array [] to include all.`
          ),
        maxDepth: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`Maximum depth to traverse. Default: ${DEFAULT_TREE_MAX_DEPTH}.`),
        maxEntries: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`Maximum entries to process before truncating. Default: ${DEFAULT_TREE_MAX_ENTRIES}.`),
      },
      outputSchema: {
        tree: z.array(TreeEntrySchema).describe("Recursive tree structure"),
      },
    },
    async ({ path: dirPath, exclude, maxDepth, maxEntries }) => {
      const options: BuildTreeOptions = {};
      
      // Only set exclude if explicitly provided (allows empty array to include all)
      if (exclude !== undefined) {
        options.exclude = exclude;
      }
      
      if (maxDepth !== undefined) {
        options.maxDepth = maxDepth;
      }
      
      if (maxEntries !== undefined) {
        options.maxEntries = maxEntries;
      }
      
      const tree = await buildTree(dirPath, options);
      return jsonResponse({ tree });
    }
  );
}
