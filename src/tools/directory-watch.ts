/**
 * Watch Directory Tools
 */

import { z } from "zod";
import { WatcherError } from "../errors/index.js";
import { validatePath } from "../validation/path-validation.js";
import { watcherManager } from "../file-operations/watch-utils.js";
import {
  watcherStartedResponse,
  watcherStoppedResponse,
} from "../utils/response-helpers.js";
import { PathSchema, WatcherResponseSchema } from "../schemas/index.js";
import { } from "../constants.js";
import type { ToolContext } from "./types.js";

export function registerWatchTools({ factories }: ToolContext): void {
  const { readOnly, standard } = factories;

  readOnly(
    "watch_directory",
    {
      title: "Watch Directory",
      description: "Watch a directory for changes. Returns a watcher ID.",
      inputSchema: {
        path: PathSchema,
        recursive: z
          .boolean()
          .optional()
          .default(true)
          .describe("Watch subdirectories"),
        excludePatterns: z.array(z.string()).optional().default([]),
        events: z
          .array(z.enum(["add", "change", "unlink", "addDir", "unlinkDir"]))
          .optional()
          .describe("Events to watch"),
      },
      outputSchema: WatcherResponseSchema,
    },
    async ({ path: dirPath, recursive, excludePatterns, events }) => {
      const validPath = await validatePath(dirPath);
      const watcherId = `watch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const watcher = watcherManager.createWatcher(watcherId, {
        path: validPath,
        recursive,
        excludePatterns,
        events,
      });

      watcher.start();
      return watcherStartedResponse(watcherId, dirPath);
    }
  );

  standard(
    "stop_watching",
    {
      title: "Stop Watching",
      description: "Stop watching a directory by watcher ID.",
      inputSchema: {
        watcherId: z.string().describe("Watcher ID to stop"),
      },
      outputSchema: {
        success: z.boolean(),
        watcherId: z.string(),
        message: z.string(),
      },
    },
    async ({ watcherId }) => {
      const removed = await watcherManager.removeWatcher(watcherId);
      if (!removed) {
        throw new WatcherError(watcherId, "not found");
      }
      return watcherStoppedResponse(watcherId);
    }
  );
}
