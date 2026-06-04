import { readdir, copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DEST = join(ROOT, "dist", "grammars");

const NATIVE_SOURCES = [
  { pkg: "tree-sitter-javascript", files: ["tree-sitter-javascript.wasm"] },
  { pkg: "tree-sitter-typescript", files: ["tree-sitter-typescript.wasm", "tree-sitter-tsx.wasm"] },
  { pkg: "tree-sitter-python", files: ["tree-sitter-python.wasm"] },
  { pkg: "tree-sitter-go", files: ["tree-sitter-go.wasm"] },
  { pkg: "tree-sitter-rust", files: ["tree-sitter-rust.wasm"] },
  { pkg: "tree-sitter-java", files: ["tree-sitter-java.wasm"] },
  { pkg: "tree-sitter-c", files: ["tree-sitter-c.wasm"] },
  { pkg: "tree-sitter-cpp", files: ["tree-sitter-cpp.wasm"] },
];

const WASMS_DIR = join(ROOT, "node_modules", "tree-sitter-wasms", "out");

const WASMS_ALIAS = {
  "tree-sitter-bash.wasm": "bash",
  "tree-sitter-c_sharp.wasm": "c_sharp",
  "tree-sitter-css.wasm": "css",
  "tree-sitter-html.wasm": "html",
  "tree-sitter-kotlin.wasm": "kotlin",
  "tree-sitter-php.wasm": "php",
  "tree-sitter-ruby.wasm": "ruby",
  "tree-sitter-scala.wasm": "scala",
  "tree-sitter-swift.wasm": "swift",
};

async function findPnpmWasm(pkg) {
  const pnpmDir = join(ROOT, "node_modules", ".pnpm");
  try {
    const entries = await readdir(pnpmDir);
    for (const dir of entries) {
      if (dir.startsWith(pkg.replace(/\//g, "+") + "@") || dir.startsWith(pkg + "@")) {
        const candidate = join(pnpmDir, dir, "node_modules", pkg);
        try {
          const files = await readdir(candidate);
          const wasmFile = files.find((f) => f.endsWith(".wasm"));
          if (wasmFile) return join(candidate, wasmFile);
        } catch {}
      }
    }
  } catch {}
  return null;
}

async function main() {
  await mkdir(DEST, { recursive: true });
  let copied = 0;

  for (const { pkg, files } of NATIVE_SOURCES) {
    for (const file of files) {
      const src = await findPnpmWasm(pkg);
      if (src) {
        const srcFile = join(await findPnpmWasm(pkg).then((d) => join(d, "..")), file);
        try {
          await copyFile(join(ROOT, "node_modules", pkg, file), join(DEST, file));
          copied++;
        } catch {
          const pnpmSrc = await findPnpmWasm(pkg);
          if (pnpmSrc) {
            const pnpmFile = join(pnpmSrc, "..", file);
            try {
              await copyFile(pnpmFile, join(DEST, file));
              copied++;
            } catch {
              console.warn(`[WARN] Could not copy ${file} from ${pkg}`);
            }
          } else {
            console.warn(`[WARN] Could not find ${file} from ${pkg}`);
          }
        }
      } else {
        try {
          await copyFile(join(ROOT, "node_modules", pkg, file), join(DEST, file));
          copied++;
        } catch {
          console.warn(`[WARN] Could not copy ${file} from ${pkg}`);
        }
      }
    }
  }

  try {
    const wasmsFiles = await readdir(WASMS_DIR);
    for (const f of wasmsFiles) {
      if (f.endsWith(".wasm") && f in WASMS_ALIAS) {
        try {
          await copyFile(join(WASMS_DIR, f), join(DEST, f));
          copied++;
        } catch {
          console.warn(`[WARN] Could not copy ${f} from tree-sitter-wasms`);
        }
      }
    }
  } catch {
    console.warn("[WARN] tree-sitter-wasms not found, skipping supplementary grammars");
  }

  console.log(`[copy-grammars] Copied ${copied} WASM grammar files to ${DEST}`);
}

main().catch((e) => {
  console.error("[copy-grammars] Fatal:", e);
  process.exit(1);
});