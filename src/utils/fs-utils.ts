import fs from "fs/promises";
import { randomBytes } from "crypto";
import { FILE_ENCODING } from "../constants.js";
import { getConfig } from "../config/index.js";
import { invalidateRealpathCache } from "../validation/path-utils.js";
import { stalenessGuard } from "../undo/staleness-guard.js";

let tmpCounter = 0;

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const suffix = `${process.pid}.${tmpCounter++}.${randomBytes(4).toString("hex")}`;
  const tmp = `${filePath}.${suffix}.tmp`;
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(content, FILE_ENCODING);
    // fsync configurable: MCP_WRITE_FSYNC=0 skips it (rename is still atomic,
    // only crash-durability of the rename is traded for latency)
    // Defensive ?. — config snapshots from older tests/mocks may lack `write`
    if (getConfig().write?.fsync !== false) {
      await handle.sync();
    }
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, filePath);
  invalidateRealpathCache(filePath);
  await stalenessGuard.recordFromPath(filePath);
}