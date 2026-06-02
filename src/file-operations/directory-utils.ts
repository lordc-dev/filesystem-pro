/**
 * Directory listing utilities
 * 
 * All directory operations use ripgrep exclusively via listDirectoryWithRipgrep (SSOT).
 * Ripgrep is REQUIRED - operations will fail if not available.
 */

import fs from "fs/promises";
import path from "path";
import { listDirectoryWithRipgrep, ensureRipgrep } from "../search/index.js";
import { logger } from "../utils/logger.js";
import { isDebugMode } from "../constants.js";

/**
 * Directory entry with optional metadata
 */
export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
  mtime?: Date;
}

/**
 * Options for directory listing
 */
export interface ListDirectoryOptions {
  /** Include subdirectories recursively */
  recursive?: boolean;
  /** Include hidden files (starting with .) */
  includeHidden?: boolean;
  /** Patterns to exclude */
  excludePatterns?: string[];
  /** Include file sizes */
  withSizes?: boolean;
  /** Sort by name or size */
  sortBy?: "name" | "size";
}

/**
 * Directory listing function using ripgrep (SSOT)
 * 
 * Uses listDirectoryWithRipgrep as the single source of truth for
 * ripgrep-based directory listing, then transforms results to DirectoryEntry format.
 * 
 * @param dirPath - Directory path to list
 * @param options - Listing options
 * @returns Array of directory entries
 */
export async function listDirectory(
  dirPath: string,
  options: ListDirectoryOptions = {}
): Promise<DirectoryEntry[]> {
  const {
    recursive = false,
    includeHidden = false,
    excludePatterns = [],
    withSizes = false,
    sortBy = "name",
  } = options;

  // Ensure ripgrep is available
  await ensureRipgrep();

  if (isDebugMode()) {
    logger.debug(`[ListDir] Using ripgrep for ${dirPath}`);
  }

  // Call SSOT function for ripgrep-based listing
  const files = await listDirectoryWithRipgrep(dirPath, {
    recursive,
    includeHidden,
    excludePatterns,
  });

  // Transform raw file paths to DirectoryEntry format
  const entries: DirectoryEntry[] = [];
  const seenDirs = new Set<string>();

  for (const file of files) {
    const relativePath = path.relative(dirPath, file);
    const parts = relativePath.split(path.sep);

    // For recursive listing, add parent directories
    if (recursive) {
      for (let i = 1; i < parts.length; i++) {
        const dirName = parts.slice(0, i).join(path.sep);
        if (!seenDirs.has(dirName)) {
          seenDirs.add(dirName);
          entries.push({
            name: dirName,
            isDirectory: true,
          });
        }
      }
    }

    // Add the file entry
    const name = recursive ? relativePath : parts[0];
    if (!seenDirs.has(name)) {
      entries.push({
        name,
        isDirectory: false,
      });
    }
  }

  // Add sizes if requested
  const result = withSizes ? await addSizesToEntries(dirPath, entries) : entries;

  // Sort entries
  if (sortBy === "size") {
    result.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  } else {
    result.sort((a, b) => a.name.localeCompare(b.name));
  }

  return result;
}

/**
 * Add size information to entries
 * @internal Helper function for listDirectory
 */
async function addSizesToEntries(
  basePath: string,
  entries: DirectoryEntry[]
): Promise<DirectoryEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory) {
        return entry;
      }

      try {
        const fullPath = path.join(basePath, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          ...entry,
          size: stats.size,
          mtime: stats.mtime,
        };
      } catch {
        return entry;
      }
    })
  );
}
