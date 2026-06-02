import { describe, it, expect } from "vitest";
import { RateLimiter } from "../src/utils/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  const createLimiter = () => {
    const l = new RateLimiter();
    return l;
  };

  it("allows requests within rate limit", () => {
    limiter = createLimiter();
    const result = limiter.check("test_tool");
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBeGreaterThanOrEqual(0);
  });

  it("rejects requests after exhausting tokens", () => {
    limiter = createLimiter();
    limiter.setToolConfig("limited_tool", { maxTokens: 2, tokensPerMinute: 120 });

    expect(limiter.check("limited_tool").allowed).toBe(true);
    expect(limiter.check("limited_tool").allowed).toBe(true);
    expect(limiter.check("limited_tool").allowed).toBe(false);
  });

  it("returns retryAfterMs when rate limited", () => {
    limiter = createLimiter();
    limiter.setToolConfig("single_tool", { maxTokens: 1, tokensPerMinute: 60 });

    limiter.check("single_tool");
    const result = limiter.check("single_tool");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks per-tool stats", () => {
    limiter = createLimiter();
    limiter.setToolConfig("tracked", { maxTokens: 10, tokensPerMinute: 60 });
    limiter.check("tracked");
    const stats = limiter.getStats();
    expect(stats.tracked).toBeDefined();
    expect(stats.tracked.remaining).toBeLessThanOrEqual(10);
  });

  it("different tools have independent buckets", () => {
    limiter = createLimiter();
    const config = { maxTokens: 1, tokensPerMinute: 60 };
    limiter.setToolConfig("tool_a", config);
    limiter.setToolConfig("tool_b", { ...config });

    expect(limiter.check("tool_a").allowed).toBe(true);
    expect(limiter.check("tool_a").allowed).toBe(false);
    expect(limiter.check("tool_b").allowed).toBe(true);
  });

  it("includes global stats", () => {
    limiter = createLimiter();
    const stats = limiter.getStats();
    expect(stats._global).toBeDefined();
    expect(stats._global.maxTokens).toBeGreaterThan(0);
  });

  it("setToolConfig resets bucket", () => {
    limiter = createLimiter();
    limiter.setToolConfig("reset_test", { maxTokens: 1, tokensPerMinute: 60 });
    limiter.check("reset_test");
    expect(limiter.check("reset_test").allowed).toBe(false);

    limiter.setToolConfig("reset_test", { maxTokens: 5, tokensPerMinute: 60 });
    expect(limiter.check("reset_test").allowed).toBe(true);
  });
});