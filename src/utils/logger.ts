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

import { AsyncLocalStorage } from "async_hooks";

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
  error(message: string, error?: Error | unknown): void;
  withRequestId(requestId: string): Logger;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

function isDebugEnabled(): boolean {
  return process.env.DEBUG === '1' || process.env.DEBUG === 'true' || process.env.MCP_DEBUG === '1' || process.env.MCP_DEBUG === 'true' || process.env.DEBUG_MCP === 'true';
}

// Structured JSON logging removed — local-only use, human-readable always

// ============================================================================
// OUTPUT
// ============================================================================

function toStderr(entry: LogEntry, ...rawArgs: unknown[]): void {
  const requestId = requestIdStorage.getStore();
  const prefix = entry.level === 'warn' ? '[WARN] ' : entry.level === 'error' ? '[ERROR] ' : '';
    const moduleTag = entry.module ? `[${entry.module}] ` : '';
    const effectiveRequestId = entry.requestId ?? requestId;
    const reqTag = effectiveRequestId ? `[${effectiveRequestId.substring(0, 8)}] ` : '';
    const durTag = entry.duration !== undefined ? ` (${entry.duration.toFixed(1)}ms)` : '';
    const base = `${prefix}${moduleTag}${reqTag}${entry.msg}${durTag}`;
    if (rawArgs.length > 0) {
      console.error(base, ...rawArgs);
    } else {
      console.error(base);
    }
  }

// ============================================================================
// CORE IMPL
// ============================================================================

function makeEntry(level: LogLevel, message: string, module?: string): LogEntry {
  return {
    level,
    msg: message,
    module,
    timestamp: new Date().toISOString(),
  };
}

function logDebug(message: string, ...args: unknown[]): void {
  if (!isDebugEnabled()) return;
  const entry = makeEntry('debug', message);
  if (args.length > 0) {
    entry.data = args.length === 1 && typeof args[0] === 'object' && args[0] !== null ? args[0] as Record<string, unknown> : { args };
  }
  toStderr(entry, ...args);
}

function logInfo(message: string, ...args: unknown[]): void {
  const entry = makeEntry('info', message);
  if (args.length > 0) {
    entry.data = args.length === 1 && typeof args[0] === 'object' && args[0] !== null ? args[0] as Record<string, unknown> : { args };
  }
  toStderr(entry, ...args);
}

function logWarn(message: string, ...args: unknown[]): void {
  const entry = makeEntry('warn', message);
  if (args.length > 0) {
    entry.data = args.length === 1 && typeof args[0] === 'object' && args[0] !== null ? args[0] as Record<string, unknown> : { args };
  }
  toStderr(entry, ...args);
}

function logError(message: string, err?: Error | unknown): void {
  const entry = makeEntry('error', message);
  if (err !== undefined) {
    entry.data = err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { error: String(err) };
  }
  if (err !== undefined) {
    console.error(`[ERROR] ${entry.msg}`, err);
  } else {
    console.error(`[ERROR] ${entry.msg}`);
  }
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
    error: (message: string, err?: Error | unknown) => {
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