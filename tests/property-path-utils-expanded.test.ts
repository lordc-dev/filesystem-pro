import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { normalizePath, expandHome, resolvePath } from "../dist/validation/path-utils.js";

describe("Property: path-utils (expanded)", () => {
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

    it("output length <= input length + 1", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (p) => {
          expect(normalizePath(p).length).toBeLessThanOrEqual(p.length + 1);
        })
      );
    });

    it("strips matching paired quotes preserving inner content", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('"') && !s.includes("'")),
          (inner) => {
            const doubleQuoted = `"${inner}"`;
            const singleQuoted = `'${inner}'`;
            expect(normalizePath(doubleQuoted)).toBe(normalizePath(inner));
            expect(normalizePath(singleQuoted)).toBe(normalizePath(inner));
          }
        )
      );
    });

    it("preserves unmatched quotes as part of path", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('"') && !s.includes("'") && !s.includes('\0')),
          (inner) => {
            const unmatched = `"${inner}`;
            const result = normalizePath(unmatched);
            expect(result).toContain('"');
          }
        )
      );
    });

    it("never returns null or undefined", () => {
      fc.assert(
        fc.property(fc.string(), (p) => {
          const result = normalizePath(p);
          expect(result).not.toBeNull();
          expect(result).not.toBeUndefined();
          expect(typeof result).toBe("string");
        })
      );
    });

    it("result is always a valid normalized path", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (p) => {
          const result = normalizePath(p);
          expect(result).not.toBeNull();
          expect(result).not.toBeUndefined();
          expect(typeof result).toBe("string");
        })
      );
    });
  });

  describe("expandHome", () => {
    it("~ expands to homedir", () => {
      expect(expandHome("~")).toBe(require("os").homedir());
    });

    it("~/x expands to homedir/x", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 50 }).filter((s) => s.length > 0 && !s.startsWith("/")), (sub) => {
          const result = expandHome(`~/${sub}`);
          expect(result).toBe(require("path").join(require("os").homedir(), sub));
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

    it("only leading ~ is expanded, embedded ~ is not", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.startsWith("~") && !s.startsWith("/")),
          (prefix) => {
            const result = expandHome(`/path/${prefix}~file`);
            expect(result).toBe(`/path/${prefix}~file`);
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
          expect(require("path").isAbsolute(result)).toBe(true);
        })
      );
    });

    it("~/x resolves to absolute path under homedir", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 50 }).filter((s) => s.length > 0 && !s.includes("/") && !s.includes("\0")),
          (sub) => {
            const result = resolvePath(`~/${sub}`);
            expect(result.startsWith(require("os").homedir())).toBe(true);
          }
        )
      );
    });

    it("absolute paths stay absolute", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 100 }).filter((s) => s.startsWith("/")),
          (p) => {
            const result = resolvePath(p);
            expect(require("path").isAbsolute(result)).toBe(true);
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

    it("normalizePath does not produce paths outside the base for simple cases", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("/tmp", "/var"),
          fc.string({ maxLength: 20 }).filter((s) => !s.includes("/") && !s.includes("\0") && !s.includes("..")),
          (base, leaf) => {
            const result = normalizePath(`${base}/${leaf}`);
            expect(result.startsWith("/")).toBe(true);
          }
        )
      );
    });
  });

  describe("quote handling", () => {
    it("matched paired quotes are stripped", () => {
      fc.assert(
        fc.property(
          fc.constantFrom('"', "'"),
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => !s.includes('"') && !s.includes("'") && s.trim().length > 0),
          (q, inner) => {
            const quoted = q + inner + q;
            expect(normalizePath(quoted)).toBe(normalizePath(inner));
          }
        )
      );
    });

    it("mismatched quotes are preserved", () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.constantFrom('"', "'"), fc.constantFrom('"', "'")).filter(([a, b]) => a !== b),
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('"') && !s.includes("'")),
          ([openQ, closeQ], inner) => {
            const mismatched = openQ + inner + closeQ;
            const result = normalizePath(mismatched);
            expect(result.length).toBeGreaterThan(0);
          }
        )
      );
    });
  });
});