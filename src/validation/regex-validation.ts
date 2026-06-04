/**
 * Regex Pattern Validation
 *
 * Validates regex patterns before passing to ripgrep.
 * Uses formatValidationError from error-formatters.ts for SSOT error formatting.
 */

import { formatValidationError } from "../utils/error-formatters.js";

/**
 * Result of pattern validation
 */
export interface PatternValidationResult {
  /** Whether the pattern is valid */
  valid: boolean;
  /** Sanitized/auto-fixed pattern if corrections were applied */
  sanitized?: string | string[];
  /** List of validation errors */
  errors: string[];
  /** List of non-critical warnings */
  warnings: string[];
  /** Pre-formatted error message ready for throwing */
  errorMessage?: string;
}

/**
 * Options for regex pattern validation
 */
export interface RegexValidationOptions {
  /** Automatically fix common mistakes */
  autoFix?: boolean;
  /** Whether pattern will use PCRE2 engine (allows more advanced features) */
  pcre2?: boolean;
}

/**
 * Maximum allowed pattern length to prevent ReDoS attacks.
 * Security audit finding #3: user-controlled regex without complexity limits.
 */
export const MAX_REGEX_PATTERN_LENGTH = 1024;

/**
 * Patterns that indicate potential ReDoS (exponential backtracking).
 * Detection heuristics based on nested quantifiers and overlapping alternation.
 */
const REDOS_INDICATORS = [
  // Nested quantifiers: (a+)+, (a*)*, (a+)*, etc.
  /\((?:[^)]*[*+][^)]*)\)[+*{]/,
  // Overlapping alternation with quantifier: (a|a)+, (\w|\d)+
  /\((?:[^)]*\|[^)]*)\)[+*{]/,
  // Repeated groups with backtracking potential: (a{1,}){1,}
  /\((?:[^)]*\{[^}]*\}[^)]*)\)[+*{]/,
];

/**
 * Detect potential ReDoS patterns by checking for exponential backtracking indicators.
 * Returns warning messages for suspicious patterns.
 */
function detectReDoSWarnings(pattern: string): string[] {
  const warnings: string[] = [];

  for (const indicator of REDOS_INDICATORS) {
    if (indicator.test(pattern)) {
      warnings.push(
        "Pattern contains nested quantifiers or overlapping alternation that may cause exponential backtracking (ReDoS). Consider simplifying the pattern."
      );
      break;
    }
  }

  return warnings;
}

/**
 * Validates a regex pattern for use with ripgrep
 */
export function validateRegexPattern(
  pattern: string,
  options: RegexValidationOptions = {}
): PatternValidationResult {
  if (typeof pattern !== "string" || !pattern) {
    return {
      valid: false,
      errors: ["Pattern must be a non-empty string"],
      warnings: [],
      errorMessage: formatValidationError("regex pattern", pattern || "", ["Pattern must be a non-empty string"]),
    };
  }

  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return {
      valid: false,
      errors: [`Pattern exceeds maximum length of ${MAX_REGEX_PATTERN_LENGTH} characters (got ${pattern.length})`],
      warnings: [],
      errorMessage: formatValidationError("regex pattern", `${pattern.slice(0, 50)}...`, [`Pattern exceeds maximum length of ${MAX_REGEX_PATTERN_LENGTH} characters (got ${pattern.length})`]),
    };
  }

  if (pattern.includes("\x00")) {
    return {
      valid: false,
      errors: ["Pattern contains null bytes"],
      warnings: [],
      errorMessage: formatValidationError("regex pattern", pattern, ["Null bytes are not allowed in patterns"]),
    };
  }

  try {
    new RegExp(pattern);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const errors = [`Regex compilation failed: ${errorMsg}`];
    const suggestions = suggestRegexFixes(pattern, errorMsg);

    if (options.autoFix) {
      const fixed = autoFixRegexPattern(pattern);
      if (fixed !== pattern) {
        try {
          new RegExp(fixed);
          return {
            valid: true,
            sanitized: fixed,
            errors: [],
            warnings: [`Auto-fixed pattern from "${pattern}" to "${fixed}"`],
          };
        } catch {
          // Auto-fix failed, fall through to error
        }
      }
    }

    return {
      valid: false,
      errors,
      warnings: [],
      errorMessage: formatRegexErrorWithHints(pattern, errors, suggestions),
    };
  }

  const warnings = [...detectRegexWarnings(pattern), ...detectReDoSWarnings(pattern)];

  return {
    valid: true,
    errors: [],
    warnings,
  };
}

/**
 * Suggests fixes for regex compilation errors
 */
function suggestRegexFixes(pattern: string, errorMsg: string): string[] {
  const suggestions: string[] = [];

  if (errorMsg.includes("repetition") || errorMsg.includes("quantifier")) {
    if (pattern.includes("{") && !pattern.includes("\\{")) {
      suggestions.push("Escape curly braces: use \\{ instead of {");
      suggestions.push(`Example: "${pattern.replace(/\{/g, "\\{")}"`);
    }
    if (pattern.includes("}") && !pattern.includes("\\}")) {
      suggestions.push("Escape curly braces: use \\} instead of }");
    }
  }

  if (errorMsg.includes("unclosed") || errorMsg.includes("unmatched")) {
    if (pattern.includes("[") || pattern.includes("]")) {
      suggestions.push("Escape square brackets: use \\[ and \\] for literal brackets");
    }
    if (pattern.includes("(") || pattern.includes(")")) {
      suggestions.push("Escape parentheses: use \\( and \\) for literal parentheses");
    }
  }

  if (errorMsg.includes("invalid escape")) {
    suggestions.push("Check escape sequences - only valid regex escapes are allowed");
  }

  if (suggestions.length === 0) {
    suggestions.push("Check regex syntax and escape special characters: . ^ $ * + ? { } [ ] \\ | ( )");
  }

  return suggestions;
}

/**
 * Automatically fixes common regex pattern mistakes
 */
function autoFixRegexPattern(pattern: string): string {
  let fixed = pattern;

  fixed = fixed.replace(/([^\\])\{(?!\d)/g, "$1\\{");
  fixed = fixed.replace(/([^\\])\}(?!\d)/g, "$1\\}");

  if (fixed.startsWith("{")) {
    fixed = "\\" + fixed;
  }

  fixed = fixed.replace(/([^\\])\[(\w+)\]/g, "$1\\[$2\\]");

  return fixed;
}

/**
 * Detects potential issues that aren't errors but might be unintended
 */
function detectRegexWarnings(pattern: string): string[] {
  const warnings: string[] = [];

  if (pattern === ".*" || pattern === ".+") {
    warnings.push("Pattern matches almost everything - consider making it more specific");
  }

  if (pattern.includes("\\\\") && !pattern.includes("\\\\\\\\")) {
    warnings.push("Pattern contains double backslash (\\\\) - this matches a literal backslash");
  }

  return warnings;
}

/**
 * Format regex error with pattern-specific hints
 */
export function formatRegexErrorWithHints(pattern: string, errors: string[], suggestions: string[]): string {
  const baseError = formatValidationError("regex pattern", pattern, errors, suggestions);

  const hints = [
    "",
    "Common regex special characters that need escaping:",
    "  . ^ $ * + ? { } [ ] \\ | ( )",
    "",
    "Examples:",
    '  Good: "class\\s+\\w+\\s*\\{"  (matches: class Foo {)',
    '  Bad:  "class\\s+\\w+\\s*{"    (error: unescaped brace)',
  ];

  return baseError + hints.join("\n");
}
