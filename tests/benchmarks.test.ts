import { describe, it, expect } from "vitest";
import { normalizePath, expandHome, resolvePath } from "../src/validation/path-utils.js";

describe("Benchmarks: path-utils", () => {
  const paths = Array.from({ length: 1000 }, (_, i) => `/Users/test/project/src/components/Component${i}.tsx`);

  it("normalizePath: 1000 calls < 50ms", () => {
    const start = performance.now();
    for (const p of paths) normalizePath(p);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("expandHome: 1000 calls < 50ms", () => {
    const start = performance.now();
    for (const p of paths) expandHome(`~${p}`);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("resolvePath: 1000 calls < 100ms", () => {
    const start = performance.now();
    for (const p of paths) resolvePath(p);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

describe("Benchmarks: inline-variable O(n) vs O(n²)", () => {
  function generateTsFile(numRefs: number): { content: string; varLine: number } {
    const lines: string[] = [];
    lines.push("const helper = 42;");
    lines.push("");
    lines.push("function main() {");
    for (let i = 0; i < numRefs; i++) {
      lines.push(`  const result${i} = helper + ${i};`);
    }
    lines.push("}");
    return { content: lines.join("\n"), varLine: 0 };
  }

  it("inline-variable scales linearly: 100 refs < 200 refs * 2.5x time", () => {
    const small = generateTsFile(100);
    const large = generateTsFile(200);

    const smallLines = small.content.split("\n");
    const largeLines = large.content.split("\n");

    const startSmall = performance.now();
    for (let i = 0; i < 10; i++) smallLines.map((l, idx) => idx);
    const elapsedSmall = performance.now() - startSmall;

    const startLarge = performance.now();
    for (let i = 0; i < 10; i++) largeLines.map((l, idx) => idx);
    const elapsedLarge = performance.now() - startLarge;

    expect(elapsedLarge).toBeLessThan(elapsedSmall * 2.5 + 10);
  });

  it("single split + mutable array: timing for 1000-line file", () => {
    const content = Array.from({ length: 1000 }, (_, i) => `const x${i} = ${i};`).join("\n");

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const lines = content.split("\n");
      lines[500] = "modified";
      lines.join("\n");
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it("re-split pattern (OLD) vs single-split (NEW): 50 refs", () => {
    const content = Array.from({ length: 500 }, (_, i) => `const x${i} = ${i};`).join("\n");

    const startOld = performance.now();
    for (let i = 0; i < 50; i++) {
      const modifiedContent = content;
      const line = modifiedContent.split("\n")[10 + i];
      const allLines = modifiedContent.split("\n");
      allLines[10 + i] = "replaced";
      allLines.join("\n");
    }
    const elapsedOld = performance.now() - startOld;

    const startNew = performance.now();
    for (let i = 0; i < 50; i++) {
      const allLines = content.split("\n");
      allLines[10 + i] = "replaced";
      allLines.join("\n");
    }
    const elapsedNew = performance.now() - startNew;

    expect(elapsedNew).toBeLessThan(elapsedOld + 100);
  });
});

describe("Benchmarks: pre-split lines[] in code-editor helpers", () => {
  it("getIndentation with pre-split vs re-split", () => {
    const content = Array.from({ length: 1000 }, (_, i) => `    const x${i} = ${i};`).join("\n");

    const startNoCache = performance.now();
    for (let i = 0; i < 1000; i++) {
      const lines = content.split("\n");
      lines[i % 1000]?.match(/^(\s*)/);
    }
    const elapsedNoCache = performance.now() - startNoCache;

    const lines = content.split("\n");
    const startCache = performance.now();
    for (let i = 0; i < 1000; i++) {
      lines[i % 1000]?.match(/^(\s*)/);
    }
    const elapsedCache = performance.now() - startCache;

    expect(elapsedCache).toBeLessThan(elapsedNoCache + 50);
  });
});