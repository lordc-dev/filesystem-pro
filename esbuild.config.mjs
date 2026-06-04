import { build } from "esbuild";
import { cpSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DIST = join(ROOT, "dist");

const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

const GRAMMAR_SOURCES = [
  { pkg: "tree-sitter-bash", files: ["tree-sitter-bash.wasm"] },
  { pkg: "tree-sitter-c", files: ["tree-sitter-c.wasm"] },
  { pkg: "tree-sitter-c-sharp", files: ["tree-sitter-c_sharp.wasm"] },
  { pkg: "tree-sitter-cpp", files: ["tree-sitter-cpp.wasm"] },
  { pkg: "tree-sitter-css", files: ["tree-sitter-css.wasm"] },
  { pkg: "tree-sitter-go", files: ["tree-sitter-go.wasm"] },
  { pkg: "tree-sitter-html", files: ["tree-sitter-html.wasm"] },
  { pkg: "tree-sitter-java", files: ["tree-sitter-java.wasm"] },
  { pkg: "tree-sitter-javascript", files: ["tree-sitter-javascript.wasm"] },
  { pkg: "tree-sitter-kotlin", files: ["tree-sitter-kotlin.wasm"] },
  { pkg: "tree-sitter-php", files: ["tree-sitter-php.wasm"] },
  { pkg: "tree-sitter-python", files: ["tree-sitter-python.wasm"] },
  { pkg: "tree-sitter-ruby", files: ["tree-sitter-ruby.wasm"] },
  { pkg: "tree-sitter-rust", files: ["tree-sitter-rust.wasm"] },
  { pkg: "tree-sitter-scala", files: ["tree-sitter-scala.wasm"] },
  { pkg: "tree-sitter-swift", files: ["tree-sitter-swift.wasm"] },
  { pkg: "tree-sitter-typescript", files: ["tree-sitter-typescript.wasm", "tree-sitter-tsx.wasm"] },
];

const PACKAGES_NEEDING_WASM_BUILD = ["tree-sitter-kotlin", "tree-sitter-swift"];

function buildWasmPlugin() {
  return {
    name: "build-wasm",
    setup(build) {
      build.onStart(() => {
        for (const pkg of PACKAGES_NEEDING_WASM_BUILD) {
          const pkgDir = join(ROOT, "node_modules", pkg);
          const expected = join(pkgDir, `${pkg}.wasm`);
          if (!existsSync(expected)) {
            console.log(`[build-wasm] Building WASM for ${pkg}...`);
            try {
              execSync("tree-sitter build --wasm .", { cwd: pkgDir, stdio: "pipe" });
              console.log(`[build-wasm] ✅ ${pkg}.wasm built`);
            } catch (e) {
              console.warn(`[build-wasm] ⚠️ Failed to build ${pkg}.wasm: ${e.message}`);
              console.warn(`[build-wasm]    Ensure 'tree-sitter' CLI is installed (cargo install tree-sitter-cli)`);
            }
          }
        }
      });
    },
  };
}

function copyGrammarsPlugin() {
  return {
    name: "copy-grammars",
    setup(build) {
      build.onEnd(() => {
        const grammarsDir = join(DIST, "grammars");
        mkdirSync(grammarsDir, { recursive: true });
        let copied = 0;
        let missing = 0;

        for (const { pkg, files } of GRAMMAR_SOURCES) {
          for (const file of files) {
            const src = join(ROOT, "node_modules", pkg, file);
            if (existsSync(src)) {
              cpSync(src, join(grammarsDir, file));
              copied++;
            } else {
              console.warn(`[copy-grammars] WARN: ${file} not found in ${pkg}`);
              missing++;
            }
          }
        }

        console.log(`[copy-grammars] Copied ${copied} WASM grammar files to ${grammarsDir}` + (missing ? `, ${missing} missing` : ""));
      });
    },
  };
}

await build({
  entryPoints: [join(ROOT, "src", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: join(DIST, "index.js"),

  define: {
    __SERVER_VERSION__: JSON.stringify(version),
  },
  external: [
    "chokidar",
    "web-tree-sitter",
    "zod",
    "@modelcontextprotocol/sdk",
  ],
  plugins: [buildWasmPlugin(), copyGrammarsPlugin()],
  logLevel: "info",
});
