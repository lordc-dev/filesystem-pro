/**
 * Pattern Validation - Re-export Module
 *
 * This module re-exports all pattern validation functionality
 * for backward compatibility. Individual implementations are in:
 * - regex-validation.ts: Regex pattern validation
 * - glob-validation.ts: Glob pattern validation
 */

// Re-export regex validation
export {
  validateRegexPattern,
  formatRegexErrorWithHints,
  type PatternValidationResult,
  type RegexValidationOptions,
} from "./regex-validation.js";

// Re-export glob validation
export {
  validateGlobPattern,
  validateGlobBrackets,
  formatGlobErrorWithHints,
  type GlobValidationOptions,
} from "./glob-validation.js";
