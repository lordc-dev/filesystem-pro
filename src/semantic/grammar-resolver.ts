import fs from "fs/promises";
import fsSync from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import type { SupportedLanguage } from "../constants.js";
import { EXTENSION_LANGUAGE_MAP } from "../constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _UNIQUE_LANGS = [...new Set(Object.values(EXTENSION_LANGUAGE_MAP))];
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = _UNIQUE_LANGS;

export const GRAMMAR_FILES: Record<SupportedLanguage, string> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  jsx: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  rust: "tree-sitter-rust.wasm",
  go: "tree-sitter-go.wasm",
  java: "tree-sitter-java.wasm",
  c: "tree-sitter-c.wasm",
  cpp: "tree-sitter-cpp.wasm",
  kotlin: "tree-sitter-kotlin.wasm",
  bash: "tree-sitter-bash.wasm",
  c_sharp: "tree-sitter-c_sharp.wasm",
  ruby: "tree-sitter-ruby.wasm",
  php: "tree-sitter-php.wasm",
  html: "tree-sitter-html.wasm",
  css: "tree-sitter-css.wasm",
  scala: "tree-sitter-scala.wasm",
  swift: "tree-sitter-swift.wasm",
};

const GRAMMAR_PACKAGES: Record<SupportedLanguage, string> = {
  typescript: "tree-sitter-typescript",
  javascript: "tree-sitter-javascript",
  tsx: "tree-sitter-typescript",
  jsx: "tree-sitter-javascript",
  python: "tree-sitter-python",
  rust: "tree-sitter-rust",
  go: "tree-sitter-go",
  java: "tree-sitter-java",
  c: "tree-sitter-c",
  cpp: "tree-sitter-cpp",
  kotlin: "tree-sitter-kotlin",
  bash: "tree-sitter-bash",
  c_sharp: "tree-sitter-c-sharp",
  ruby: "tree-sitter-ruby",
  php: "tree-sitter-php",
  html: "tree-sitter-html",
  css: "tree-sitter-css",
  scala: "tree-sitter-scala",
  swift: "tree-sitter-swift",
};

function resolveGrammarsDir(): string {
  if (process.env["GRAMMARS_DIR"]) {
    return process.env["GRAMMARS_DIR"];
  }

  const execGrammars = path.join(path.dirname(process.execPath), "grammars");
  try {
    fsSync.accessSync(execGrammars);
    return execGrammars;
  } catch {
    // Grammar directory not accessible at exec path
  }

  return path.join(__dirname, "..", "grammars");
}

export class GrammarResolver {
  private readonly wasmDir: string;

  constructor(wasmDir?: string) {
    this.wasmDir = wasmDir ?? resolveGrammarsDir();
  }

  getGrammarFile(language: SupportedLanguage): string {
    return GRAMMAR_FILES[language];
  }

  getPackageName(language: SupportedLanguage): string {
    return GRAMMAR_PACKAGES[language];
  }

  getWasmPath(language: SupportedLanguage): string {
    return path.join(this.wasmDir, GRAMMAR_FILES[language]);
  }

  async ensureGrammarExists(language: SupportedLanguage): Promise<string> {
    const wasmPath = this.getWasmPath(language);

    try {
      await fs.access(wasmPath);
      return wasmPath;
    } catch {
      const sourcePath = await this.findInNodeModules(language);
      if (sourcePath) {
        await fs.mkdir(this.wasmDir, { recursive: true });
        await fs.copyFile(sourcePath, wasmPath);
        return wasmPath;
      }

      throw new Error(
        `Grammar WASM file not found for ${language}. ` +
        `Set GRAMMARS_DIR env var, install: npm install ${GRAMMAR_PACKAGES[language]} ` +
        `or place ${GRAMMAR_FILES[language]} in ${this.wasmDir}`
      );
    }
  }

  private async findInNodeModules(language: SupportedLanguage): Promise<string | null> {
    const packageName = GRAMMAR_PACKAGES[language];
    const grammarFile = GRAMMAR_FILES[language];

    const candidates = this.buildCandidatePaths(packageName, grammarFile, language);

    for (const p of candidates) {
      try {
        await fs.access(p);
        return p;
      } catch {
        continue;
      }
    }

    if (packageName === "tree-sitter-wasms") {
      const pnpmPath = await this.findInPnpm(grammarFile);
      if (pnpmPath) return pnpmPath;
    }

    return null;
  }

  private buildCandidatePaths(
    packageName: string,
    grammarFile: string,
    language: SupportedLanguage,
  ): string[] {
    const base = path.join(__dirname, "..", "node_modules", packageName);
    const paths = [
      path.join(base, grammarFile),
      path.join(base, "wasm", grammarFile),
      path.join(base, "prebuilt", grammarFile),
    ];

    if (language === "tsx") {
      paths.push(path.join(base, "tsx", grammarFile));
    }
    if (language === "typescript") {
      paths.push(path.join(base, "typescript", grammarFile));
    }
    if (packageName === "tree-sitter-wasms") {
      paths.push(path.join(base, "out", grammarFile));
    }

    return paths;
  }

  private async findInPnpm(grammarFile: string): Promise<string | null> {
    const pnpmDir = path.join(__dirname, "..", "node_modules", ".pnpm");
    const entries = await fs.readdir(pnpmDir).catch(() => [] as string[]);

    for (const dir of entries) {
      if (dir.startsWith("tree-sitter-wasms")) {
        const candidate = path.join(
          pnpmDir, dir, "node_modules", "tree-sitter-wasms", "out", grammarFile,
        );
        try {
          await fs.access(candidate);
          return candidate;
        } catch {
          continue;
        }
      }
    }

    return null;
  }
}