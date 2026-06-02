/**
 * Directory Tools - Shared Helpers
 *
 * Helper functions used by directory tools.
 */

import fs from "fs/promises";
import path from "path";
import { validatePath } from "../validation/path-validation.js";
import { DEFAULT_EXCLUDE_DIRS, DEFAULT_TREE_MAX_DEPTH, DEFAULT_TREE_MAX_ENTRIES } from "../constants.js";

/**
 * Tree entry structure for directory tree
 */
export interface TreeEntry {
  name: string;
  type: "file" | "directory";
  children?: TreeEntry[];
}

/**
 * Options for building directory tree
 */
export interface BuildTreeOptions {
  /** Directories to exclude (defaults to DEFAULT_EXCLUDE_DIRS) */
  exclude?: string[];
  /** Maximum depth to traverse (defaults to DEFAULT_TREE_MAX_DEPTH) */
  maxDepth?: number;
  /** Maximum entries to process (defaults to DEFAULT_TREE_MAX_ENTRIES) */
  maxEntries?: number;
}

/**
 * Internal state for tracking entry count across recursive calls
 */
interface BuildTreeState {
  entryCount: number;
  limitReached: boolean;
}

/**
 * Recursively build a tree structure of a directory
 * 
 * @param currentPath - Path to start building tree from
 * @param options - Optional configuration for exclusions, depth, and entry limits
 * @param currentDepth - Internal: current recursion depth
 * @param state - Internal: shared state for entry counting
 */
export async function buildTree(
  currentPath: string,
  options: BuildTreeOptions = {},
  currentDepth: number = 0,
  state: BuildTreeState = { entryCount: 0, limitReached: false }
): Promise<TreeEntry[]> {
  const { 
    exclude = [...DEFAULT_EXCLUDE_DIRS], 
    maxDepth = DEFAULT_TREE_MAX_DEPTH,
    maxEntries = DEFAULT_TREE_MAX_ENTRIES
  } = options;
  
  // Check if we've already hit the entry limit
  if (state.limitReached) {
    return [];
  }
  
  const validPath = await validatePath(currentPath);
  const entries = await fs.readdir(validPath, { withFileTypes: true });
  const result: TreeEntry[] = [];

  for (const entry of entries) {
    // Check entry limit
    if (state.entryCount >= maxEntries) {
      state.limitReached = true;
      result.push({
        name: `... (truncated: ${maxEntries} entry limit reached)`,
        type: "file",
      });
      break;
    }
    
    // Skip excluded directories
    if (entry.isDirectory() && exclude.includes(entry.name)) {
      continue;
    }

    state.entryCount++;
    
    const entryData: TreeEntry = {
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    };

    if (entry.isDirectory()) {
      // Check depth limit before recursing
      if (currentDepth < maxDepth) {
        entryData.children = await buildTree(
          path.join(currentPath, entry.name),
          options,
          currentDepth + 1,
          state
        );
      } else {
        // At max depth, indicate there are children without expanding
        entryData.children = [];
      }
    }

    result.push(entryData);
  }

  return result;
}

/**
 * Get file statistics
 */
export async function getFileStats(filePath: string) {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    accessed: stats.atime.toISOString(),
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}
