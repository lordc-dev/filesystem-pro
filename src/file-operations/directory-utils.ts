/**
 * Directory listing utilities
 * 
 * All directory operations use ripgrep exclusively via listDirectoryWithRipgrep (SSOT).
 * Ripgrep is REQUIRED - operations will fail if not available.
 */

import fs from "fs/promises";
import path from "path";
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

  if (isDebugMode()) {
    logger.debug(`[ListDir] Using fs.readdir for ${dirPath}`);
  }

  // Use fs.readdir directly — ripgrep interprets bracket chars in paths
  // as glob patterns (e.g. `[core]` breaks), fs.readdir treats paths literally
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });

  const entries: DirectoryEntry[] = [];
  const seenDirs = new Set<string>();

  for (const entry of dirents) {
    // Skip hidden files unless requested
    if (!includeHidden && entry.name.startsWith('.')) continue;

    // Apply exclude patterns
    if (excludePatterns.length > 0) {
      const isExcluded = excludePatterns.some((p) => {
        const regex = new RegExp('^' + p.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        return regex.test(entry.name);
      });
      if (isExcluded) continue;
    }

    if (entry.isDirectory()) {
      if (recursive) {
        // Add the directory entry
        if (!seenDirs.has(entry.name)) {
          seenDirs.add(entry.name);
          entries.push({ name: entry.name, isDirectory: true });
        }
        // Recurse into subdirectory
        const subEntries = await listDirectory(
          path.join(dirPath, entry.name),
          { recursive, includeHidden, excludePatterns, withSizes, sortBy }
        );
        for (const sub of subEntries) {
          const fullName = path.join(entry.name, sub.name);
          if (!seenDirs.has(fullName)) {
            seenDirs.add(fullName);
            entries.push({ ...sub, name: fullName });
          }
        }
      } else {
        entries.push({ name: entry.name, isDirectory: true });
      }
    } else {
      entries.push({ name: entry.name, isDirectory: false });
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
