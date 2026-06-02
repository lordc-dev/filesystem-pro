/**
 * Constants Tests
 *
 * Tests for shared constants and utilities.
 */

import { describe, it, expect } from "vitest";
import {
  FILE_ENCODING,
  DEFAULT_EXCLUDE_DIRS,
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_REFERENCE_EXCLUDE_PATTERNS,
  SUPPORTED_FILE_PATTERNS,
  isSupportedExtension,
  createCacheStats,
  DEFAULT_DIFF_CONTEXT_LINES,
  DEFAULT_MAX_SEARCH_RESULTS,
  ERROR_MESSAGES,
  getCacheTTL,
  getCacheSize,
  isCacheDisabled,
  isDebugMode,
} from "../src/constants.js";

describe("Constants", () => {
  describe("FILE_ENCODING", () => {
    it("is utf-8", () => {
      expect(FILE_ENCODING).toBe("utf-8");
    });
  });

  describe("DEFAULT_EXCLUDE_DIRS", () => {
    it("includes common directories to exclude", () => {
      expect(DEFAULT_EXCLUDE_DIRS).toContain("node_modules");
      expect(DEFAULT_EXCLUDE_DIRS).toContain("dist");
      expect(DEFAULT_EXCLUDE_DIRS).toContain("build");
      expect(DEFAULT_EXCLUDE_DIRS).toContain(".git");
      expect(DEFAULT_EXCLUDE_DIRS).toContain("coverage");
    });

    it("includes framework-specific directories", () => {
      expect(DEFAULT_EXCLUDE_DIRS).toContain(".next");
      expect(DEFAULT_EXCLUDE_DIRS).toContain(".nuxt");
    });

    it("includes Python directories", () => {
      expect(DEFAULT_EXCLUDE_DIRS).toContain("__pycache__");
      expect(DEFAULT_EXCLUDE_DIRS).toContain(".pytest_cache");
      expect(DEFAULT_EXCLUDE_DIRS).toContain("venv");
      expect(DEFAULT_EXCLUDE_DIRS).toContain(".venv");
    });

    it("is a readonly tuple type", () => {
      // TypeScript enforces readonly at compile time via 'as const'
      // The array itself may not be frozen at runtime
      expect(Array.isArray(DEFAULT_EXCLUDE_DIRS)).toBe(true);
      expect(DEFAULT_EXCLUDE_DIRS.length).toBeGreaterThan(0);
    });
  });

  describe("DEFAULT_EXCLUDE_DIRS spread", () => {
    it("can be spread into mutable array", () => {
      const mutable = [...DEFAULT_EXCLUDE_DIRS];
      expect(mutable).toEqual([...DEFAULT_EXCLUDE_DIRS]);
    });
  });

  describe("DEFAULT_EXCLUDE_PATTERNS", () => {
    it("generates glob patterns from exclude dirs", () => {
      for (const dir of DEFAULT_EXCLUDE_DIRS) {
        expect(DEFAULT_EXCLUDE_PATTERNS).toContain(`**/${dir}/**`);
      }
    });

    it("has same length as exclude dirs", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS.length).toBe(DEFAULT_EXCLUDE_DIRS.length);
    });
  });

  describe("DEFAULT_REFERENCE_EXCLUDE_PATTERNS", () => {
    it("includes essential patterns", () => {
      expect(DEFAULT_REFERENCE_EXCLUDE_PATTERNS).toContain("**/node_modules/**");
      expect(DEFAULT_REFERENCE_EXCLUDE_PATTERNS).toContain("**/dist/**");
      expect(DEFAULT_REFERENCE_EXCLUDE_PATTERNS).toContain("**/.git/**");
    });

    it("is a readonly tuple type", () => {
      // TypeScript enforces readonly at compile time via 'as const'
      expect(Array.isArray(DEFAULT_REFERENCE_EXCLUDE_PATTERNS)).toBe(true);
      expect(DEFAULT_REFERENCE_EXCLUDE_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  describe("DEFAULT_REFERENCE_EXCLUDE_PATTERNS spread", () => {
    it("can be spread into mutable array", () => {
      const mutable = [...DEFAULT_REFERENCE_EXCLUDE_PATTERNS];
      expect(mutable).toEqual([...DEFAULT_REFERENCE_EXCLUDE_PATTERNS]);
    });
  });

  describe("SUPPORTED_FILE_PATTERNS", () => {
    it("includes TypeScript patterns", () => {
      expect(SUPPORTED_FILE_PATTERNS).toContain("**/*.ts");
      expect(SUPPORTED_FILE_PATTERNS).toContain("**/*.tsx");
    });

    it("includes JavaScript patterns", () => {
      expect(SUPPORTED_FILE_PATTERNS).toContain("**/*.js");
      expect(SUPPORTED_FILE_PATTERNS).toContain("**/*.jsx");
    });

    it("includes Python patterns", () => {
      expect(SUPPORTED_FILE_PATTERNS).toContain("**/*.py");
    });

    it("all patterns are glob format", () => {
      for (const pattern of SUPPORTED_FILE_PATTERNS) {
        expect(pattern).toMatch(/^\*\*\/\*\.\w+$/);
      }
    });
  });

  describe("isSupportedExtension", () => {
    it("returns true for supported extensions", () => {
      expect(isSupportedExtension(".ts")).toBe(true);
      expect(isSupportedExtension(".tsx")).toBe(true);
      expect(isSupportedExtension(".js")).toBe(true);
      expect(isSupportedExtension(".jsx")).toBe(true);
      expect(isSupportedExtension(".py")).toBe(true);
    });

    it("returns false for unsupported extensions", () => {
      expect(isSupportedExtension(".txt")).toBe(false);
      expect(isSupportedExtension(".md")).toBe(false);
      expect(isSupportedExtension(".json")).toBe(false);
      expect(isSupportedExtension(".css")).toBe(false);
      expect(isSupportedExtension(".html")).toBe(false);
    });

    it("returns false for invalid inputs", () => {
      expect(isSupportedExtension("")).toBe(false);
      expect(isSupportedExtension("ts")).toBe(false); // Missing dot
    });
  });

  describe("createCacheStats", () => {
    it("creates stats with computed hit rate", () => {
      const stats = createCacheStats(10, 80, 20);
      expect(stats.size).toBe(10);
      expect(stats.hits).toBe(80);
      expect(stats.misses).toBe(20);
      expect(stats.hitRate).toBe(0.8);
    });

    it("handles zero hits and misses", () => {
      const stats = createCacheStats(0, 0, 0);
      expect(stats.hitRate).toBe(0);
    });

    it("handles all hits", () => {
      const stats = createCacheStats(5, 100, 0);
      expect(stats.hitRate).toBe(1);
    });

    it("handles all misses", () => {
      const stats = createCacheStats(5, 0, 100);
      expect(stats.hitRate).toBe(0);
    });

    it("includes optional maxSize", () => {
      const stats = createCacheStats(10, 50, 50, 100);
      expect(stats.maxSize).toBe(100);
    });

    it("excludes maxSize when not provided", () => {
      const stats = createCacheStats(10, 50, 50);
      expect(stats.maxSize).toBeUndefined();
    });

    it("computes correct hit rates", () => {
      expect(createCacheStats(0, 75, 25).hitRate).toBe(0.75);
      expect(createCacheStats(0, 50, 50).hitRate).toBe(0.5);
      expect(createCacheStats(0, 25, 75).hitRate).toBe(0.25);
      expect(createCacheStats(0, 1, 9).hitRate).toBe(0.1);
    });
  });

  describe("DEFAULT_DIFF_CONTEXT_LINES", () => {
    it("is 3", () => {
      expect(DEFAULT_DIFF_CONTEXT_LINES).toBe(3);
    });
  });

  describe("DEFAULT_MAX_SEARCH_RESULTS", () => {
    it("is 100", () => {
      expect(DEFAULT_MAX_SEARCH_RESULTS).toBe(100);
    });
  });

  describe("ERROR_MESSAGES", () => {
    describe("semantic analysis errors", () => {
      it("unsupportedFileType includes path", () => {
        const message = ERROR_MESSAGES.unsupportedFileType("/path/to/file.xyz");
        expect(message).toContain("Unsupported file type");
        expect(message).toContain("/path/to/file.xyz");
      });

      it("symbolNotFound includes symbol name", () => {
        const message = ERROR_MESSAGES.symbolNotFound("MyClass");
        expect(message).toContain("Symbol not found");
        expect(message).toContain("MyClass");
      });

      it("templateNotFound includes path", () => {
        const message = ERROR_MESSAGES.templateNotFound("template.md");
        expect(message).toContain("Template not found");
        expect(message).toContain("template.md");
      });

      it("parseError returns consistent message", () => {
        const message = ERROR_MESSAGES.parseError();
        expect(message).toContain("Failed to parse");
      });

      it("notInitialized returns consistent message", () => {
        const message = ERROR_MESSAGES.notInitialized();
        expect(message).toContain("not initialized");
        expect(message).toContain("initialize()");
      });

      it("noLanguageConfig includes language", () => {
        const message = ERROR_MESSAGES.noLanguageConfig("rust");
        expect(message).toContain("No configuration");
        expect(message).toContain("rust");
      });

      it("treeSitterInitFailed includes error", () => {
        const message = ERROR_MESSAGES.treeSitterInitFailed("WASM error");
        expect(message).toContain("Failed to initialize");
        expect(message).toContain("WASM error");
      });

      it("languageLoadFailed includes language and error", () => {
        const message = ERROR_MESSAGES.languageLoadFailed("python", "Not found");
        expect(message).toContain("Failed to load");
        expect(message).toContain("python");
        expect(message).toContain("Not found");
      });
    });

    describe("file system errors", () => {
      it("parentDirNotExist includes directory", () => {
        const message = ERROR_MESSAGES.parentDirNotExist("/path/to/parent");
        expect(message).toContain("Parent directory");
        expect(message).toContain("/path/to/parent");
      });

      it("cannotDeleteDirWithDeleteFile includes path and suggestion", () => {
        const message = ERROR_MESSAGES.cannotDeleteDirWithDeleteFile("/path/to/dir");
        expect(message).toContain("Cannot delete directory");
        expect(message).toContain("delete_directory");
        expect(message).toContain("/path/to/dir");
      });

      it("cannotDeleteFileWithDeleteDir includes path and suggestion", () => {
        const message = ERROR_MESSAGES.cannotDeleteFileWithDeleteDir("/path/to/file");
        expect(message).toContain("Cannot delete file");
        expect(message).toContain("delete_file");
        expect(message).toContain("/path/to/file");
      });

      it("watcherNotFound includes watcher ID", () => {
        const message = ERROR_MESSAGES.watcherNotFound("watcher-123");
        expect(message).toContain("No watcher found");
        expect(message).toContain("watcher-123");
      });

      it("watcherAlreadyExists includes watcher ID", () => {
        const message = ERROR_MESSAGES.watcherAlreadyExists("watcher-456");
        expect(message).toContain("already exists");
        expect(message).toContain("watcher-456");
      });
    });

    describe("edit/diff errors", () => {
      it("editMatchNotFound includes the text searched for", () => {
        const message = ERROR_MESSAGES.editMatchNotFound("const x = 1;");
        expect(message).toContain("Could not find");
        expect(message).toContain("const x = 1;");
      });

      it("unknownDiffFormat includes format name", () => {
        const message = ERROR_MESSAGES.unknownDiffFormat("custom");
        expect(message).toContain("Unknown diff format");
        expect(message).toContain("custom");
      });

      it("invalidRegexPattern includes pattern", () => {
        const message = ERROR_MESSAGES.invalidRegexPattern("(unclosed");
        expect(message).toContain("Invalid regex");
        expect(message).toContain("(unclosed");
      });
    });

    describe("error message consistency", () => {
      it("all error factories return strings", () => {
        const errorFactories = [
          () => ERROR_MESSAGES.unsupportedFileType("test"),
          () => ERROR_MESSAGES.symbolNotFound("test"),
          () => ERROR_MESSAGES.templateNotFound("test"),
          () => ERROR_MESSAGES.parseError(),
          () => ERROR_MESSAGES.notInitialized(),
          () => ERROR_MESSAGES.noLanguageConfig("test"),
          () => ERROR_MESSAGES.treeSitterInitFailed("test"),
          () => ERROR_MESSAGES.languageLoadFailed("test", "error"),
          () => ERROR_MESSAGES.parentDirNotExist("test"),
          () => ERROR_MESSAGES.cannotDeleteDirWithDeleteFile("test"),
          () => ERROR_MESSAGES.cannotDeleteFileWithDeleteDir("test"),
          () => ERROR_MESSAGES.watcherNotFound("test"),
          () => ERROR_MESSAGES.watcherAlreadyExists("test"),
          () => ERROR_MESSAGES.editMatchNotFound("test"),
          () => ERROR_MESSAGES.unknownDiffFormat("test"),
          () => ERROR_MESSAGES.invalidRegexPattern("test"),
        ];

        for (const factory of errorFactories) {
          const message = factory();
          expect(typeof message).toBe("string");
          expect(message.length).toBeGreaterThan(0);
        }
      });
    });
  });
});

describe("Config getters", () => {
  it("getCacheTTL returns live config values", () => {
    const ttl = getCacheTTL();
    expect(typeof ttl.SYMBOL_CACHE_MS).toBe("number");
    expect(typeof ttl.AST_CACHE_MS).toBe("number");
    expect(typeof ttl.PROMPT_CACHE_MS).toBe("number");
    expect(typeof ttl.PATH_CACHE_MS).toBe("number");
    expect(typeof ttl.TEMPLATES_LIST_MS).toBe("number");
  });

  it("getCacheSize returns live config values", () => {
    const size = getCacheSize();
    expect(typeof size.SYMBOL_CACHE).toBe("number");
    expect(typeof size.AST_CACHE).toBe("number");
    expect(typeof size.PROMPT_CACHE).toBe("number");
  });

  it("isCacheDisabled returns boolean", () => {
    expect(typeof isCacheDisabled()).toBe("boolean");
  });

  it("isDebugMode returns boolean", () => {
    expect(typeof isDebugMode()).toBe("boolean");
  });
});
