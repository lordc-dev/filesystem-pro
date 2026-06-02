/**
 * List Allowed Directories Tool
 */

import { z } from "zod";
import { rootsManager } from "../validation/roots-manager.js";
import { isRootsRestrictionEnabled } from "../config/index.js";
import { messageResponse } from "../utils/response-helpers.js";
import type { ToolContext } from "./types.js";

export function registerListAllowedDirectoriesTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "list_allowed_directories",
    {
      title: "List Allowed Directories",
      description: "Returns allowed directories based on MCP Roots Protocol.",
      inputSchema: {},
      outputSchema: {
        message: z.string(),
        isRestricted: z.boolean(),
        roots: z.array(
          z.object({
            uri: z.string(),
            name: z.string().optional(),
            resolvedPath: z.string().optional(),
          })
        ),
      },
    },
    async () => {
      const isRestricted =
        isRootsRestrictionEnabled() && rootsManager.isRestricted();
      const roots = rootsManager.getRoots();
      const resolvedPaths = await rootsManager.getResolvedPaths();

      const rootsWithPaths = roots.map((root, i) => ({
        uri: root.uri,
        name: root.name,
        resolvedPath: resolvedPaths[i],
      }));

      const message = isRestricted
        ? `Access restricted to ${roots.length} root(s):\n${rootsWithPaths.map((r) => `  - ${r.name ?? r.uri} (${r.resolvedPath})`).join("\n")}`
        : "Running in unrestricted mode - all paths accessible";

      return messageResponse(message, { isRestricted, roots: rootsWithPaths });
    }
  );
}
