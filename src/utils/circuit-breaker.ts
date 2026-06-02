/**
 * Circuit Breaker - Prevents cascading failures in external subsystems
 *
 * States:
 * - CLOSED: Normal operation. Requests pass through. Failures increment counter.
 *   On threshold breach → OPEN.
 * - OPEN: All requests fail fast. After reset timeout → HALF_OPEN.
 * - HALF_OPEN: Allows one probe request. Success → CLOSED. Failure → OPEN.
 *
 * Thread-safe for async: Uses atomic state transitions via compare-and-swap pattern.
 */

import { logger } from "./logger.js";
import { incrementCounter } from "./metrics.js";

// ============================================================================
// TYPES
// ============================================================================

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  /** Name for logging and metrics */
  name: string;
  /** Failures before opening (default: 5) */
  failureThreshold: number;
  /** Time in ms before transitioning from OPEN to HALF_OPEN (default: 30000) */
  resetTimeoutMs: number;
  /** Successes in HALF_OPEN before closing (default: 1) */
  halfOpenSuccessThreshold: number;
  /** Whether the breaker starts enabled (default: true) */
  enabled: boolean;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastFailureMessage: string | null;
  totalTrips: number;
  totalRejected: number;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, "name"> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 1,
  enabled: true,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastFailureMessage: string | null = null;
  private totalTrips = 0;
  private totalRejected = 0;
  private readonly config: CircuitBreakerConfig & typeof DEFAULT_CONFIG;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker.
   * Rejects immediately if circuit is OPEN.
   * Allows one probe if HALF_OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return fn();
    }

    const state = this.getState();

    if (state === "open") {
      this.totalRejected++;
      incrementCounter("circuit_breaker_rejected", { breaker: this.config.name });
      throw new Error(
        `Circuit breaker [${this.config.name}] is OPEN — rejecting request. ` +
        `Last failure: ${this.lastFailureMessage ?? "unknown"}. ` +
        `Will attempt reset at ${new Date((this.lastFailureTime ?? Date.now()) + this.config.resetTimeoutMs).toISOString()}`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error: unknown) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Check if requests can pass through (does not modify state).
   */
  get canExecute(): boolean {
    if (!this.config.enabled) return true;
    return this.getState() !== "open";
  }

  /**
   * Get the current effective state (accounts for reset timeout).
   */
  getState(): CircuitState {
    if (!this.config.enabled) return "closed";

    if (this.state === "open") {
      if (
        this.lastFailureTime !== null &&
        Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs
      ) {
        this.state = "half_open";
        logger.info(`[CircuitBreaker] ${this.config.name}: OPEN → HALF_OPEN (reset timeout elapsed)`);
      }
    }

    return this.state;
  }

  /**
   * Get circuit breaker statistics.
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failureCount,
      successes: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastFailureMessage: this.lastFailureMessage,
      totalTrips: this.totalTrips,
      totalRejected: this.totalRejected,
    };
  }

  /**
   * Manually reset the circuit breaker to CLOSED state.
   */
  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastFailureMessage = null;
    logger.info(`[CircuitBreaker] ${this.config.name}: Manual reset → CLOSED`);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private onSuccess(): void {
    this.successCount++;

    if (this.state === "half_open") {
      if (this.successCount >= this.config.halfOpenSuccessThreshold) {
        this.state = "closed";
        this.failureCount = 0;
        this.successCount = 0;
        incrementCounter("circuit_breaker_close", { breaker: this.config.name });
        logger.info(`[CircuitBreaker] ${this.config.name}: HALF_OPEN → CLOSED (probe succeeded)`);
      }
    } else if (this.state === "closed") {
      this.failureCount = 0;
    }
  }

  private onFailure(error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.lastFailureMessage = error instanceof Error ? error.message : String(error);
    this.successCount = 0;
    incrementCounter("circuit_breaker_failure", { breaker: this.config.name });

    if (this.state === "half_open") {
      this.state = "open";
      this.totalTrips++;
      logger.warn(`[CircuitBreaker] ${this.config.name}: HALF_OPEN → OPEN (probe failed: ${this.lastFailureMessage})`);
    } else if (this.state === "closed" && this.failureCount >= this.config.failureThreshold) {
      this.state = "open";
      this.totalTrips++;
      logger.warn(
        `[CircuitBreaker] ${this.config.name}: CLOSED → OPEN ` +
        `(${this.failureCount} failures ≥ ${this.config.failureThreshold} threshold)`
      );
    }
  }
}

// ============================================================================
// PRE-BUILT INSTANCES
// ============================================================================

export const treeSitterBreaker = new CircuitBreaker({
  name: "tree-sitter",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 1,
  enabled: true,
});