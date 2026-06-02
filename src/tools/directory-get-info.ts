/**
 * Get File Info Tool
 */

import { z } from "zod";
import { validatePath } from "../validation/path-validation.js";
import { infoResponse } from "../utils/response-helpers.js";
import { PathSchema } from "../schemas/index.js";
import { getFileStats } from "./directory-helpers.js";
import type { ToolContext } from "./types.js";

export function registerGetFileInfoTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "get_file_info",
    {
      title: "Get File Info",
      description: "Get file metadata including size, creation/modification/access dates, file type, and permissions.",
      inputSchema: {
        path: PathSchema,
      },
      outputSchema: {
        size: z.number(),
        created: z.string(),
        modified: z.string(),
        accessed: z.string(),
        isDirectory: z.boolean(),
        isFile: z.boolean(),
        permissions: z.string(),
      },
    },
    async ({ path: filePath }) => {
      const validPath = await validatePath(filePath);
      const info = await getFileStats(validPath);
      return infoResponse(info);
    }
  );
}
