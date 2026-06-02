import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readValidatedFile, readTextContent, withFileContent } from "../src/file-operations/read-utils.js";
import { createTempTestDir, writeTestFiles, cleanupTempDir } from "./test-helpers.js";

vi.mock("../src/semantic/index.js", () => ({
  getLanguageFromPath: vi.fn((p: string) => {
    if (p.endsWith(".ts") || p.endsWith(".tsx")) return "typescript";
    if (p.endsWith(".js") || p.endsWith(".jsx")) return "javascript";
    if (p.endsWith(".py")) return "python";
    if (p.endsWith(".kt")) return "kotlin";
    return null;
  }),
  isSemanticAvailable: vi.fn(() => true),
}));

describe("read-utils", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await createTempTestDir("read-");
    await writeTestFiles(tempDir, {
      "hello.txt": "line1\nline2\nline3\nline4\nline5\n",
      "empty.txt": "",
      "unicode.txt": "Hello 🌍 World",
    });
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("readValidatedFile", () => {
    it("reads full file content", async () => {
      const { validPath, content } = await readValidatedFile(`${tempDir}/hello.txt`);
      expect(content).toContain("line1");
      expect(content).toContain("line5");
      expect(validPath).toContain("hello.txt");
    });

    it("reads with head option", async () => {
      const { content } = await readValidatedFile(`${tempDir}/hello.txt`, { head: 2 });
      expect(content).toContain("line1");
      expect(content).toContain("line2");
      expect(content).not.toContain("line5");
    });

    it("reads with tail option", async () => {
      const { content } = await readValidatedFile(`${tempDir}/hello.txt`, { tail: 3 });
      expect(content).toContain("line5");
    });

    it("reads empty file", async () => {
      const { content } = await readValidatedFile(`${tempDir}/empty.txt`);
      expect(content).toBe("");
    });

    it("handles unicode content", async () => {
      const { content } = await readValidatedFile(`${tempDir}/unicode.txt`);
      expect(content).toContain("🌍");
    });

    it("throws for invalid head parameter", async () => {
      await expect(readValidatedFile(`${tempDir}/hello.txt`, { head: 0 })).rejects.toThrow(/Invalid.*head/i);
      await expect(readValidatedFile(`${tempDir}/hello.txt`, { head: -1 })).rejects.toThrow(/Invalid.*head/i);
    });

    it("throws for invalid tail parameter", async () => {
      await expect(readValidatedFile(`${tempDir}/hello.txt`, { tail: 0 })).rejects.toThrow(/Invalid.*tail/i);
    });
  });

  describe("readTextContent", () => {
    it("returns string content", async () => {
      const content = await readTextContent(`${tempDir}/hello.txt`);
      expect(typeof content).toBe("string");
      expect(content).toContain("line1");
    });

    it("supports head parameter", async () => {
      const content = await readTextContent(`${tempDir}/hello.txt`, 3);
      expect(content).toContain("line3");
      expect(content).not.toContain("line5");
    });
  });

  describe("withFileContent", () => {
    it("provides validated path, content, and language for TS files", async () => {
      const tsDir = await createTempTestDir("ts-");
      await writeTestFiles(tsDir, { "test.ts": "export const x = 1;" });
      try {
        const result = await withFileContent(`${tsDir}/test.ts`, (vp, content, lang) => {
          return { vp, content, lang };
        });
        expect(result.lang).toBe("typescript");
        expect(result.content).toContain("export const x = 1");
      } finally {
        await cleanupTempDir(tsDir);
      }
    });

    it("throws for unsupported file types", async () => {
      const binDir = await createTempTestDir("bin-");
      await writeTestFiles(binDir, { "test.bin": "binary content" });
      try {
        await expect(withFileContent(`${binDir}/test.bin`, () => Promise.resolve(null))).rejects.toThrow(/unsupported/i);
      } finally {
        await cleanupTempDir(binDir);
      }
    });

    it("throws when semantic module not available", async () => {
      const { isSemanticAvailable } = await import("../src/semantic/index.js");
      vi.mocked(isSemanticAvailable).mockReturnValueOnce(false);
      const tsDir = await createTempTestDir("ts-nosrc-");
      await writeTestFiles(tsDir, { "test.ts": "const x = 1;" });
      try {
        await expect(withFileContent(`${tsDir}/test.ts`, () => Promise.resolve(null))).rejects.toThrow(/not available/i);
      } finally {
        await cleanupTempDir(tsDir);
      }
    });

    it("detects JavaScript language", async () => {
      const jsDir = await createTempTestDir("js-");
      await writeTestFiles(jsDir, { "app.js": "const y = 2;" });
      try {
        const result = await withFileContent(`${jsDir}/app.js`, (vp, content, lang) => {
          return { vp, content, lang };
        });
        expect(result.lang).toBe("javascript");
        expect(result.content).toContain("const y = 2");
      } finally {
        await cleanupTempDir(jsDir);
      }
    });

    it("detects Python language", async () => {
      const pyDir = await createTempTestDir("py-");
      await writeTestFiles(pyDir, { "main.py": "def hello(): pass" });
      try {
        const result = await withFileContent(`${pyDir}/main.py`, (vp, content, lang) => {
          return { vp, content, lang };
        });
        expect(result.lang).toBe("python");
        expect(result.content).toContain("def hello");
      } finally {
        await cleanupTempDir(pyDir);
      }
    });

    it("detects Kotlin language", async () => {
      const ktDir = await createTempTestDir("kt-");
      await writeTestFiles(ktDir, { "Service.kt": "class Service {}" });
      try {
        const result = await withFileContent(`${ktDir}/Service.kt`, (vp, content, lang) => {
          return { vp, content, lang };
        });
        expect(result.lang).toBe("kotlin");
        expect(result.content).toContain("class Service");
      } finally {
        await cleanupTempDir(ktDir);
      }
    });

    it("validates path before reading", async () => {
      await expect(withFileContent("/nonexistent/path/file.ts", () => Promise.resolve(null))).rejects.toThrow();
    });

    it("passes handler return value through", async () => {
      const tsDir = await createTempTestDir("ts-ret-");
      await writeTestFiles(tsDir, { "mod.ts": "export const z = 42;" });
      try {
        const result = await withFileContent(`${tsDir}/mod.ts`, (_vp, _content, _lang) => {
          return { custom: "data", number: 99 };
        });
        expect(result).toEqual({ custom: "data", number: 99 });
      } finally {
        await cleanupTempDir(tsDir);
      }
    });
  });
});