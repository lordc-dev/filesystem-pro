/**
 * Create Directory Tool
 */

import fs from "fs/promises";
import { validatePath } from "../validation/path-validation.js";
import { pathSuccessResponse } from "../utils/response-helpers.js";
import { PathSchema, PathSuccessShape } from "../schemas/index.js";
import type { ToolContext } from "./types.js";

export function registerCreateDirectoryTool({ factories }: ToolContext): void {
  const { idempotent } = factories;

  idempotent(
    "create_directory",
    {
      title: "Create Directory",
      description: "Create a directory including any nested parent directories. Idempotent — no error if the directory already exists.",
      inputSchema: {
        path: PathSchema,
      },
      outputSchema: PathSuccessShape,
    },
    async ({ path: dirPath }) => {
      const validPath = await validatePath(dirPath);
      await fs.mkdir(validPath, { recursive: true });
      return pathSuccessResponse("created directory", dirPath);
    }
  );
}
