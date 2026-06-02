/**
 * Retry with Exponential Backoff
 *
 * Utility for retrying transient I/O failures (EAGAIN, EBUSY, EINTR, etc.)
 * with configurable jitter and max attempts.
 */

import { logger } from "./logger.js";

// ============================================================================
// TYPES
// ============================================================================

export interface RetryConfig {
  /** Maximum number of attempts (including first) */
  maxAttempts: number;
  /** Initial delay in ms */
  baseDelayMs: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  multiplier: number;
  /** Jitter factor 0-1 (default: 0.2 adds ±20% randomness) */
  jitter: number;
  /** Retryable error codes */
  retryableCodes: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 50,
  maxDelayMs: 2000,
  multiplier: 2,
  jitter: 0.2,
  retryableCodes: ["EAGAIN", "EBUSY", "EINTR", "ENOENT", "EPERM"],
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

function getDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitterRange = cappedDelay * config.jitter;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, cappedDelay + jitter);
}

function isRetryable(error: unknown, codes: string[]): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code != null && codes.includes(code);
}

/**
 * Execute a function with retry on transient I/O errors.
 * 
 * @param fn - The async function to execute
 * @param config - Retry configuration (partial, merged with defaults)
 * @param label - Description for logging
 * @returns The result of fn()
 * @throws The last error if all attempts fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  label = "operation",
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryable(error, fullConfig.retryableCodes)) {
        throw error;
      }

      if (attempt < fullConfig.maxAttempts - 1) {
        const delay = getDelay(attempt, fullConfig);
        logger.debug?.(
          `[Retry] ${label} failed (attempt ${attempt + 1}/${fullConfig.maxAttempts}), ` +
          `retrying in ${delay.toFixed(0)}ms: ${lastError.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error(`All ${fullConfig.maxAttempts} attempts failed for ${label}`);
}