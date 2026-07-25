/**
 * Move File/Directory Tool
 */

import fs from "fs/promises";
import { z } from "zod";
import { validatePath } from "../validation/path-validation.js";
import { dualPathSuccessResponse } from "../utils/response-helpers.js";
import { DualPathSuccessShape } from "../schemas/index.js";
import type { ToolContext } from "./types.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { invalidateRealpathCache } from "../validation/path-utils.js";

export function registerMoveFileTool({ factories }: ToolContext): void {
  const { standard } = factories;

  standard(
    "move_file",
    {
      title: "Move File",
      description: "Move or rename files and directories. Atomic operation — the source path no longer exists after a successful move.",
      inputSchema: {
        source: z.string().describe("Source path"),
        destination: z.string().describe("Destination path"),
      },
      outputSchema: DualPathSuccessShape,
    },
    async ({ source, destination }) => {
      const validSource = await validatePath(source, { bypassCache: true });
      const validDest = await validatePath(destination, { bypassCache: true });
      await fs.rename(validSource, validDest);
      stalenessGuard.invalidate(validSource);
      invalidateRealpathCache(validSource);
      await stalenessGuard.recordFromPath(validDest);
      invalidateRealpathCache(validDest);
      return dualPathSuccessResponse("moved", source, destination);
    }
  );
}
