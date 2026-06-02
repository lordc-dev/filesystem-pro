import { describe, it, expect } from "vitest";
import { RipgrepArgsBuilder, rgArgs, parseRipgrepLines } from "../src/search/ripgrep-args.js";

describe("RipgrepArgsBuilder", () => {
  it("starts with empty args", () => {
    expect(new RipgrepArgsBuilder().build()).toEqual([]);
  });

  it("files() adds --files", () => {
    expect(rgArgs().files().build()).toEqual(["--files"]);
  });

  it("json() adds json output flags", () => {
    expect(rgArgs().json().build()).toEqual(["--json", "--no-heading", "--line-number"]);
  });

  it("noMessages() adds --no-messages", () => {
    expect(rgArgs().noMessages().build()).toEqual(["--no-messages"]);
  });

  it("hidden() adds --hidden", () => {
    expect(rgArgs().hidden().build()).toEqual(["--hidden"]);
  });

  describe("ignoreCase()", () => {
    it("adds --ignore-case when enabled (default)", () => {
      expect(rgArgs().ignoreCase().build()).toEqual(["--ignore-case"]);
    });

    it("skips flag when disabled", () => {
      expect(rgArgs().ignoreCase(false).build()).toEqual([]);
    });
  });

  it("context() adds -C with line count", () => {
    expect(rgArgs().context(3).build()).toEqual(["-C", "3"]);
  });

  it("context() skips when lines <= 0", () => {
    expect(rgArgs().context(0).build()).toEqual([]);
  });

  it("maxDepth() adds --max-depth", () => {
    expect(rgArgs().maxDepth(5).build()).toEqual(["--max-depth", "5"]);
  });

  it("maxCount() adds --max-count when > 0", () => {
    expect(rgArgs().maxCount(10).build()).toEqual(["--max-count", "10"]);
  });

  it("maxCount() skips when count <= 0", () => {
    expect(rgArgs().maxCount(0).build()).toEqual([]);
  });

  it("count() adds --count", () => {
    expect(rgArgs().count().build()).toEqual(["--count"]);
  });

  describe("follow()", () => {
    it("adds --follow when enabled (default)", () => {
      expect(rgArgs().follow().build()).toEqual(["--follow"]);
    });

    it("skips flag when disabled", () => {
      expect(rgArgs().follow(false).build()).toEqual([]);
    });
  });

  it("fileType() adds --type", () => {
    expect(rgArgs().fileType("ts").build()).toEqual(["--type", "ts"]);
  });

  it("fileType() skips empty string", () => {
    expect(rgArgs().fileType("").build()).toEqual([]);
  });

  it("exclude() adds negated glob patterns", () => {
    expect(rgArgs().exclude(["node_modules", "dist"]).build()).toEqual([
      "--glob", "!node_modules", "--glob", "!dist",
    ]);
  });

  it("exclude() with empty array adds nothing", () => {
    expect(rgArgs().exclude([]).build()).toEqual([]);
  });

  it("glob() adds glob pattern for string", () => {
    expect(rgArgs().glob("*.ts").build()).toEqual(["--glob", "*.ts"]);
  });

  it("glob() adds glob patterns for array", () => {
    expect(rgArgs().glob(["*.ts", "*.js"]).build()).toEqual([
      "--glob", "*.ts", "--glob", "*.js",
    ]);
  });

  it("pattern() adds search pattern", () => {
    expect(rgArgs().pattern("TODO").build()).toEqual(["TODO"]);
  });

  it("path() adds search path", () => {
    expect(rgArgs().path("/src").build()).toEqual(["/src"]);
  });

  it("fluent chaining combines multiple args", () => {
    const args = rgArgs()
      .json()
      .ignoreCase()
      .maxCount(50)
      .exclude(["node_modules"])
      .pattern("function")
      .path("/project")
      .build();

    expect(args).toEqual([
      "--json", "--no-heading", "--line-number",
      "--ignore-case",
      "--max-count", "50",
      "--glob", "!node_modules",
      "function",
      "/project",
    ]);
  });

  it("build() returns a copy (not reference)", () => {
    const builder = rgArgs().files();
    const args1 = builder.build();
    const args2 = builder.build();
    expect(args1).not.toBe(args2);
    expect(args1).toEqual(args2);
  });
});

describe("parseRipgrepLines", () => {
  it("splits lines and filters empty", () => {
    expect(parseRipgrepLines("a\n\nb\nc\n")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(parseRipgrepLines("  \n  \n")).toEqual([]);
  });

  it("handles empty string", () => {
    expect(parseRipgrepLines("")).toEqual([]);
  });
});