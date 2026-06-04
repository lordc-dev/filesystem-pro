import { describe, it, expect, beforeEach } from "vitest";
import { RateLimiter, getRateLimiter, setRateLimiter, resetRateLimiter } from "../src/utils/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it("allows requests within limit", () => {
    const result = limiter.check("test_tool");
    expect(result.allowed).toBe(true);
  });

  it("blocks requests when tokens exhausted", () => {
    for (let i = 0; i < 15; i++) {
      limiter.check("test_tool");
    }
    const result = limiter.check("test_tool");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("reports remaining tokens", () => {
    limiter.check("test_tool");
    const stats = limiter.getStats();
    expect(stats.test_tool).toBeDefined();
    expect(stats.test_tool.remaining).toBeLessThan(10);
  });

  it("applies per-tool config", () => {
    limiter.setToolConfig("custom_tool", { maxTokens: 2, tokensPerMinute: 2 });
    limiter.check("custom_tool");
    limiter.check("custom_tool");
    const result = limiter.check("custom_tool");
    expect(result.allowed).toBe(false);
  });

  it("reports global stats", () => {
    const stats = limiter.getStats();
    expect(stats._global).toBeDefined();
    expect(stats._global.maxTokens).toBe(30);
  });
});

describe("getRateLimiter / setRateLimiter", () => {
  afterEach(() => {
    resetRateLimiter();
  });

  it("returns default rate limiter", () => {
    const limiter = getRateLimiter();
    expect(limiter).toBeInstanceOf(RateLimiter);
  });

  it("allows overriding the rate limiter", () => {
    const custom = new RateLimiter();
    setRateLimiter(custom);
    expect(getRateLimiter()).toBe(custom);
  });

  it("resets to default", () => {
    const custom = new RateLimiter();
    setRateLimiter(custom);
    resetRateLimiter();
    expect(getRateLimiter()).not.toBe(custom);
  });
});