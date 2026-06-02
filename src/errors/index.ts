/**
 * Custom Error Types with Error Chaining
 *
 * Typed errors for each domain. All extend BaseError which preserves cause chain
 * and provides structured context for logging and debugging.
 *
 * Error codes (ECODE) follow a domain-prefixed scheme:
 *   PATH_xxx  — path validation
 *   FILE_xxx  — file operations
 *   DIR_xxx   — directory operations
 *   TS_xxx    — tree-sitter parsing
 *   SYM_xxx   — symbol lookup
 *   UNDO_xxx  — undo stack
 *   EDIT_xxx  — edit matching
 *   WATCH_xxx — file watching
 *   CFG_xxx   — configuration
 *   SEARCH_xxx — search operations
 *   RATE_xxx  — rate limiting
 *   CIRCUIT_xxx — circuit breaker
 *   AUDIT_xxx — audit logging
 */

// ============================================================================
// ERROR CODE REGISTRY
// ============================================================================

export const ECODE = {
  // Path validation (1xxx)
  PATH_INVALID:         1001,
  PATH_TRAVERSAL:      1002,
  PATH_NOT_FOUND:      1003,
  PATH_PERMISSION:     1004,
  PATH_SYMLINK:        1005,

  // File operations (2xxx)
  FILE_NOT_FOUND:      2001,
  FILE_READ_ERROR:     2002,
  FILE_WRITE_ERROR:    2003,
  FILE_TOO_LARGE:     2004,
  FILE_ENCODING:      2005,

  // Directory operations (3xxx)
  DIR_NOT_FOUND:       3001,
  DIR_NOT_EMPTY:       3002,
  DIR_CREATE_ERROR:   3003,
  DIR_DELETE_ERROR:   3004,

  // Tree-sitter (4xxx)
  TS_INIT_FAILED:      4001,
  TS_PARSE_FAILED:    4002,
  TS_LANGUAGE_MISSING: 4003,
  TS_CIRCUIT_OPEN:    4004,

  // Symbol lookup (5xxx)
  SYM_NOT_FOUND:      5001,
  SYM_REF_FAIL:       5002,

  // Undo (6xxx)
  UNDO_EMPTY:          6001,
  UNDO_RESTORE_FAIL:  6002,
  UNDO_PERSIST_FAIL:  6003,

  // Edit (7xxx)
  EDIT_MATCH_FAIL:    7001,
  EDIT_CONFLICT:      7002,

  // Watcher (8xxx)
  WATCH_NOT_FOUND:    8001,
  WATCH_EXISTS:       8002,
  WATCH_LIMIT:        8003,

  // Config (9xxx)
  CFG_INVALID:        9001,
  CFG_FILE_ERROR:    9002,

  // Search (10xxx)
  SEARCH_PATTERN:    10001,
  SEARCH_EXEC:       10002,
  SEARCH_TIMEOUT:    10003,

  // Rate limiting (11xxx)
  RATE_EXCEEDED:     11001,

  // Audit (12xxx)
  AUDIT_WRITE:       12001,
} as const;

export type ErrorCode = (typeof ECODE)[keyof typeof ECODE];

export const ERROR_MESSAGE: Record<number, string> = {
  [ECODE.PATH_INVALID]:         "Invalid path",
  [ECODE.PATH_TRAVERSAL]:       "Path traversal detected",
  [ECODE.PATH_NOT_FOUND]:       "Path not found",
  [ECODE.PATH_PERMISSION]:      "Permission denied",
  [ECODE.PATH_SYMLINK]:        "Dangling symlink",
  [ECODE.FILE_NOT_FOUND]:      "File not found",
  [ECODE.FILE_READ_ERROR]:     "File read error",
  [ECODE.FILE_WRITE_ERROR]:    "File write error",
  [ECODE.FILE_TOO_LARGE]:      "File too large",
  [ECODE.FILE_ENCODING]:       "File encoding error",
  [ECODE.DIR_NOT_FOUND]:       "Directory not found",
  [ECODE.DIR_NOT_EMPTY]:       "Directory not empty",
  [ECODE.DIR_CREATE_ERROR]:    "Directory create error",
  [ECODE.DIR_DELETE_ERROR]:    "Directory delete error",
  [ECODE.TS_INIT_FAILED]:      "Tree-sitter initialization failed",
  [ECODE.TS_PARSE_FAILED]:    "Tree-sitter parse failed",
  [ECODE.TS_LANGUAGE_MISSING]: "Language grammar not available",
  [ECODE.TS_CIRCUIT_OPEN]:    "Tree-sitter circuit breaker open",
  [ECODE.SYM_NOT_FOUND]:      "Symbol not found",
  [ECODE.SYM_REF_FAIL]:       "Symbol reference lookup failed",
  [ECODE.UNDO_EMPTY]:         "Undo stack empty",
  [ECODE.UNDO_RESTORE_FAIL]:  "Undo restore failed",
  [ECODE.UNDO_PERSIST_FAIL]:  "Undo persistence failed",
  [ECODE.EDIT_MATCH_FAIL]:    "Edit match not found",
  [ECODE.EDIT_CONFLICT]:      "Edit conflict detected",
  [ECODE.WATCH_NOT_FOUND]:    "Watcher not found",
  [ECODE.WATCH_EXISTS]:       "Watcher already exists",
  [ECODE.WATCH_LIMIT]:        "Watcher limit reached",
  [ECODE.CFG_INVALID]:        "Invalid configuration",
  [ECODE.CFG_FILE_ERROR]:     "Config file error",
  [ECODE.SEARCH_PATTERN]:     "Invalid search pattern",
  [ECODE.SEARCH_EXEC]:        "Search execution error",
  [ECODE.SEARCH_TIMEOUT]:     "Search timed out",
  [ECODE.RATE_EXCEEDED]:      "Rate limit exceeded",
  [ECODE.AUDIT_WRITE]:        "Audit log write error",
};

export class BaseError extends Error {
  public readonly code: ErrorCode | undefined;
  public readonly context: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(message: string, options?: { cause?: unknown; context?: Record<string, unknown>; code?: ErrorCode }) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.code = options?.code;
    this.context = options?.context ?? {};
    this.timestamp = new Date().toISOString();
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      cause: this.cause instanceof Error ? this.cause.message : String(this.cause ?? ""),
    };
  }
}

export class PathValidationError extends BaseError {
  constructor(path: string, reason: string, options?: { cause?: unknown; code?: ErrorCode }) {
    super(`Path validation failed: ${reason}`, { ...options, context: { path, reason }, code: options?.code ?? ECODE.PATH_INVALID });
  }
}

export class FileNotFoundError extends BaseError {
  constructor(path: string, options?: { cause?: unknown }) {
    super(`File not found: ${path}`, { ...options, context: { path } });
  }
}

export class DirectoryError extends BaseError {
  constructor(path: string, operation: string, options?: { cause?: unknown }) {
    super(`Directory ${operation} failed: ${path}`, { ...options, context: { path, operation } });
  }
}

export class TreeSitterError extends BaseError {
  constructor(operation: string, options?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(`Tree-sitter ${operation} failed`, options);
  }
}

export class SymbolNotFoundError extends BaseError {
  constructor(pattern: string, options?: { cause?: unknown }) {
    super(`Symbol not found: ${pattern}`, { ...options, context: { pattern } });
  }
}

export class UndoError extends BaseError {
  constructor(operation: string, options?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(`Undo ${operation} failed`, { ...options, context: { operation, ...options?.context } });
  }
}

export class EditMatchError extends BaseError {
  constructor(oldText: string, filePath: string, options?: { cause?: unknown }) {
    super(`Edit match not found in file`, { ...options, context: { filePath, oldTextSnippet: oldText.slice(0, 80) } });
  }
}

export class WatcherError extends BaseError {
  constructor(watcherId: string, operation: string, options?: { cause?: unknown }) {
    super(`Watcher ${operation} failed`, { ...options, context: { watcherId, operation } });
  }
}

export class ConfigError extends BaseError {
  constructor(path: string, reason: string, options?: { cause?: unknown }) {
    super(`Config error: ${reason}`, { ...options, context: { path } });
  }
}

export class SearchError extends BaseError {
  constructor(pattern: string, options?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(`Search failed`, { ...options, context: { pattern, ...options?.context } });
  }
}