/**
 * Ripgrep Search Operations
 * 
 * File and content search functionality using ripgrep.
 */

import { validateRegexPattern } from "../validation/pattern-validation.js";
import { rgArgs, parseRipgrepLines } from "./ripgrep-args.js";
import { ensureRipgrep, executeRipgrep, executeRipgrepWithLimit, requiresPCRE2 } from "./ripgrep-executor.js";
import { getConfig } from "../config/index.js";
import type {
  ContentSearchResult,
  ContentSearchSubmatch,
  BatchSearchResult,
  FileSearchOptions,
  ContentSearchOptions,
  BatchSearchOptions,
} from "./ripgrep-types.js";

// ============================================================================
// FILE SEARCH (by name/pattern)
// ============================================================================

/**
 * Search for files matching a pattern
 * Uses ripgrep's --files mode with glob filtering
 */
export async function searchFiles(
  rootPath: string,
  pattern: string,
  options: FileSearchOptions = {}
): Promise<string[]> {
  await ensureRipgrep();

  // Convert pattern to glob
  const globPattern = pattern.includes("*") || pattern.includes("?")
    ? pattern
    : `*${pattern}*`;

  const args = rgArgs()
    .files()
    .noMessages()
    .ignoreCase(options.ignoreCase !== false);
  
  if (options.includeHidden) args.hidden();
  
  args
    .glob(globPattern)
    .exclude(options.excludePatterns ?? [])
    .path(rootPath);

  const output = await executeRipgrep(args.build());
  return parseRipgrepLines(output);
}

// ============================================================================
// CONTENT SEARCH
// ============================================================================

/**
 * Search file contents for a pattern
 */
export async function searchContent(
  rootPath: string,
  pattern: string,
  options: ContentSearchOptions = {}
): Promise<ContentSearchResult[]> {
  await ensureRipgrep();

  // Validate pattern
  const validation = validateRegexPattern(pattern, { pcre2: options.pcre2 });
  if (!validation.valid) {
    throw new Error(validation.errorMessage);
  }

  const args = rgArgs()
    .json()
    .noMessages()
    .context(options.context ?? 0)
    .ignoreCase(options.ignoreCase ?? false)
    .fileType(options.fileType ?? "")
    .maxCount(options.maxResults ?? 0)
    .exclude(options.excludePatterns ?? [])
    .pattern(pattern)
    .path(rootPath)
    .build();

  // Determine if PCRE2 is needed
  const needsPCRE2 = options.pcre2 ?? requiresPCRE2(pattern);

  try {
    const maxOutputBytes = getConfig().search.maxOutputBytes;
    const output = await executeRipgrepWithLimit(args, maxOutputBytes, needsPCRE2);
    return parseJsonResults(output);
  } catch (error: unknown) {
    // Auto-retry with PCRE2 if regex parsing failed
    if (
      error instanceof Error &&
      error.message.includes("regex parse error") &&
      error.message.includes("look-") &&
      !needsPCRE2
    ) {
      const maxOutputBytes = getConfig().search.maxOutputBytes;
      const output = await executeRipgrepWithLimit(args, maxOutputBytes, true);
      return parseJsonResults(output);
    }
    throw error;
  }
}

/**
 * Search file contents for multiple patterns in parallel
 * 
 * More efficient than calling searchContent multiple times as it
 * batches operations and controls concurrency.
 * 
 * @param rootPath - Root path to search in
 * @param patterns - Array of regex patterns to search for
 * @param options - Search options (applied to all patterns)
 * @returns BatchSearchResult with results per pattern
 * 
 * @example
 * const result = await batchSearchContent('src', [
 *   'TODO:',
 *   'FIXME:',
 *   'HACK:',
 * ], { fileType: 'ts' });
 * console.log(`Found ${result.totalMatches} total matches`);
 */
export async function batchSearchContent(
  rootPath: string,
  patterns: string[],
  options: BatchSearchOptions = {}
): Promise<BatchSearchResult> {
  await ensureRipgrep();

  const results = new Map<string, ContentSearchResult[]>();
  const errors = new Map<string, Error>();
  let totalMatches = 0;

  // Try single ripgrep spawn with --regexp flags for all patterns
  const needsPCRE2 = options.pcre2 ?? patterns.some(p => requiresPCRE2(p));
  const validPatterns = patterns.filter(p => {
    const v = validateRegexPattern(p, { pcre2: needsPCRE2 });
    return v.valid;
  });

  if (validPatterns.length > 0) {
    try {
      const args = [
        "--json", "--no-heading", "--line-number", "--no-messages",
        ...(needsPCRE2 ? ["--pcre2"] : []),
        ...(options.ignoreCase ? ["--ignore-case"] : []),
        ...(options.fileType ? ["--type", options.fileType] : []),
        ...(options.maxResults ? ["--max-count", options.maxResults.toString()] : []),
        ...(options.excludePatterns ?? []).flatMap(p => ["--glob", `!${p}`]),
        ...validPatterns.flatMap(p => ["--regexp", p]),
        rootPath,
      ];

      const output = await executeRipgrep(args);
      const allResults = parseJsonResults(output);

      // Partition results by which pattern matched
      for (const r of allResults) {
        for (const sm of r.submatches || []) {
          let matchedPattern: string | undefined;
          for (const p of validPatterns) {
            const cleanPat = p.replace(/\\b/g, '');
            try {
              const re = new RegExp(`\\b${cleanPat}\\b`);
              if (re.test(sm.text)) {
                matchedPattern = p;
                break;
              }
            } catch { /* skip invalid regex */ }
          }
          const key = matchedPattern ?? validPatterns[0];
          const existing = results.get(key) ?? [];
          existing.push(r);
          results.set(key, existing);
        }
        totalMatches++;
      }

      // Fill empty results for patterns with no matches
      for (const p of validPatterns) {
        if (!results.has(p)) results.set(p, []);
      }
    } catch {
      // Fallback to individual searches if single spawn fails
      const concurrency = options.concurrency ?? 3;
      for (let i = 0; i < patterns.length; i += concurrency) {
        const batch = patterns.slice(i, i + concurrency);
        await Promise.all(batch.map(async (pattern) => {
          try {
            const matches = await searchContent(rootPath, pattern, {
              fileType: options.fileType, context: options.context,
              ignoreCase: options.ignoreCase, excludePatterns: options.excludePatterns,
              maxResults: options.maxResults, pcre2: options.pcre2,
            });
            results.set(pattern, matches);
            totalMatches += matches.length;
          } catch (error: unknown) {
            errors.set(pattern, error instanceof Error ? error : new Error(String(error)));
          }
        }));
      }
    }
  }

  return { results, errors, totalMatches, successCount: results.size, errorCount: errors.size };
}

/**
 * Parse JSON output from ripgrep
 * @internal Used by searchContent
 */
function parseJsonResults(output: string): ContentSearchResult[] {
  const results: ContentSearchResult[] = [];
  const lines = output.split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (data.type === "match") {
        // Extract submatches with exact column positions from ripgrep
        const submatches: ContentSearchSubmatch[] = [];
        if (data.data.submatches && Array.isArray(data.data.submatches)) {
          for (const sm of data.data.submatches) {
            submatches.push({
              text: sm.match?.text ?? "",
              start: sm.start ?? 0,
              end: sm.end ?? 0,
            });
          }
        }

        results.push({
          file: data.data.path.text,
          line: data.data.line_number,
          // Keep original content without trimming to preserve column accuracy
          // Trim only the trailing newline, not leading whitespace
          content: (data.data.lines.text ?? "").replace(/\n$/, ""),
          submatches
        });
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return results;
}

// ============================================================================
// COUNT MATCHES
// ============================================================================

/**
 * Count pattern matches in files
 */
export async function countMatches(
  rootPath: string,
  pattern: string,
  options: {
    fileType?: string;
    ignoreCase?: boolean;
    excludePatterns?: readonly string[];
  } = {}
): Promise<Map<string, number>> {
  await ensureRipgrep();

  const args = rgArgs()
    .count()
    .noMessages()
    .ignoreCase(options.ignoreCase ?? false)
    .fileType(options.fileType ?? "")
    .exclude(options.excludePatterns ?? [])
    .pattern(pattern)
    .path(rootPath)
    .build();

  const needsPcre2 = requiresPCRE2(pattern);
  const output = await executeRipgrep(args, needsPcre2);
  const counts = new Map<string, number>();
  const searchPath = rootPath;

  for (const line of output.split("\n").filter(Boolean)) {
    const match = line.match(/^(.+):(\d+)$/);
    if (match) {
      counts.set(match[1], parseInt(match[2], 10));
    } else {
      // When rg --count operates on a single file, output is just "<count>"
      // with no path prefix. Parse the bare number and attribute to searchPath.
      const bareCount = parseInt(line, 10);
      if (!isNaN(bareCount) && bareCount > 0) {
        counts.set(searchPath, bareCount);
      }
    }
  }

  return counts;
}
