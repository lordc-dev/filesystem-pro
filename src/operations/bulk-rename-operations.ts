import fs from "fs/promises";
import path from "path";
import { globSearch } from "../search/index.js";
import { SearchError } from "../errors/index.js";

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
 * Apply pattern replacement to filename
 */
function applyRenamePattern(
  filename: string,
  pattern: string,
  replacement: string,
): string {
  try {
    const regex = new RegExp(pattern);
    const basename = path.basename(filename);
    const dirname = path.dirname(filename);

    // Apply replacement to basename only
    const newBasename = basename.replace(regex, replacement);

    // If no change, return original
    if (newBasename === basename) {
      return filename;
    }

    return path.join(dirname, newBasename);
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

  // Process each file
  for (const file of files) {
    // Check if file should be included
    if (!shouldIncludeFile(file, includeExtensions)) {
      results.push({
        from: file,
        to: file,
        status: "skipped",
        error: "File extension not included",
      });
      continue;
    }

    try {
      const newPath = applyRenamePattern(file, pattern, replacement);

      // Skip if no change
      if (newPath === file) {
        results.push({
          from: file,
          to: file,
          status: "skipped",
          error: "Pattern did not match",
        });
        continue;
      }

      // Check if target already exists
      try {
        await fs.access(newPath);
        results.push({
          from: file,
          to: newPath,
          status: "error",
          error: "Target file already exists",
        });
        continue;
      } catch {
        // Target doesn't exist, good to proceed
      }

      // Perform rename if not dry run
      if (!dryRun) {
        await fs.rename(file, newPath);
      }

      results.push({
        from: file,
        to: newPath,
        status: "renamed",
      });
    } catch (error: unknown) {
      results.push({
        from: file,
        to: file,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
  const lines: string[] = [];

  lines.push("=== Bulk Rename Report ===");
  lines.push(
    `Total files processed: ${results.renamed.length + results.errors.length + results.skipped.length}`,
  );
  lines.push(`Successfully renamed: ${results.renamed.length}`);
  lines.push(`Errors: ${results.errors.length}`);
  lines.push(`Skipped: ${results.skipped.length}`);
  lines.push("");

  if (results.renamed.length > 0) {
    lines.push("=== Renamed Files ===");
    results.renamed.forEach((r) => {
      lines.push(`✓ ${r.from} → ${r.to}`);
    });
    lines.push("");
  }

  if (results.errors.length > 0) {
    lines.push("=== Errors ===");
    results.errors.forEach((r) => {
      lines.push(`✗ ${r.from}: ${r.error}`);
    });
    lines.push("");
  }

  if (results.skipped.length > 0 && results.skipped.length <= 20) {
    lines.push("=== Skipped Files ===");
    results.skipped.forEach((r) => {
      lines.push(`- ${r.from}: ${r.error}`);
    });
  } else if (results.skipped.length > 20) {
    lines.push(
      `=== Skipped ${results.skipped.length} files (pattern did not match) ===`,
    );
  }

  return lines.join("\n");
}
