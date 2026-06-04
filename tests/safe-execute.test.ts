import { describe, it, expect } from "vitest";
import {
  normalizeError,
  normalizeErrorMessage,
  safeExecute,
  safeExecuteOr,
} from "../src/utils/safe-execute.js";

describe("safeExecute", () => {
  it("returns data on success", async () => {
    const result = await safeExecute(() => Promise.resolve(42));
    expect(result.data).toBe(42);
    expect(result.error).toBeNull();
  });

  it("returns null data and error on failure", async () => {
    const result = await safeExecute(() => Promise.reject(new Error("boom")));
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe("boom");
  });

  it("handles non-Error rejections", async () => {
    const result = await safeExecute(() => Promise.reject("string error"));
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe("string error");
  });

  it("logs context when provided", async () => {
    const result = await safeExecute(() => Promise.reject(new Error("fail")), "myContext");
    expect(result.error).toBeDefined();
  });
});

describe("safeExecuteOr", () => {
  it("returns data on success", async () => {
    const result = await safeExecuteOr(() => Promise.resolve("ok"), "fallback");
    expect(result).toBe("ok");
  });

  it("returns fallback on failure", async () => {
    const result = await safeExecuteOr(() => Promise.reject(new Error("fail")), "fallback");
    expect(result).toBe("fallback");
  });
});

describe("normalizeError", () => {
  it("returns Error instances as-is", () => {
    const err = new Error("test");
    expect(normalizeError(err)).toBe(err);
  });

  it("wraps non-Error values", () => {
    const err = normalizeError("string");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("string");
  });

  it("wraps numbers", () => {
    const err = normalizeError(42);
    expect(err.message).toBe("42");
  });
});

describe("normalizeErrorMessage", () => {
  it("extracts message from Error", () => {
    expect(normalizeErrorMessage(new Error("msg"))).toBe("msg");
  });

  it("stringifies non-Error", () => {
    expect(normalizeErrorMessage(123)).toBe("123");
  });
});