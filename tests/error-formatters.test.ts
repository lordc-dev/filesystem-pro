/**
 * Error Formatters Tests
 *
 * Tests for error formatting utility functions.
 */

import { describe, it, expect } from "vitest";
import { formatValidationError } from "../src/utils/error-formatters.js";

describe("Error Formatters", () => {
  describe("formatValidationError", () => {
    describe("basic formatting", () => {
      it("includes the validation type", () => {
        const message = formatValidationError("regex", "test", ["Error"]);
        expect(message).toContain("Invalid regex");
      });

      it("includes the value", () => {
        const message = formatValidationError("regex", "my-pattern", ["Error"]);
        expect(message).toContain('"my-pattern"');
      });

      it("includes all errors", () => {
        const errors = ["Error 1", "Error 2", "Error 3"];
        const message = formatValidationError("test", "value", errors);

        for (const error of errors) {
          expect(message).toContain(error);
        }
      });

      it("formats errors as bullet points", () => {
        const message = formatValidationError("test", "value", ["Error 1", "Error 2"]);
        expect(message).toContain("- Error 1");
        expect(message).toContain("- Error 2");
      });

      it("includes issues header when errors exist", () => {
        const message = formatValidationError("test", "value", ["Error"]);
        expect(message).toContain("Issues found:");
      });
    });

    describe("with suggestions", () => {
      it("includes all suggestions", () => {
        const suggestions = ["Fix 1", "Fix 2"];
        const message = formatValidationError("test", "value", ["Error"], suggestions);

        for (const suggestion of suggestions) {
          expect(message).toContain(suggestion);
        }
      });

      it("formats suggestions with checkmarks", () => {
        const message = formatValidationError("test", "value", ["Error"], ["Fix 1"]);
        expect(message).toContain("✓ Fix 1");
      });

      it("includes suggestions header", () => {
        const message = formatValidationError("test", "value", ["Error"], ["Fix 1"]);
        expect(message).toContain("Suggestions:");
      });

      it("handles empty suggestions array", () => {
        const message = formatValidationError("test", "value", ["Error"], []);
        expect(message).not.toContain("Suggestions:");
      });

      it("handles undefined suggestions", () => {
        const message = formatValidationError("test", "value", ["Error"]);
        expect(message).not.toContain("Suggestions:");
      });
    });

    describe("different validation types", () => {
      it("formats regex validation error", () => {
        const message = formatValidationError("regex pattern", "(unclosed", [
          "Unterminated group",
        ]);
        expect(message).toContain("Invalid regex pattern");
        expect(message).toContain("(unclosed");
      });

      it("formats glob validation error", () => {
        const message = formatValidationError("glob pattern", "[abc", [
          "Unclosed bracket",
        ]);
        expect(message).toContain("Invalid glob pattern");
        expect(message).toContain("[abc");
      });

      it("formats path validation error", () => {
        const message = formatValidationError("path", "/etc/passwd", [
          "Outside allowed directories",
        ]);
        expect(message).toContain("Invalid path");
        expect(message).toContain("/etc/passwd");
      });
    });

    describe("edge cases", () => {
      it("handles empty error array", () => {
        const message = formatValidationError("test", "value", []);
        expect(message).toContain("Invalid test");
        expect(message).toContain('"value"');
        expect(message).not.toContain("Issues found:");
      });

      it("handles empty value", () => {
        const message = formatValidationError("test", "", ["Empty value"]);
        expect(message).toContain('""');
      });

      it("handles value with special characters", () => {
        const message = formatValidationError("test", '{"key": "value"}', ["Error"]);
        expect(message).toContain('{"key": "value"}');
      });

      it("handles value with newlines", () => {
        const message = formatValidationError("test", "line1\nline2", ["Error"]);
        expect(message).toContain("line1\nline2");
      });

      it("handles very long values", () => {
        const longValue = "a".repeat(1000);
        const message = formatValidationError("test", longValue, ["Error"]);
        expect(message).toContain(longValue);
      });

      it("handles values with unicode", () => {
        const message = formatValidationError("test", "café 日本語", ["Error"]);
        expect(message).toContain("café 日本語");
      });
    });

    describe("output structure", () => {
      it("has consistent line structure", () => {
        const message = formatValidationError("test", "value", ["Error 1", "Error 2"], [
          "Fix 1",
          "Fix 2",
        ]);

        const lines = message.split("\n");

        // First line should be the invalid message
        expect(lines[0]).toContain("Invalid test");

        // Should have issues section
        expect(lines.some((l) => l.includes("Issues found:"))).toBe(true);

        // Should have suggestions section
        expect(lines.some((l) => l.includes("Suggestions:"))).toBe(true);
      });

      it("separates sections with blank lines", () => {
        const message = formatValidationError("test", "value", ["Error"], ["Fix"]);
        expect(message).toContain("\n\n");
      });

      it("indents errors and suggestions", () => {
        const message = formatValidationError("test", "value", ["Error"], ["Fix"]);

        const lines = message.split("\n");
        const errorLine = lines.find((l) => l.includes("Error"));
        const fixLine = lines.find((l) => l.includes("Fix"));

        expect(errorLine).toMatch(/^\s+-/);
        expect(fixLine).toMatch(/^\s+✓/);
      });
    });

    describe("multiline errors and suggestions", () => {
      it("handles multiline errors", () => {
        const errors = ["Error on\nmultiple lines"];
        const message = formatValidationError("test", "value", errors);
        expect(message).toContain("Error on\nmultiple lines");
      });

      it("handles many errors", () => {
        const errors = Array.from({ length: 10 }, (_, i) => `Error ${i + 1}`);
        const message = formatValidationError("test", "value", errors);

        for (const error of errors) {
          expect(message).toContain(error);
        }
      });

      it("handles many suggestions", () => {
        const suggestions = Array.from({ length: 10 }, (_, i) => `Fix ${i + 1}`);
        const message = formatValidationError("test", "value", ["Error"], suggestions);

        for (const suggestion of suggestions) {
          expect(message).toContain(suggestion);
        }
      });
    });
  });
});
