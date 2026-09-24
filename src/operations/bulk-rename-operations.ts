import fs from "node:fs/promises";
import path from "node:path";
import { globSearch } from "../search/index.js";
import { SearchError } from "../errors/index.js";
import { validatePath } from "../validation/path-validation.js";
import { validateRegexPattern } from "../validation/index.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { invalidateRealpathCache } from "../validation/path-utils.js";

export interface BulkRenameOptions {
  pattern: string;
  replacement: string;
  recursive?: boolean;
  dryRun?: boolean;
  includeExtensions?: string[];
  excludePatterns?: string[];
}

/**
 * Result of a single file rename operation
 */
export interface FileRenameResult {
  from: string;
  to: string;
  status: "renamed" | "skipped" | "error";
  error?: string;
}

/**
 * Apply pattern replacement to filename. Result is constrained to a
 * basename-only rename: separators, '.', '..' and empty names are rejected
 * so no computed path can escape the source directory.
 */
function applyRenamePattern(
  filename: string,
  regex: RegExp,
  replacement: string,
): string {
  try {
    const basename = path.basename(filename);
    const dirname = path.dirname(filename);

    // Apply replacement to basename only
    const newBasename = basename.replace(regex, replacement);

    // If no change, return original
    if (newBasename === basename) {
      return filename;
    }

    // Containment: reject names that would move or escape
    if (
      newBasename === "" ||
      newBasename === "." ||
      newBasename === ".." ||
      newBasename.includes("/") ||
      newBasename.includes(path.sep) ||
      path.isAbsolute(newBasename)
    ) {
      throw new Error(`computed name "${newBasename}" is not a valid filename (rename-only, no moves)`);
    }

    return path.join(dirname, newBasename);
  } catch (err) {
    // Containment rejections are plain Errors — let their message through
    if (err instanceof Error && !(err instanceof SearchError)) throw err;
    throw new SearchError(regex.source, { context: { reason: "invalid regex" } });
  }
}

/**
 * Compile the rename pattern once (validation + RegExp construction)
 */
function compileRenamePattern(pattern: string): RegExp {
  const validation = validateRegexPattern(pattern);
  if (!validation.valid) {
    throw new SearchError(pattern, { context: { reason: validation.errorMessage ?? validation.errors.join("; ") } });
  }
  try {
    return new RegExp(pattern);
  } catch {
    throw new SearchError(pattern, { context: { reason: "invalid regex" } });
  }
}

/**
 * Check if file should be included based on extensions
 */
function shouldIncludeFile(
  filepath: string,
  includeExtensions?: string[],
): boolean {
  if (!includeExtensions || includeExtensions.length === 0) {
    return true;
  }

  const ext = path.extname(filepath).toLowerCase().substring(1);
  return includeExtensions.some(
    (includedExt) =>
      includedExt.toLowerCase() === ext ||
      includedExt.toLowerCase() === `.${ext}`,
  );
}

/**
 * Perform bulk rename operation
 */
export async function bulkRename(
  searchPath: string,
  options: BulkRenameOptions,
): Promise<{
  renamed: FileRenameResult[];
  errors: FileRenameResult[];
  skipped: FileRenameResult[];
}> {
  const {
    pattern,
    replacement,
    recursive = false,
    dryRun = true,
    includeExtensions = [],
    excludePatterns = [],
  } = options;

  const results: FileRenameResult[] = [];

  // Build glob pattern - use globSearch for SSOT
  const globPattern = recursive ? "**/*" : "*";

  // Find all files using ripgrep-based globSearch (SSOT)
  const files = await globSearch(globPattern, {
    cwd: searchPath,
    onlyFiles: true,
    ignore: excludePatterns,
    absolute: true,
    skipValidation: true,
  });

  // Pre-compute rename targets synchronously (regex is CPU-bound, no I/O)
  // and atomically reserve targets to detect intra-batch collisions
  const renameRegex = compileRenamePattern(pattern);
  const reservedTargets = new Set<string>();
  const planned: Array<{ file: string; newPath: string; result?: FileRenameResult }> = [];

  for (const file of files) {
    if (!shouldIncludeFile(file, includeExtensions)) {
      results.push({ from: file, to: file, status: "skipped", error: "File extension not included" });
      continue;
    }

    try {
      const newPath = applyRenamePattern(file, renameRegex, replacement);

      if (newPath === file) {
        results.push({ from: file, to: file, status: "skipped", error: "Pattern did not match" });
        continue;
      }

      // Atomic intra-batch collision check: two files renaming to same target
      if (reservedTargets.has(newPath)) {
        results.push({ from: file, to: newPath, status: "error", error: "Target file already exists" });
        continue;
      }
      reservedTargets.add(newPath);

      // Containment: every computed destination must validate against roots
      // and deny-list — also during dryRun, so the preview never shows escapes.
      try {
        await validatePath(newPath, { bypassCache: true });
      } catch (err: unknown) {
        results.push({ from: file, to: newPath, status: "error", error: err instanceof Error ? err.message : String(err) });
        continue;
      }

      planned.push({ file, newPath });
    } catch (error: unknown) {
      results.push({
        from: file,
        to: file,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Execute renames in parallel batches
  const CONCURRENCY = 8;
  for (let i = 0; i < planned.length; i += CONCURRENCY) {
    const batch = planned.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async ({ file, newPath }) => {
      // Check if target already exists on disk — ONLY ENOENT means free.
      // EACCES/EPERM etc. must surface as errors, not silently "proceed".
      try {
        await fs.access(newPath);
        return { from: file, to: newPath, status: "error" as const, error: "Target file already exists" };
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          return { from: file, to: newPath, status: "error" as const, error: `Target check failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      if (!dryRun) {
        try {
          await fs.rename(file, newPath);
          stalenessGuard.invalidate(file);
          invalidateRealpathCache(file);
          await stalenessGuard.recordFromPath(newPath);
          invalidateRealpathCache(newPath);
        } catch (error: unknown) {
          return {
            from: file,
            to: newPath,
            status: "error" as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      return { from: file, to: newPath, status: "renamed" as const };
    }));

    results.push(...batchResults);
  }

  // Categorize results
  const renamed = results.filter((r) => r.status === "renamed");
  const errors = results.filter((r) => r.status === "error");
  const skipped = results.filter((r) => r.status === "skipped");

  return { renamed, errors, skipped };
}

/**
 * Generate a summary report of rename operations
 */
export function generateRenameReport(results: {
  renamed: FileRenameResult[];
  errors: FileRenameResult[];
  skipped: FileRenameResult[];
}): string {
  const total = results.renamed.length + results.errors.length + results.skipped.length;
  const lines: string[] = [
    "=== Bulk Rename Report ===",
    `Total files processed: ${total}`,
    `Successfully renamed: ${results.renamed.length}`,
    `Errors: ${results.errors.length}`,
    `Skipped: ${results.skipped.length}`,
    "",
  ];

  if (results.renamed.length > 0) {
    lines.push("=== Renamed Files ===");
    for (const r of results.renamed) {
      lines.push(`✓ ${r.from} → ${r.to}`);
    }
    lines.push("");
  }

  if (results.errors.length > 0) {
    lines.push("=== Errors ===");
    for (const r of results.errors) {
      lines.push(`✗ ${r.from}: ${r.error}`);
    }
    lines.push("");
  }

  if (results.skipped.length > 0 && results.skipped.length <= 20) {
    lines.push("=== Skipped Files ===");
    for (const r of results.skipped) {
      lines.push(`- ${r.from}: ${r.error}`);
    }
  } else if (results.skipped.length > 20) {
    lines.push(
      `=== Skipped ${results.skipped.length} files (pattern did not match) ===`,
    );
  }

  return lines.join("\n");
}
