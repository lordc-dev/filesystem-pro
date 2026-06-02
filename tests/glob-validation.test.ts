/**
 * Glob Validation Tests
 *
 * Tests for glob pattern validation functionality.
 */

import { describe, it, expect } from "vitest";
import {
  validateGlobPattern,
  validateGlobBrackets,
  formatGlobErrorWithHints,
} from "../src/validation/glob-validation.js";

describe("Glob Validation", () => {
  describe("validateGlobPattern", () => {
    describe("valid patterns", () => {
      it("accepts simple wildcard patterns", () => {
        expect(validateGlobPattern("*.ts").valid).toBe(true);
        expect(validateGlobPattern("*.js").valid).toBe(true);
        expect(validateGlobPattern("test*").valid).toBe(true);
        expect(validateGlobPattern("*test*").valid).toBe(true);
      });

      it("accepts double-star directory patterns", () => {
        expect(validateGlobPattern("**/*.ts").valid).toBe(true);
        expect(validateGlobPattern("src/**/*.ts").valid).toBe(true);
        expect(validateGlobPattern("**/test/**").valid).toBe(true);
      });

      it("accepts single character wildcard", () => {
        expect(validateGlobPattern("?.ts").valid).toBe(true);
        expect(validateGlobPattern("test?.ts").valid).toBe(true);
        expect(validateGlobPattern("???").valid).toBe(true);
      });

      it("accepts bracket expressions", () => {
        expect(validateGlobPattern("[abc].ts").valid).toBe(true);
        expect(validateGlobPattern("[a-z].ts").valid).toBe(true);
        expect(validateGlobPattern("[0-9]*.ts").valid).toBe(true);
        expect(validateGlobPattern("[!abc].ts").valid).toBe(true);
      });

      it("accepts brace expressions", () => {
        expect(validateGlobPattern("{a,b,c}.ts").valid).toBe(true);
        expect(validateGlobPattern("*.{ts,js}").valid).toBe(true);
        expect(validateGlobPattern("{src,lib}/**/*.ts").valid).toBe(true);
      });

      it("accepts array of patterns", () => {
        const result = validateGlobPattern(["*.ts", "*.js"]);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("accepts complex real-world patterns", () => {
        expect(validateGlobPattern("src/**/[A-Z]*.ts").valid).toBe(true);
        expect(validateGlobPattern("**/*.{test,spec}.ts").valid).toBe(true);
        expect(validateGlobPattern("!node_modules/**").valid).toBe(true);
        expect(validateGlobPattern("src/**/*.{ts,tsx,js,jsx}").valid).toBe(true);
      });
    });

    describe("invalid patterns", () => {
      it("rejects regex syntax (.*)", () => {
        const result = validateGlobPattern(".*\\.ts");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes(".*"))).toBe(true);
      });

      it("rejects empty patterns", () => {
        const result = validateGlobPattern("");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("non-empty"))).toBe(true);
      });

      it("rejects non-string patterns", () => {
        const result = validateGlobPattern(null as unknown as string);
        expect(result.valid).toBe(false);
      });

      it("rejects unclosed bracket expressions", () => {
        const result = validateGlobPattern("[abc");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("Unclosed bracket"))).toBe(true);
      });

      it("rejects invalid character ranges", () => {
        const result = validateGlobPattern("[z-a].ts");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("Invalid range"))).toBe(true);
      });

      it("rejects nested brackets", () => {
        const result = validateGlobPattern("[a[bc]]");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("Nested brackets"))).toBe(true);
      });

      it("rejects invalid patterns in array", () => {
        const result = validateGlobPattern(["*.ts", "", "*.js"]);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("index 1"))).toBe(true);
      });
    });

    describe("autoFix option", () => {
      it("auto-fixes .* to *", () => {
        const result = validateGlobPattern(".*\\.ts", { autoFix: true });
        expect(result.valid).toBe(true);
        // Single pattern returns array with one element
        expect(result.sanitized).toEqual(["*\\.ts"]);
        expect(result.warnings.some((w) => w.includes("Auto-fixed"))).toBe(true);
      });

      it("auto-fixes multiple .* occurrences", () => {
        const result = validateGlobPattern(".*.*", { autoFix: true });
        expect(result.valid).toBe(true);
        // Single pattern returns array with one element
        expect(result.sanitized).toEqual(["**"]);;
      });

      it("auto-fixes patterns in array", () => {
        const result = validateGlobPattern([".*\\.ts", "*.js"], { autoFix: true });
        expect(result.valid).toBe(true);
        expect(result.sanitized).toEqual(["*\\.ts", "*.js"]);
      });

      it("does not modify valid patterns", () => {
        const result = validateGlobPattern("*.ts", { autoFix: true });
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBeUndefined();
      });
    });

    describe("warnings", () => {
      it("returns empty warnings for valid patterns", () => {
        const result = validateGlobPattern("*.ts");
        expect(result.warnings).toHaveLength(0);
      });

      it("includes warnings in auto-fix results", () => {
        const result = validateGlobPattern(".*", { autoFix: true });
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });
  });

  describe("validateGlobBrackets", () => {
    it("returns empty array for valid brackets", () => {
      expect(validateGlobBrackets("[abc]")).toHaveLength(0);
      expect(validateGlobBrackets("[a-z]")).toHaveLength(0);
      expect(validateGlobBrackets("[0-9]")).toHaveLength(0);
      expect(validateGlobBrackets("[!abc]")).toHaveLength(0);
    });

    it("returns empty array for patterns without brackets", () => {
      expect(validateGlobBrackets("*.ts")).toHaveLength(0);
      expect(validateGlobBrackets("test")).toHaveLength(0);
    });

    it("detects unclosed brackets", () => {
      const errors = validateGlobBrackets("[abc");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Unclosed bracket");
    });

    it("detects nested brackets", () => {
      const errors = validateGlobBrackets("[a[bc]]");
      expect(errors.some((e) => e.includes("Nested"))).toBe(true);
    });

    it("detects invalid character ranges", () => {
      const errors = validateGlobBrackets("[z-a]");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Invalid range");
      expect(errors[0]).toContain("z");
      expect(errors[0]).toContain("a");
    });

    it("allows valid character ranges", () => {
      expect(validateGlobBrackets("[a-z]")).toHaveLength(0);
      expect(validateGlobBrackets("[A-Z]")).toHaveLength(0);
      expect(validateGlobBrackets("[0-9]")).toHaveLength(0);
      expect(validateGlobBrackets("[a-zA-Z0-9]")).toHaveLength(0);
    });

    it("handles escaped brackets", () => {
      expect(validateGlobBrackets("\\[abc")).toHaveLength(0);
      expect(validateGlobBrackets("\\[abc\\]")).toHaveLength(0);
    });

    it("handles multiple bracket expressions", () => {
      expect(validateGlobBrackets("[a-z][0-9]")).toHaveLength(0);
      expect(validateGlobBrackets("[a-z][z-a]")).toHaveLength(1);
    });
  });

  describe("formatGlobErrorWithHints", () => {
    it("includes pattern in error message", () => {
      const message = formatGlobErrorWithHints('"*.ts"', ["Test error"]);
      expect(message).toContain("*.ts");
    });

    it("includes all errors", () => {
      const message = formatGlobErrorWithHints('"test"', ["Error 1", "Error 2"]);
      expect(message).toContain("Error 1");
      expect(message).toContain("Error 2");
    });

    it("includes glob syntax hints", () => {
      const message = formatGlobErrorWithHints('"test"', ["Error"]);
      expect(message).toContain("Glob pattern syntax");
      expect(message).toContain("*");
      expect(message).toContain("**");
      expect(message).toContain("?");
      expect(message).toContain("[abc]");
      expect(message).toContain("{a,b}");
    });

    it("includes examples", () => {
      const message = formatGlobErrorWithHints('"test"', ["Error"]);
      expect(message).toContain("Examples:");
      expect(message).toContain("Good:");
      expect(message).toContain("Bad:");
    });

    it("handles array pattern formatting", () => {
      const message = formatGlobErrorWithHints('["*.ts", "*.js"]', ["Error"]);
      expect(message).toContain("*.ts");
      expect(message).toContain("*.js");
    });
  });
});
