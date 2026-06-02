/**
 * Validation Barrel Export
 *
 * Re-exports all validation modules for convenient imports.
 */

export { validatePath } from "./path-validation.js";

export { normalizePath, expandHome, resolvePath, cachedRealpath, invalidateRealpathCache, parseFileUri } from "./path-utils.js";

export { rootsManager, validatePathAgainstRoots, validatePathAgainstRootsAsync } from "./roots-manager.js";
export type { Root } from "./roots-manager.js";

export { validateGlobPattern, validateGlobBrackets, formatGlobErrorWithHints } from "./glob-validation.js";
export type { GlobValidationOptions } from "./glob-validation.js";

export { validateRegexPattern, formatRegexErrorWithHints } from "./regex-validation.js";
export type { PatternValidationResult, RegexValidationOptions } from "./regex-validation.js";