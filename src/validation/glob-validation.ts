/**
 * Glob Pattern Validation
 *
 * Validates glob patterns for file matching.
 * Uses formatValidationError from error-formatters.ts for SSOT error formatting.
 */

import { formatValidationError } from "../utils/error-formatters.js";
import type { PatternValidationResult } from "./regex-validation.js";

/**
 * Options for glob pattern validation
 */
export interface GlobValidationOptions {
  /** Automatically fix common mistakes */
  autoFix?: boolean;
}

/**
 * Validates glob pattern(s) for file matching
 */
export function validateGlobPattern(
  patterns: string | string[],
  options: GlobValidationOptions = {}
): PatternValidationResult {
  const patternArray = Array.isArray(patterns) ? patterns : [patterns];
  const errors: string[] = [];
  const warnings: string[] = [];
  let sanitized: string[] | undefined;

  for (let i = 0; i < patternArray.length; i++) {
    const pattern = patternArray[i];

    if (typeof pattern !== "string" || !pattern) {
      errors.push(`Pattern at index ${i} must be a non-empty string`);
      continue;
    }

    // Check for regex syntax in glob (.* instead of *)
    if (pattern.includes(".*")) {
      const fixedPattern = pattern.replace(/\.\*/g, "*");

      if (options.autoFix) {
        sanitized ??= [...patternArray];
        sanitized[i] = fixedPattern;
        warnings.push(
          `Pattern "${pattern}" contains .* (regex syntax). ` + `Auto-fixed to "${fixedPattern}" (glob syntax)`
        );
      } else {
        errors.push(
          `Pattern "${pattern}" contains .* (regex syntax). ` + `Use * for glob patterns. Did you mean "${fixedPattern}"?`
        );
      }
    }

    // Validate bracket expressions
    const bracketErrors = validateGlobBrackets(pattern);
    if (bracketErrors.length > 0) {
      errors.push(...bracketErrors.map((err) => `Pattern "${pattern}": ${err}`));
    }
  }

  if (errors.length > 0) {
    const patternStr = Array.isArray(patterns)
      ? `[${patterns.map((p) => `"${p}"`).join(", ")}]`
      : `"${patterns}"`;

    return {
      valid: false,
      sanitized,
      errors,
      warnings,
      errorMessage: formatGlobErrorWithHints(patternStr, errors),
    };
  }

  return {
    valid: true,
    sanitized,
    errors: [],
    warnings,
  };
}

/**
 * Validates bracket expressions in glob patterns
 */
export function validateGlobBrackets(pattern: string): string[] {
  const errors: string[] = [];
  let inBracket = false;
  let bracketStart = -1;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const prevChar = i > 0 ? pattern[i - 1] : "";

    // Skip escaped characters
    if (prevChar === "\\") {
      continue;
    }

    if (char === "[") {
      if (inBracket) {
        errors.push(`Nested brackets at position ${i}`);
      }
      inBracket = true;
      bracketStart = i;
    } else if (char === "]" && inBracket) {
      // Validate the bracket expression
      const expression = pattern.substring(bracketStart + 1, i);

      // Check for invalid ranges (e.g., [z-a])
      const rangeMatch = expression.match(/([a-zA-Z0-9])-([a-zA-Z0-9])/);
      if (rangeMatch) {
        const start = rangeMatch[1].charCodeAt(0);
        const end = rangeMatch[2].charCodeAt(0);
        if (start > end) {
          errors.push(
            `Invalid range [${rangeMatch[1]}-${rangeMatch[2]}] - ` +
              `start character '${rangeMatch[1]}' is greater than end '${rangeMatch[2]}'`
          );
        }
      }

      inBracket = false;
      bracketStart = -1;
    }
  }

  if (inBracket) {
    errors.push(`Unclosed bracket expression starting at position ${bracketStart}`);
  }

  return errors;
}

/**
 * Format glob error with pattern-specific hints
 */
export function formatGlobErrorWithHints(patternStr: string, errors: string[]): string {
  const baseError = formatValidationError("glob pattern", patternStr, errors);

  const hints = [
    "",
    "Glob pattern syntax (NOT regex):",
    "  *       - Match any characters",
    "  **      - Match any directories",
    "  ?       - Match single character",
    "  [abc]   - Match a, b, or c",
    "  {a,b}   - Match a or b",
    "",
    "Examples:",
    '  Good: "**/*.ts"        (all TypeScript files)',
    '  Good: "src/**/test-*.ts" (test files in src)',
    '  Bad:  "**/*.*.ts"      (use * not .* for glob)',
  ];

  return baseError + hints.join("\n");
}
