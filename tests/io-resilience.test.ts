import { describe, it, expect, vi, beforeEach } from "vitest";
import { resilientIO, io, ioCircuitBreaker } from "../src/utils/io-resilience.js";
import { CircuitBreaker } from "../src/utils/circuit-breaker.js";

describe("io-resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resilientIO", () => {
    it("passes through successful operations", async () => {
      const result = await resilientIO("test", () => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it("retries transient errors", async () => {
      let attempts = 0;
      const err = new Error("EAGAIN") as NodeJS.ErrnoException;
      err.code = "EAGAIN";

      const result = await resilientIO(
        "test",
        () => {
          attempts++;
          if (attempts < 2) return Promise.reject(err);
          return Promise.resolve("ok");
        },
        { retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10, retryableCodes: ["EAGAIN"] } },
      );

      expect(result).toBe("ok");
      expect(attempts).toBe(2);
    });

    it("skips circuit breaker when requested", async () => {
      const result = await resilientIO("test", () => Promise.resolve("ok"), {
        skipCircuitBreaker: true,
      });
      expect(result).toBe("ok");
    });

    it("fails after circuit breaker opens", async () => {
      const breaker = new CircuitBreaker({
        name: "test",
        failureThreshold: 2,
        resetTimeoutMs: 1000,
        halfOpenSuccessThreshold: 1,
        enabled: true,
      });

      const err = new Error("fail");
      await expect(breaker.execute(() => Promise.reject(err))).rejects.toThrow("fail");
      await expect(breaker.execute(() => Promise.reject(err))).rejects.toThrow("fail");
      await expect(breaker.execute(() => Promise.resolve("ok"))).rejects.toThrow(/open/i);
    });
  });

  describe("io helpers", () => {
    it("io.read delegates to resilientIO", async () => {
      const result = await io.read("test", () => Promise.resolve("content"));
      expect(result).toBe("content");
    });

    it("io.write delegates to resilientIO", async () => {
      const result = await io.write("test", () => Promise.resolve(undefined));
      expect(result).toBeUndefined();
    });

    it("io.stat delegates to resilientIO", async () => {
      const result = await io.stat("test", () => Promise.resolve({ size: 100 }));
      expect(result).toEqual({ size: 100 });
    });

    it("io.dir delegates to resilientIO", async () => {
      const result = await io.dir("test", () => Promise.resolve(["a", "b"]));
      expect(result).toEqual(["a", "b"]);
    });
  });
});