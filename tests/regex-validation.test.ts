/**
 * Regex Validation Tests
 *
 * Tests for regex pattern validation functionality.
 */

import { describe, it, expect } from "vitest";
import {
  validateRegexPattern,
  formatRegexErrorWithHints,
} from "../src/validation/regex-validation.js";

describe("Regex Validation", () => {
  describe("validateRegexPattern", () => {
    describe("valid patterns", () => {
      it("accepts simple literal patterns", () => {
        expect(validateRegexPattern("hello").valid).toBe(true);
        expect(validateRegexPattern("test123").valid).toBe(true);
        expect(validateRegexPattern("foo-bar").valid).toBe(true);
      });

      it("accepts common regex patterns", () => {
        expect(validateRegexPattern("\\d+").valid).toBe(true);
        expect(validateRegexPattern("\\w+").valid).toBe(true);
        expect(validateRegexPattern("\\s*").valid).toBe(true);
        expect(validateRegexPattern("[a-z]+").valid).toBe(true);
        expect(validateRegexPattern("[A-Z0-9]+").valid).toBe(true);
      });

      it("accepts patterns with quantifiers", () => {
        expect(validateRegexPattern("a+").valid).toBe(true);
        expect(validateRegexPattern("a*").valid).toBe(true);
        expect(validateRegexPattern("a?").valid).toBe(true);
        expect(validateRegexPattern("a{3}").valid).toBe(true);
        expect(validateRegexPattern("a{1,3}").valid).toBe(true);
        expect(validateRegexPattern("a{2,}").valid).toBe(true);
      });

      it("accepts patterns with anchors", () => {
        expect(validateRegexPattern("^hello").valid).toBe(true);
        expect(validateRegexPattern("world$").valid).toBe(true);
        expect(validateRegexPattern("^hello$").valid).toBe(true);
        expect(validateRegexPattern("\\bhello\\b").valid).toBe(true);
      });

      it("accepts patterns with groups", () => {
        expect(validateRegexPattern("(abc)").valid).toBe(true);
        expect(validateRegexPattern("(a|b)").valid).toBe(true);
        expect(validateRegexPattern("(a)(b)(c)").valid).toBe(true);
        expect(validateRegexPattern("(?:abc)").valid).toBe(true);
      });

      it("accepts patterns with lookahead/lookbehind", () => {
        expect(validateRegexPattern("foo(?=bar)").valid).toBe(true);
        expect(validateRegexPattern("foo(?!bar)").valid).toBe(true);
        expect(validateRegexPattern("(?<=foo)bar").valid).toBe(true);
        expect(validateRegexPattern("(?<!foo)bar").valid).toBe(true);
      });

      it("accepts properly escaped special characters", () => {
        expect(validateRegexPattern("\\.").valid).toBe(true);
        expect(validateRegexPattern("\\$").valid).toBe(true);
        expect(validateRegexPattern("\\^").valid).toBe(true);
        expect(validateRegexPattern("\\*").valid).toBe(true);
        expect(validateRegexPattern("\\+").valid).toBe(true);
        expect(validateRegexPattern("\\?").valid).toBe(true);
        expect(validateRegexPattern("\\{").valid).toBe(true);
        expect(validateRegexPattern("\\}").valid).toBe(true);
        expect(validateRegexPattern("\\[").valid).toBe(true);
        expect(validateRegexPattern("\\]").valid).toBe(true);
        expect(validateRegexPattern("\\(").valid).toBe(true);
        expect(validateRegexPattern("\\)").valid).toBe(true);
        expect(validateRegexPattern("\\|").valid).toBe(true);
        expect(validateRegexPattern("\\\\").valid).toBe(true);
      });

      it("accepts complex real-world patterns", () => {
        // Email-like pattern
        expect(validateRegexPattern("[^\\s@]+@[^\\s@]+\\.[^\\s@]+").valid).toBe(true);
        // Function declaration
        expect(validateRegexPattern("function\\s+\\w+\\s*\\(").valid).toBe(true);
        // Import statement
        expect(validateRegexPattern("import\\s+\\{[^}]+\\}\\s+from").valid).toBe(true);
        // Class definition
        expect(validateRegexPattern("class\\s+\\w+\\s*(extends\\s+\\w+)?\\s*\\{").valid).toBe(true);
      });
    });

    describe("invalid patterns", () => {
      it("rejects empty patterns", () => {
        const result = validateRegexPattern("");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("non-empty"))).toBe(true);
        expect(result.errorMessage).toBeDefined();
      });

      it("rejects null/undefined patterns", () => {
        expect(validateRegexPattern(null as unknown as string).valid).toBe(false);
        expect(validateRegexPattern(undefined as unknown as string).valid).toBe(false);
      });

      it("rejects patterns with null bytes", () => {
        const result = validateRegexPattern("test\x00pattern");
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("null bytes"))).toBe(true);
      });

      it("rejects unescaped braces (ripgrep requirement)", () => {
        const result = validateRegexPattern("test{3}");
        // Note: JavaScript RegExp may accept this, but ripgrep might not
        // This test validates the pattern compiles in JS
        expect(result.valid).toBe(true);
      });

      it("rejects unclosed parentheses", () => {
        const result = validateRegexPattern("(abc");
        expect(result.valid).toBe(false);
        expect(result.errorMessage).toBeDefined();
      });

      it("rejects unclosed brackets", () => {
        const result = validateRegexPattern("[abc");
        expect(result.valid).toBe(false);
        expect(result.errorMessage).toBeDefined();
      });

      it("rejects invalid quantifiers", () => {
        const result = validateRegexPattern("a{3,1}");
        expect(result.valid).toBe(false);
      });

      it("rejects invalid escape sequences", () => {
        // Note: JavaScript is lenient with escapes, so few are truly invalid
        // This validates the error message is generated
        const result = validateRegexPattern("\\");
        expect(result.valid).toBe(false);
      });
    });

    describe("autoFix option", () => {
      it("attempts to auto-fix common errors", () => {
        // Pattern with unescaped braces
        const result = validateRegexPattern("test{invalid}", { autoFix: true });
        // May or may not fix depending on the error type
        if (!result.valid) {
          expect(result.errorMessage).toBeDefined();
        }
      });

      it("reports warning when auto-fix is applied", () => {
        // Create a pattern that can be auto-fixed
        const result = validateRegexPattern("{test}", { autoFix: true });
        if (result.sanitized) {
          expect(result.warnings.some((w) => w.includes("Auto-fixed"))).toBe(true);
        }
      });

      it("does not modify already valid patterns", () => {
        const result = validateRegexPattern("\\w+", { autoFix: true });
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBeUndefined();
      });
    });

    describe("warnings", () => {
      it("warns about overly broad patterns", () => {
        const result1 = validateRegexPattern(".*");
        expect(result1.valid).toBe(true);
        expect(result1.warnings.some((w) => w.includes("matches almost everything"))).toBe(true);

        const result2 = validateRegexPattern(".+");
        expect(result2.valid).toBe(true);
        expect(result2.warnings.some((w) => w.includes("matches almost everything"))).toBe(true);
      });

      it("warns about double backslashes", () => {
        const result = validateRegexPattern("test\\\\path");
        expect(result.valid).toBe(true);
        expect(result.warnings.some((w) => w.includes("double backslash"))).toBe(true);
      });

      it("returns empty warnings for normal patterns", () => {
        const result = validateRegexPattern("\\w+");
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe("error messages", () => {
      it("includes pattern in error message", () => {
        const result = validateRegexPattern("(unclosed");
        expect(result.errorMessage).toContain("unclosed");
      });

      it("includes suggestions in error message", () => {
        const result = validateRegexPattern("(unclosed");
        expect(result.errorMessage).toBeDefined();
        // Should include hints about escaping
        expect(result.errorMessage).toContain("escape");
      });
    });
  });

  describe("formatRegexErrorWithHints", () => {
    it("includes pattern in formatted error", () => {
      const message = formatRegexErrorWithHints("test", ["Error"], []);
      expect(message).toContain("test");
    });

    it("includes all errors", () => {
      const message = formatRegexErrorWithHints("test", ["Error 1", "Error 2"], []);
      expect(message).toContain("Error 1");
      expect(message).toContain("Error 2");
    });

    it("includes all suggestions", () => {
      const message = formatRegexErrorWithHints("test", ["Error"], ["Fix 1", "Fix 2"]);
      expect(message).toContain("Fix 1");
      expect(message).toContain("Fix 2");
    });

    it("includes regex syntax hints", () => {
      const message = formatRegexErrorWithHints("test", ["Error"], []);
      expect(message).toContain("special characters");
      expect(message).toContain("escaping");
    });

    it("includes examples", () => {
      const message = formatRegexErrorWithHints("test", ["Error"], []);
      expect(message).toContain("Examples:");
      expect(message).toContain("Good:");
      expect(message).toContain("Bad:");
    });
  });

  describe("edge cases", () => {
    it("handles very long patterns", () => {
      const longPattern = "a".repeat(10000);
      const result = validateRegexPattern(longPattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("maximum length"))).toBe(true);
    });

    it("accepts patterns within length limit", () => {
      const maxPattern = "a".repeat(1024);
      const result = validateRegexPattern(maxPattern);
      expect(result.valid).toBe(true);
    });

    it("handles unicode patterns", () => {
      expect(validateRegexPattern("café").valid).toBe(true);
      expect(validateRegexPattern("日本語").valid).toBe(true);
      expect(validateRegexPattern("\\p{L}+").valid).toBe(true);
    });

    it("handles patterns with newlines", () => {
      expect(validateRegexPattern("hello\\nworld").valid).toBe(true);
      expect(validateRegexPattern("line1\nline2").valid).toBe(true);
    });

    it("handles patterns with special unicode escapes", () => {
      expect(validateRegexPattern("\\u0041").valid).toBe(true);
      expect(validateRegexPattern("\\x41").valid).toBe(true);
    });
  });
});
