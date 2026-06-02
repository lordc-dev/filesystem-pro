/**
 * I/O Resilience - Circuit Breaker + Retry for filesystem operations
 *
 * Wraps fs operations with circuit breaker and retry logic.
 * Uses the existing CircuitBreaker for fail-fast behavior and
 * retry with exponential backoff for transient errors.
 */

import { CircuitBreaker } from "./circuit-breaker.js";
import { withRetry, type RetryConfig } from "./retry.js";
import { logger } from "./logger.js";
import { incrementCounter } from "./metrics.js";

// ============================================================================
// DEFAULTS
// ============================================================================

const IO_BREAKER_CONFIG = {
  name: "io",
  failureThreshold: 5,
  resetTimeoutMs: 15_000,
  halfOpenSuccessThreshold: 2,
  enabled: true,
};

const IO_RETRY_CONFIG: Partial<RetryConfig> = {
  maxAttempts: 3,
  baseDelayMs: 50,
  maxDelayMs: 1000,
  multiplier: 2,
  jitter: 0.2,
  retryableCodes: ["EAGAIN", "EBUSY", "EINTR", "ENOENT", "ECONNRESET", "EPIPE"],
};

// ============================================================================
// I/O CIRCUIT BREAKER INSTANCE
// ============================================================================

export const ioCircuitBreaker = new CircuitBreaker(IO_BREAKER_CONFIG);

// ============================================================================
// RESILIENT I/O WRAPPER
// ============================================================================

/**
 * Execute an I/O operation with circuit breaker and retry protection.
 *
 * Flow:
 * 1. Circuit breaker checks if operations are allowed
 * 2. If allowed, retry transient errors (EAGAIN, EBUSY, etc.)
 * 3. On success, record success to circuit breaker
 * 4. On final failure, record failure to circuit breaker
 */
export async function resilientIO<T>(
  operation: string,
  fn: () => Promise<T>,
  options?: {
    retry?: Partial<RetryConfig>;
    skipCircuitBreaker?: boolean;
  },
): Promise<T> {
  if (options?.skipCircuitBreaker) {
    return withRetry(fn, { ...IO_RETRY_CONFIG, ...options?.retry }, operation);
  }

  return ioCircuitBreaker.execute(async () => {
    return withRetry(fn, { ...IO_RETRY_CONFIG, ...options?.retry }, operation);
  });
}

/**
 * Pre-configured I/O operations with sensible defaults.
 */
export const io = {
  /**
   * Read a file with resilience (retry transient errors + circuit breaker).
   */
  read: <T>(operation: string, fn: () => Promise<T>): Promise<T> =>
    resilientIO(`read:${operation}`, fn),

  /**
   * Write a file with resilience.
   */
  write: <T>(operation: string, fn: () => Promise<T>): Promise<T> =>
    resilientIO(`write:${operation}`, fn),

  /**
   * Stat/access with resilience.
   */
  stat: <T>(operation: string, fn: () => Promise<T>): Promise<T> =>
    resilientIO(`stat:${operation}`, fn),

  /**
   * Directory operations with resilience.
   */
  dir: <T>(operation: string, fn: () => Promise<T>): Promise<T> =>
    resilientIO(`dir:${operation}`, fn),
};