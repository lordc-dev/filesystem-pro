import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../src/utils/retry.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const result = await withRetry(() => Promise.resolve("ok"), {}, "test");
    expect(result).toBe("ok");
  });

  it("retries on retryable errors", async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts < 3) {
        const err = new Error("EAGAIN") as NodeJS.ErrnoException;
        err.code = "EAGAIN";
        return Promise.reject(err);
      }
      return Promise.resolve("ok");
    };

    const result = await withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 1,
      maxDelayMs: 10,
      multiplier: 2,
      jitter: 0,
      retryableCodes: ["EAGAIN"],
    }, "test");

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws on non-retryable errors immediately", async () => {
    const err = new Error("fatal") as NodeJS.ErrnoException;
    err.code = "EPERM";
    await expect(
      withRetry(() => Promise.reject(err), {
        maxAttempts: 3,
        baseDelayMs: 1,
        retryableCodes: ["EAGAIN"],
      }, "test"),
    ).rejects.toThrow("fatal");
  });

  it("throws last error after maxAttempts exhausted", async () => {
    const err = new Error("EAGAIN") as NodeJS.ErrnoException;
    err.code = "EAGAIN";
    let attempts = 0;

    await expect(
      withRetry(
        () => {
          attempts++;
          return Promise.reject(err);
        },
        {
          maxAttempts: 2,
          baseDelayMs: 1,
          maxDelayMs: 10,
          retryableCodes: ["EAGAIN"],
        },
        "test",
      ),
    ).rejects.toThrow("EAGAIN");

    expect(attempts).toBe(2);
  });

  it("respects custom retryable codes", async () => {
    let attempts = 0;
    const err = new Error("busy") as NodeJS.ErrnoException;
    err.code = "EBUSY";

    const result = await withRetry(
      () => {
        attempts++;
        if (attempts < 2) return Promise.reject(err);
        return Promise.resolve("ok");
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 10,
        retryableCodes: ["EBUSY"],
      },
      "test",
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("applies jitter to delay", async () => {
    const start = Date.now();
    const err = new Error("EAGAIN") as NodeJS.ErrnoException;
    err.code = "EAGAIN";

    await withRetry(
      () => {
        if (Date.now() - start < 50) return Promise.reject(err);
        return Promise.resolve("ok");
      },
      {
        maxAttempts: 10,
        baseDelayMs: 30,
        maxDelayMs: 500,
        multiplier: 2,
        jitter: 0.2,
        retryableCodes: ["EAGAIN"],
      },
      "test",
    );
  });

  it("handles non-Error rejections", async () => {
    await expect(
      withRetry(() => Promise.reject("string error"), {
        maxAttempts: 1,
        retryableCodes: ["EAGAIN"],
      }, "test"),
    ).rejects.toThrow();
  });
});