/**
 * Text Utils Tests
 *
 * Tests for text utility functions.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeLineEndings,
  formatSize,
  escapeRegex,
} from "../src/utils/text-utils.js";

describe("Text Utils", () => {
  describe("normalizeLineEndings", () => {
    it("converts CRLF to LF", () => {
      expect(normalizeLineEndings("hello\r\nworld")).toBe("hello\nworld");
      expect(normalizeLineEndings("line1\r\nline2\r\nline3")).toBe("line1\nline2\nline3");
    });

    it("preserves LF line endings", () => {
      expect(normalizeLineEndings("hello\nworld")).toBe("hello\nworld");
      expect(normalizeLineEndings("line1\nline2\nline3")).toBe("line1\nline2\nline3");
    });

    it("handles mixed line endings", () => {
      expect(normalizeLineEndings("line1\r\nline2\nline3\r\n")).toBe("line1\nline2\nline3\n");
    });

    it("handles empty strings", () => {
      expect(normalizeLineEndings("")).toBe("");
    });

    it("handles strings without line endings", () => {
      expect(normalizeLineEndings("hello world")).toBe("hello world");
    });

    it("handles multiple consecutive CRLF", () => {
      expect(normalizeLineEndings("\r\n\r\n\r\n")).toBe("\n\n\n");
    });

    it("handles CR only (not converted)", () => {
      // Only CRLF is converted, not standalone CR
      expect(normalizeLineEndings("hello\rworld")).toBe("hello\rworld");
    });

    it("handles strings with only line endings", () => {
      expect(normalizeLineEndings("\r\n")).toBe("\n");
      expect(normalizeLineEndings("\n")).toBe("\n");
    });
  });

  describe("formatSize", () => {
    describe("bytes (B)", () => {
      it("formats 0 bytes", () => {
        expect(formatSize(0)).toBe("0 B");
      });

      it("formats small byte values", () => {
        expect(formatSize(1)).toBe("1 B");
        expect(formatSize(512)).toBe("512 B");
        expect(formatSize(1023)).toBe("1023 B");
      });
    });

    describe("kilobytes (KB)", () => {
      it("formats exact kilobytes", () => {
        expect(formatSize(1024)).toBe("1.00 KB");
        expect(formatSize(2048)).toBe("2.00 KB");
      });

      it("formats fractional kilobytes", () => {
        expect(formatSize(1536)).toBe("1.50 KB");
        expect(formatSize(1792)).toBe("1.75 KB");
      });

      it("formats upper range kilobytes", () => {
        expect(formatSize(1023 * 1024)).toBe("1023.00 KB");
      });
    });

    describe("megabytes (MB)", () => {
      it("formats exact megabytes", () => {
        expect(formatSize(1024 * 1024)).toBe("1.00 MB");
        expect(formatSize(10 * 1024 * 1024)).toBe("10.00 MB");
      });

      it("formats fractional megabytes", () => {
        expect(formatSize(1.5 * 1024 * 1024)).toBe("1.50 MB");
        expect(formatSize(100.25 * 1024 * 1024)).toBe("100.25 MB");
      });
    });

    describe("gigabytes (GB)", () => {
      it("formats exact gigabytes", () => {
        expect(formatSize(1024 * 1024 * 1024)).toBe("1.00 GB");
        expect(formatSize(5 * 1024 * 1024 * 1024)).toBe("5.00 GB");
      });

      it("formats fractional gigabytes", () => {
        expect(formatSize(1.5 * 1024 * 1024 * 1024)).toBe("1.50 GB");
      });
    });

    describe("terabytes (TB)", () => {
      it("formats exact terabytes", () => {
        expect(formatSize(1024 * 1024 * 1024 * 1024)).toBe("1.00 TB");
      });

      it("formats fractional terabytes", () => {
        expect(formatSize(2.5 * 1024 * 1024 * 1024 * 1024)).toBe("2.50 TB");
      });
    });

    describe("edge cases", () => {
      it("handles very large values", () => {
        // 500 TB is within the supported range
        const result = formatSize(500 * 1024 * 1024 * 1024 * 1024);
        expect(result).toContain("TB");
        expect(result).toBe("500.00 TB");
      });

      it("formats with consistent decimal places", () => {
        expect(formatSize(1024)).toBe("1.00 KB");
        expect(formatSize(1024 * 1024)).toBe("1.00 MB");
        expect(formatSize(1024 * 1024 * 1024)).toBe("1.00 GB");
      });
    });
  });

  describe("escapeRegex", () => {
    describe("special characters", () => {
      it("escapes dot", () => {
        expect(escapeRegex(".")).toBe("\\.");
        expect(escapeRegex("a.b")).toBe("a\\.b");
      });

      it("escapes asterisk", () => {
        expect(escapeRegex("*")).toBe("\\*");
        expect(escapeRegex("a*b")).toBe("a\\*b");
      });

      it("escapes plus", () => {
        expect(escapeRegex("+")).toBe("\\+");
        expect(escapeRegex("a+b")).toBe("a\\+b");
      });

      it("escapes question mark", () => {
        expect(escapeRegex("?")).toBe("\\?");
        expect(escapeRegex("a?b")).toBe("a\\?b");
      });

      it("escapes caret", () => {
        expect(escapeRegex("^")).toBe("\\^");
        expect(escapeRegex("^test")).toBe("\\^test");
      });

      it("escapes dollar", () => {
        expect(escapeRegex("$")).toBe("\\$");
        expect(escapeRegex("test$")).toBe("test\\$");
      });

      it("escapes curly braces", () => {
        expect(escapeRegex("{")).toBe("\\{");
        expect(escapeRegex("}")).toBe("\\}");
        expect(escapeRegex("{a,b}")).toBe("\\{a,b\\}");
      });

      it("escapes square brackets", () => {
        expect(escapeRegex("[")).toBe("\\[");
        expect(escapeRegex("]")).toBe("\\]");
        expect(escapeRegex("[abc]")).toBe("\\[abc\\]");
      });

      it("escapes parentheses", () => {
        expect(escapeRegex("(")).toBe("\\(");
        expect(escapeRegex(")")).toBe("\\)");
        expect(escapeRegex("(abc)")).toBe("\\(abc\\)");
      });

      it("escapes pipe", () => {
        expect(escapeRegex("|")).toBe("\\|");
        expect(escapeRegex("a|b")).toBe("a\\|b");
      });

      it("escapes backslash", () => {
        expect(escapeRegex("\\")).toBe("\\\\");
        expect(escapeRegex("a\\b")).toBe("a\\\\b");
      });
    });

    describe("real-world strings", () => {
      it("escapes file paths", () => {
        expect(escapeRegex("/path/to/file.ts")).toBe("/path/to/file\\.ts");
        expect(escapeRegex("C:\\Users\\test")).toBe("C:\\\\Users\\\\test");
      });

      it("escapes URL patterns", () => {
        expect(escapeRegex("https://example.com?query=value")).toBe(
          "https://example\\.com\\?query=value"
        );
      });

      it("escapes mathematical expressions", () => {
        expect(escapeRegex("a+b*c")).toBe("a\\+b\\*c");
        expect(escapeRegex("x^2")).toBe("x\\^2");
        expect(escapeRegex("$100")).toBe("\\$100");
      });

      it("escapes version strings", () => {
        expect(escapeRegex("v1.2.3")).toBe("v1\\.2\\.3");
        expect(escapeRegex("^1.0.0")).toBe("\\^1\\.0\\.0");
      });

      it("escapes JSON-like strings", () => {
        expect(escapeRegex('{"key": "value"}')).toBe('\\{"key": "value"\\}');
      });
    });

    describe("edge cases", () => {
      it("handles empty string", () => {
        expect(escapeRegex("")).toBe("");
      });

      it("handles string with no special characters", () => {
        expect(escapeRegex("hello")).toBe("hello");
        expect(escapeRegex("test123")).toBe("test123");
      });

      it("handles multiple consecutive special characters", () => {
        expect(escapeRegex("...")).toBe("\\.\\.\\.");
        expect(escapeRegex("***")).toBe("\\*\\*\\*");
        expect(escapeRegex("[]{}()")).toBe("\\[\\]\\{\\}\\(\\)");
      });

      it("preserves non-special characters", () => {
        expect(escapeRegex("hello world 123")).toBe("hello world 123");
        expect(escapeRegex("café")).toBe("café");
        expect(escapeRegex("日本語")).toBe("日本語");
      });
    });

    describe("integration with RegExp", () => {
      it("produces valid regex patterns", () => {
        const testCases = [
          "file.ts",
          "path/to/file",
          "[test]",
          "(test)",
          "{test}",
          "a+b",
          "a*b",
          "a?b",
          "^test$",
          "a|b",
          "test\\path",
        ];

        for (const testCase of testCases) {
          const escaped = escapeRegex(testCase);
          expect(() => new RegExp(escaped)).not.toThrow();

          // The escaped pattern should match the original string literally
          const regex = new RegExp(escaped);
          expect(regex.test(testCase)).toBe(true);
        }
      });

      it("creates patterns that match literally", () => {
        const special = "test.*+?^${}()|[]\\";
        const escaped = escapeRegex(special);
        const regex = new RegExp(escaped);

        expect(regex.test(special)).toBe(true);
        expect(regex.test("testXX")).toBe(false);
      });
    });
  });
});
