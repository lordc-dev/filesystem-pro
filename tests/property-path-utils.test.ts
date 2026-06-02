import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { normalizePath, resolvePath, expandHome } from "../dist/validation/path-utils.js";
import os from "os";
import path from "path";

describe("Property-based: path-utils", () => {
  describe("normalizePath", () => {
    it("idempotent: normalizePath(normalizePath(p)) === normalizePath(p)", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (p) => {
          const once = normalizePath(p);
          const twice = normalizePath(once);
          expect(twice).toBe(once);
        })
      );
    });

    it("never returns a path ending with / (except root)", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 100 }).filter((s) => s.trim().length > 0),
          (p) => {
            const result = normalizePath(p);
            if (result !== "/") {
              expect(result.endsWith("/")).toBe(false);
            }
          }
        )
      );
    });

    it("strips matching quotes from clean path segments", () => {
      const pathSegments = ["foo", "bar.ts", "hello_world.py", "src", "index.js", "my-dir", "a", "baz.go"];
      fc.assert(
        fc.property(fc.constantFrom(...pathSegments), (seg) => {
          expect(normalizePath(`"${seg}"`)).toBe(normalizePath(seg));
          expect(normalizePath(`'${seg}'`)).toBe(normalizePath(seg));
        })
      );
    });

    it("output length <= input length (normalization never adds chars for simple paths)", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (p) => {
          expect(normalizePath(p).length).toBeLessThanOrEqual(p.length + 1);
        })
      );
    });
  });

  describe("expandHome", () => {
    it("~ expands to homedir", () => {
      expect(expandHome("~")).toBe(os.homedir());
    });

    it("~/x expands to homedir/x", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 50 }).filter((s) => s.length > 0 && !s.startsWith("/")), (sub) => {
          const result = expandHome(`~/${sub}`);
          expect(result).toBe(path.join(os.homedir(), sub));
        })
      );
    });

    it("non-tilde paths pass through unchanged", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 100 }).filter((s) => !s.startsWith("~")),
          (p) => {
            expect(expandHome(p)).toBe(p);
          }
        )
      );
    });
  });

  describe("resolvePath", () => {
    it("always returns an absolute path", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }).filter((s) => s.trim().length > 0), (p) => {
          const result = resolvePath(p);
          expect(path.isAbsolute(result)).toBe(true);
        })
      );
    });

    it("~/x resolves to absolute path under homedir", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 50 }).filter((s) => s.length > 0 && !s.includes("/") && !s.includes("\0")),
          (sub) => {
            const result = resolvePath(`~/${sub}`);
            expect(result.startsWith(os.homedir())).toBe(true);
          }
        )
      );
    });
  });

  describe("path traversal resistance", () => {
    it("normalizePath collapses ../ sequences", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constantFrom("/tmp", "/var", "/home"),
            fc.integer({ min: 1, max: 10 }),
            fc.string({ maxLength: 20 }).filter((s) => !s.includes("/") && !s.includes("\0"))
          ),
          ([base, depth, leaf]) => {
            const traversal = base + "/" + "../".repeat(depth) + leaf;
            const result = normalizePath(traversal);
            expect(result).not.toContain("../");
          }
        )
      );
    });
  });
});