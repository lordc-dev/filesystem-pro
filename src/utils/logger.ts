/**
 * Centralized Logger Utility (SSOT)
 * 
 * Structured JSON logging to stderr with log levels, module prefixes,
 * request tracing via AsyncLocalStorage, and configurable output format.
 * 
 * All output goes to stderr (MCP requirement — stdout is for protocol messages).
 * Debug logs are gated behind the DEBUG environment variable.
 * 
 * Set MCP_STRUCTURED_LOGS=1 to enable JSON structured output.
 * 
 * @example
 * ```typescript
 * import { logger, createLogger } from './utils/logger.js';
 * 
 * logger.debug('Detailed info', { data: value }); // Only if DEBUG=1
 * logger.info('Server started');
 * logger.warn('Deprecated feature used');
 * logger.error('Operation failed', error);
 * 
 * const log = createLogger('Roots');
 * log.info('Initialized'); // [Roots] Initialized
 * 
 * // Correlated logging within a context
 * import { runWithRequestId } from './utils/logger.js';
 * runWithRequestId('req-123', () => {
 *   logger.info('Inside request'); // [req-123] Inside request
 * });
 * ```
 */

import { AsyncLocalStorage } from "node:async_hooks";

// ============================================================================
// ASYNC LOCAL STORAGE FOR CORRELATION
// ============================================================================

const requestIdStorage = new AsyncLocalStorage<string>();

/**
 * Run a callback with a specific request/correlation ID.
 * All log calls within the callback (and any async descendants)
 * will automatically include this ID in structured output.
 * 
 * This replaces the mutable `currentRequestId` global and is safe
 * for concurrent operations.
 */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestIdStorage.run(requestId, fn);
}

/**
 * Get the current request ID from AsyncLocalStorage.
 * Returns undefined if not inside a runWithRequestId context.
 */
export function getRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

/**
 * Set the request ID globally (for backward compatibility).
 * Prefer runWithRequestId for proper async context isolation.
 */
export function setRequestId(id: string | undefined): void {
  if (id) {
    requestIdStorage.enterWith(id);
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  msg: string;
  module?: string;
  requestId?: string;
  duration?: number;
  path?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: unknown): void;
  withRequestId(requestId: string): Logger;
}

// ============================================================================
// BOOLEAN ENV PARSER (SSOT)
// ============================================================================

/**
 * Parse a boolean environment variable.
 * Accepts (case-insensitive): "1", "true" → true; "0", "false" → false.
 * Returns `undefined` for unset or invalid values (caller keeps default).
 */
export function parseBooleanEnv(
  value: string | undefined,
  fieldName: string,
): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  const lower = value.trim().toLowerCase();
  if (lower === "1" || lower === "true") return true;
  if (lower === "0" || lower === "false") return false;
  console.error(`[WARN] [Config] Invalid boolean for ${fieldName}: "${value}" — must be 1/true/0/false, ignoring`);
  return undefined;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

function isDebugEnabled(): boolean {
  return (
    parseBooleanEnv(process.env.DEBUG, "DEBUG") === true ||
    parseBooleanEnv(process.env.MCP_DEBUG, "MCP_DEBUG") === true ||
    parseBooleanEnv(process.env.DEBUG_MCP, "DEBUG_MCP") === true
  );
}

// Structured JSON logging removed — local-only use, human-readable always

// ============================================================================
// OUTPUT
// ============================================================================

const LEVEL_PREFIXES: Record<LogLevel, string> = {
  debug: '',
  info: '',
  warn: '[WARN] ',
  error: '[ERROR] ',
};

function formatDurationTag(duration: number | undefined): string {
  return duration === undefined ? '' : ` (${duration.toFixed(1)}ms)`;
}

function toStderr(entry: LogEntry, ...rawArgs: unknown[]): void {
  const requestId = requestIdStorage.getStore();
  const prefix = LEVEL_PREFIXES[entry.level];
    const moduleTag = entry.module ? `[${entry.module}] ` : '';
    const effectiveRequestId = entry.requestId ?? requestId;
    const reqTag = effectiveRequestId ? `[${effectiveRequestId.substring(0, 8)}] ` : '';
    const durTag = formatDurationTag(entry.duration);
    const base = `${prefix}${moduleTag}${reqTag}${entry.msg}${durTag}`;
    if (rawArgs.length > 0) {
      console.error(base, ...rawArgs);
    } else {
      console.error(base);
    }
  }

// ============================================================================
// ARG EXTRACTION (avoids nested ternary — S3358)
// ============================================================================

function extractData(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    return args[0] as Record<string, unknown>;
  }
  return { args };
}

// ============================================================================
// CORE IMPL
// =============================================================================

function makeEntry(level: LogLevel, message: string, module?: string): LogEntry {
  return {
    level,
    msg: message,
    module,
    timestamp: new Date().toISOString(),
  };
}

function logDebug(message: string, ...args: unknown[]): void {
  if (isDebugEnabled()) {
    const entry = makeEntry('debug', message);
    const data = extractData(args);
    if (data) entry.data = data;
    toStderr(entry, ...args);
  }
}

function logInfo(message: string, ...args: unknown[]): void {
  const entry = makeEntry('info', message);
  const data = extractData(args);
  if (data) entry.data = data;
  toStderr(entry, ...args);
}

function logWarn(message: string, ...args: unknown[]): void {
  const entry = makeEntry('warn', message);
  const data = extractData(args);
  if (data) entry.data = data;
  toStderr(entry, ...args);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => typeof v === "bigint" ? String(v) : v, 2);
  } catch {
    return '[unserializable object]';
  }
}

function formatErrorData(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === "string") return { error: err };
  if (typeof err === "object" && err !== null) {
    try { return { error: safeStringify(err) }; } catch { return { error: '[unserializable object]' }; }
  }
  return { error: typeof err === "number" ? String(err) : '[unknown error type]' };
}

function formatErrorForConsole(err: unknown): string | Error {
  return err instanceof Error ? err : formatErrorData(err).error as string;
}

function logError(message: string, err?: unknown): void {
  const entry = makeEntry('error', message);
  if (err === undefined) {
    console.error(`[ERROR] ${entry.msg}`);
    return;
  }
  entry.data = formatErrorData(err);
  console.error(`[ERROR] ${entry.msg}`, formatErrorForConsole(err));
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const logger: Logger = {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  withRequestId(requestId: string): Logger {
    return createLogger('', requestId);
  },
};

export function createLogger(prefix: string, requestId?: string): Logger {
  return {
    debug: (message: string, ...args: unknown[]) => {
      if (requestId) {
        requestIdStorage.run(requestId, () => logDebug(`[${prefix}] ${message}`, ...args));
      } else {
        logDebug(`[${prefix}] ${message}`, ...args);
      }
    },
    info: (message: string, ...args: unknown[]) => {
      if (requestId) {
        requestIdStorage.run(requestId, () => logInfo(`[${prefix}] ${message}`, ...args));
      } else {
        logInfo(`[${prefix}] ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (requestId) {
        requestIdStorage.run(requestId, () => logWarn(`[${prefix}] ${message}`, ...args));
      } else {
        logWarn(`[${prefix}] ${message}`, ...args);
      }
    },
    error: (message: string, err?: unknown) => {
      if (requestId) {
        requestIdStorage.run(requestId, () => logError(`[${prefix}] ${message}`, err));
      } else {
        logError(`[${prefix}] ${message}`, err);
      }
    },
    withRequestId(rid: string): Logger {
      return createLogger(prefix, rid);
    },
  };
}

export default logger;