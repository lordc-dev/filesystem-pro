/**
 * Ripgrep Glob Operations
 * 
 * Glob-based file finding and directory listing using ripgrep.
 */

import fs from "fs/promises";
import path from "path";

import { validateGlobPattern } from "../validation/pattern-validation.js";
import { logger } from "../utils/logger.js";
import { isDebugMode, DEFAULT_EXCLUDE_DIRS } from "../constants.js";
import { rgArgs, parseRipgrepLines } from "./ripgrep-args.js";
import { ensureRipgrep, executeRipgrep } from "./ripgrep-executor.js";
import type { GlobOptions, DirectoryListOptions } from "./ripgrep-types.js";

// ============================================================================
// GLOB SEARCH (SSOT - Single implementation)
// ============================================================================

/**
 * Find files using glob patterns (ripgrep only)
 * This is the SSOT for glob operations - use this instead of findFilesByGlob
 */
export async function globSearch(
  patterns: string | string[],
  options: GlobOptions = {}
): Promise<string[]> {
  await ensureRipgrep();

  // Parse patterns if JSON string
  let globPatterns: string[];
  if (typeof patterns === "string" && patterns.startsWith("[")) {
    try {
      globPatterns = JSON.parse(patterns);
    } catch {
      globPatterns = [patterns];
    }
  } else {
    globPatterns = Array.isArray(patterns) ? patterns : [patterns];
  }

  // Validate patterns unless explicitly skipped
  if (!options.skipValidation) {
    const validation = validateGlobPattern(globPatterns, { autoFix: true });
    if (!validation.valid) {
      throw new Error(validation.errorMessage);
    }
    
    // Use sanitized patterns if available
    if (validation.sanitized) {
      globPatterns = validation.sanitized as string[];
    }
    
    // Log auto-fixes in debug mode
    if (validation.warnings.length > 0 && isDebugMode()) {
      logger.debug('[globSearch] Auto-fixed patterns:', validation.warnings);
    }
  }

  const builder = rgArgs()
    .files()
    .noMessages()
    .hidden()
    .follow(options.followSymlinks ?? false);
  
  if (options.deep !== undefined) builder.maxDepth(options.deep);
  
  // Merge user-provided ignore patterns with defaults (node_modules, dist, .git, etc.)
  const ignorePatterns = [...DEFAULT_EXCLUDE_DIRS, ...(options.ignore ?? [])];
  
  builder
    .glob(globPatterns)
    .exclude(ignorePatterns)
    .path(options.cwd ?? process.cwd());

  const args = builder.build();

  let results = parseRipgrepLines(await executeRipgrep(args));

  // Filter by type if needed
  if (options.onlyFiles || options.onlyDirectories) {
    const statPromises = await Promise.all(
      results.map(async (file) => {
        try {
          const stat = await fs.stat(file);
          return { file, isFile: stat.isFile(), isDir: stat.isDirectory() };
        } catch {
          return { file, isFile: false, isDir: false };
        }
      })
    );
    const filtered: string[] = [];
    for (const { file, isFile, isDir } of statPromises) {
      if (options.onlyFiles && isFile) filtered.push(file);
      else if (options.onlyDirectories && isDir) filtered.push(file);
    }
    results = filtered;
  }

  // Convert to absolute paths if needed
  if (options.absolute !== false && options.cwd) {
    results = results.map((f) =>
      path.isAbsolute(f) ? f : path.resolve(options.cwd!, f)
    );
  }

  return results;
}

// ============================================================================
// DIRECTORY LISTING
// ============================================================================

/**
 * List directory contents using ripgrep
 */
export async function listDirectoryWithRipgrep(
  dirPath: string,
  options: DirectoryListOptions = {}
): Promise<string[]> {
  await ensureRipgrep();

  const builder = rgArgs()
    .files()
    .noMessages();
  
  if (options.includeHidden) builder.hidden();
  if (!options.recursive) builder.maxDepth(1);
  
  builder
    .exclude(options.excludePatterns ?? [])
    .path(dirPath);

  const files = parseRipgrepLines(await executeRipgrep(builder.build()));

  // Filter to direct children if not recursive
  if (!options.recursive) {
    return files.filter((file) => {
      const relative = path.relative(dirPath, file);
      return !relative.includes(path.sep);
    });
  }

  return files;
}
