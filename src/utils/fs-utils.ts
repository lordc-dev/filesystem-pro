import fs from "fs/promises";
import { randomBytes } from "crypto";
import { FILE_ENCODING } from "../constants.js";
import { invalidateRealpathCache } from "../validation/path-utils.js";

let tmpCounter = 0;

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const suffix = `${process.pid}.${tmpCounter++}.${randomBytes(4).toString("hex")}`;
  const tmp = `${filePath}.${suffix}.tmp`;
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(content, FILE_ENCODING);
    await handle.sync(); // fsync before rename for durability
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, filePath);
  invalidateRealpathCache(filePath);
}