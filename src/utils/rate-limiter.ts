/**
 * Rate Limiter - Token bucket per tool/session
 *
 * Prevents any single tool from consuming excessive resources.
 * Configurable per-tool rate limits via MCP_RATE_LIMIT_<TOOL> env vars.
 * 
 * Default: 60 requests per tool per minute (1/sec average).
 * Tools can override with custom limits.
 */

import { logger } from "./logger.js";
import { incrementCounter } from "./metrics.js";

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  /** Maximum tokens in the bucket (burst capacity) */
  maxTokens: number;
  /** Tokens added per minute (refill rate) */
  tokensPerMinute: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  retryAfterMs: number;
}

// ============================================================================
// TOKEN BUCKET
// ============================================================================

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillPerMs: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  consume(): RateLimitResult {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true, remainingTokens: this.tokens, retryAfterMs: 0 };
    }
    const deficit = 1 - this.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillPerMs));
    return { allowed: false, remainingTokens: 0, retryAfterMs };
  }

  get remaining(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillPerMs;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

// ============================================================================
// RATE LIMITER
// ============================================================================

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTokens: 10,
  tokensPerMinute: 60,
};

const GLOBAL_CONFIG: RateLimitConfig = {
  maxTokens: 30,
  tokensPerMinute: 120,
};

export class RateLimiter {
  private readonly buckets: Map<string, TokenBucket> = new Map();
  private readonly configs: Map<string, RateLimitConfig> = new Map();
  private globalBucket: TokenBucket;

  constructor() {
    this.globalBucket = new TokenBucket(
      GLOBAL_CONFIG.maxTokens,
      GLOBAL_CONFIG.tokensPerMinute / 60_000,
    );
  }

  /**
   * Set rate limit configuration for a specific tool.
   */
  setToolConfig(toolName: string, config: RateLimitConfig): void {
    this.configs.set(toolName, config);
    this.buckets.set(
      toolName,
      new TokenBucket(config.maxTokens, config.tokensPerMinute / 60_000),
    );
  }

  /**
   * Check if a request is allowed for the given tool.
   * Both per-tool and global limits must pass.
   */
  check(toolName: string): RateLimitResult {
    const bucket = this.getOrCreateBucket(toolName);

    const toolResult = bucket.consume();
    if (!toolResult.allowed) {
      incrementCounter("rate_limited", { tool: toolName, scope: "tool" });
      return toolResult;
    }

    const globalResult = this.globalBucket.consume();
    if (!globalResult.allowed) {
      this.globalBucket = new TokenBucket(
        GLOBAL_CONFIG.maxTokens,
        GLOBAL_CONFIG.tokensPerMinute / 60_000,
      );
      incrementCounter("rate_limited", { tool: toolName, scope: "global" });
      logger.warn(`[RateLimit] Global rate limit exceeded for tool ${toolName}`);
      return { allowed: false, remainingTokens: 0, retryAfterMs: Math.max(toolResult.retryAfterMs, globalResult.retryAfterMs) };
    }

    return toolResult;
  }

  /**
   * Get statistics for monitoring.
   */
  getStats(): Record<string, { remaining: number; maxTokens: number; tokensPerMinute: number }> {
    const stats: Record<string, { remaining: number; maxTokens: number; tokensPerMinute: number }> = {};
    for (const [toolName, _bucket] of this.buckets) {
      const config = this.configs.get(toolName) ?? DEFAULT_CONFIG;
      stats[toolName] = {
        remaining: _bucket.remaining,
        maxTokens: config.maxTokens,
        tokensPerMinute: config.tokensPerMinute,
      };
    }
    stats["_global"] = {
      remaining: this.globalBucket.remaining,
      maxTokens: GLOBAL_CONFIG.maxTokens,
      tokensPerMinute: GLOBAL_CONFIG.tokensPerMinute,
    };
    return stats;
  }

  private getOrCreateBucket(toolName: string): TokenBucket {
    let bucket = this.buckets.get(toolName);
    if (!bucket) {
      const config = this.configs.get(toolName) ?? DEFAULT_CONFIG;
      bucket = new TokenBucket(config.maxTokens, config.tokensPerMinute / 60_000);
      this.buckets.set(toolName, bucket);
    }
    return bucket;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const _defaultRateLimiter = new RateLimiter();
let _rateLimiter: RateLimiter = _defaultRateLimiter;

export function getRateLimiter(): RateLimiter { return _rateLimiter; }
export function setRateLimiter(limiter: RateLimiter): void { _rateLimiter = limiter; }
export function resetRateLimiter(): void { _rateLimiter = _defaultRateLimiter; }

/**
 * Default rate limiter instance.
 * For testing, use setRateLimiter() to inject a mock.
 */
export const rateLimiter: RateLimiter = new Proxy({} as RateLimiter, {
  get(_, prop) { return Reflect.get(_rateLimiter, prop); },
  set(_, prop, value) { return Reflect.set(_rateLimiter, prop, value); },
});

/**
 * Load rate limit configuration from environment variables.
 * Format: MCP_RATE_LIMIT_<TOOLNAME>=maxTokens:tokensPerMinute
 * Example: MCP_RATE_LIMIT_EDIT_FILE=20:120
 */
export function loadRateLimitsFromEnv(): void {
  const prefix = "MCP_RATE_LIMIT_";
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(prefix) || !value) continue;
    const toolName = key.slice(prefix.length).toLowerCase();
    const parts = value.split(":");
    if (parts.length !== 2) {
      logger.warn(`[RateLimit] Invalid format for ${key}: expected maxTokens:tokensPerMinute, got ${value}`);
      continue;
    }
    const maxTokens = parseInt(parts[0], 10);
    const tokensPerMinute = parseInt(parts[1], 10);
    if (Number.isNaN(maxTokens) || Number.isNaN(tokensPerMinute) || maxTokens <= 0 || tokensPerMinute <= 0) {
      logger.warn(`[RateLimit] Invalid values for ${key}: maxTokens=${parts[0]}, tokensPerMinute=${parts[1]}`);
      continue;
    }
    rateLimiter.setToolConfig(toolName, { maxTokens, tokensPerMinute });
    logger.info(`[RateLimit] Configured ${toolName}: maxTokens=${maxTokens}, tokensPerMinute=${tokensPerMinute}`);
  }
}