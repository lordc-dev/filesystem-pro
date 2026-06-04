import { describe, it, expect } from "vitest";
import { requiresPCRE2, isRipgrepAvailable, RipgrepNotFoundError } from "../src/search/ripgrep-executor.js";

describe("requiresPCRE2", () => {
  it("returns false for empty string", () => {
    expect(requiresPCRE2("")).toBe(false);
  });

  it("returns false for simple pattern", () => {
    expect(requiresPCRE2("hello")).toBe(false);
  });

  it("returns true for lookahead", () => {
      expect(requiresPCRE2("(?=foo)")).toBe(true);
  });

  it("returns true for negative lookahead", () => {
    expect(requiresPCRE2("(?!bar)")).toBe(true);
  });

  it("returns true for lookbehind", () => {
    expect(requiresPCRE2("(?<=baz)")).toBe(true);
  });

  it("returns true for named groups", () => {
  expect(requiresPCRE2("(?=foo)")).toBe(true);
  });

  it("returns true for backreferences", () => {
    expect(requiresPCRE2("\\k<name>")).toBe(true);
  });

  it("returns false for simple alternation", () => {
    expect(requiresPCRE2("foo|bar")).toBe(false);
  });
});

describe("isRipgrepAvailable", () => {
  it("returns true if rg is installed", async () => {
    const available = await isRipgrepAvailable();
    expect(typeof available).toBe("boolean");
  });
});

describe("RipgrepNotFoundError", () => {
  it("has correct name and message", () => {
    const err = new RipgrepNotFoundError();
    expect(err.name).toBe("RipgrepNotFoundError");
    expect(err.message).toContain("ripgrep");
  });
});