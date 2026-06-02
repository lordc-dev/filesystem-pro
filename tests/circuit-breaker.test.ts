import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker } from "../src/utils/circuit-breaker.js";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: "test",
      failureThreshold: 3,
      resetTimeoutMs: 100,
      halfOpenSuccessThreshold: 1,
      enabled: true,
    });
  });

  it("starts in CLOSED state", () => {
    expect(breaker.getStats().state).toBe("closed");
  });

  it("allows operations in CLOSED state", async () => {
    const result = await breaker.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("transitions to OPEN after failureThreshold failures", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    }
    expect(breaker.getStats().state).toBe("open");
  });

  it("rejects requests in OPEN state", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    }
    await expect(breaker.execute(() => Promise.resolve("ok"))).rejects.toThrow(/open/i);
    expect(breaker.getStats().totalRejected).toBe(1);
  });

  it("transitions to HALF_OPEN after resetTimeout", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    }
    expect(breaker.getStats().state).toBe("open");

    await new Promise((r) => setTimeout(r, 150));
    expect(breaker.getStats().state).toBe("half_open");
  });

  it("closes from HALF_OPEN on success", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    }
    await new Promise((r) => setTimeout(r, 150));

    const result = await breaker.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
    expect(breaker.getStats().state).toBe("closed");
  });

  it("re-opens from HALF_OPEN on failure", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    }
    await new Promise((r) => setTimeout(r, 150));

    await expect(breaker.execute(() => Promise.reject(new Error("still failing")))).rejects.toThrow("still failing");
    expect(breaker.getStats().state).toBe("open");
  });

  it("resets failure count on success in CLOSED state", async () => {
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(breaker.getStats().failures).toBe(2);

    await breaker.execute(() => Promise.resolve("ok"));
    expect(breaker.getStats().failures).toBe(0);
  });

  it("tracks totalTrips counter", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    }
    expect(breaker.getStats().totalTrips).toBe(1);
  });

  it("disabling bypasses circuit breaker", async () => {
    const disabled = new CircuitBreaker({
      name: "disabled",
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      halfOpenSuccessThreshold: 1,
      enabled: false,
    });
    await expect(disabled.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(disabled.getStats().state).toBe("closed");
  });

  it("stats returns correct snapshot", async () => {
    await breaker.execute(() => Promise.resolve("ok"));
    const stats = breaker.getStats();
    expect(stats.successes).toBe(1);
    expect(stats.failures).toBe(0);
    expect(stats.lastFailureTime).toBeNull();
  });
});