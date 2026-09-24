import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseMode } from "../src/tools/directory-copy.js";

describe("parseMode (property-based)", () => {
  it("octal round-trip: any 3-digit octal parses to its value", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0o777 }), (mode) => {
        const oct = mode.toString(8).padStart(3, "0");
        expect(parseMode(oct, 0o644)).toBe(mode);
        expect(parseMode("0o" + oct, 0o644)).toBe(mode);
      })
    );
  });

  it("symbolic = is absolute: a=rwx sets all bits regardless of current mode", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0o777 }), (cur) => {
        expect(parseMode("a=rwx", cur)).toBe(0o777);
        expect(parseMode("a=", cur)).toBeNull(); // empty perm list rejected by design
      })
    );
  });

  it("symbolic + only adds bits, - only removes bits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0o777 }),
        fc.constantFrom("r", "w", "x", "rw", "rx", "wx", "rwx"),
        (cur, perms) => {
          const bits = (perms.includes("r") ? 4 : 0) | (perms.includes("w") ? 2 : 0) | (perms.includes("x") ? 1 : 0);
          const added = parseMode(`a+${perms}`, cur);
          expect(added).not.toBeNull();
          expect(added! & bits).toBe(bits); // requested bits present in every group
          // per-group check: each of u/g/o has the requested bits
          for (const s of [6, 3, 0]) {
            expect(((added! >> s) & 7) & bits).toBe(bits);
          }
          const removed = parseMode(`a-${perms}`, added!);
          expect(removed! & bits).toBe(0); // requested bits gone everywhere
        }
      )
    );
  });

  it("idempotence: applying u+x twice equals applying it once", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0o777 }), (cur) => {
        const once = parseMode("u+x", cur);
        const twice = parseMode("u+x", once!);
        expect(twice).toBe(once);
      })
    );
  });

  it("invalid modes return null", () => {
    for (const bad of ["rwx", "999", "u", "+", "x+u", "", "u+q", "0o888"]) {
      expect(parseMode(bad, 0o644)).toBeNull();
    }
  });
});