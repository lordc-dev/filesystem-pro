import { describe, it, expect } from "vitest";
import {
  BaseError,
  PathValidationError,
  FileNotFoundError,
  DirectoryError,
  TreeSitterError,
  SymbolNotFoundError,
  UndoError,
  EditMatchError,
  WatcherError,
  ConfigError,
  SearchError,
} from "../src/errors/index.js";

describe("BaseError", () => {
  it("preserves name", () => {
    const err = new BaseError("test");
    expect(err.name).toBe("BaseError");
  });

  it("preserves message", () => {
    const err = new BaseError("hello world");
    expect(err.message).toBe("hello world");
  });

  it("captures context", () => {
    const err = new BaseError("ctx", { context: { key: "val" } });
    expect(err.context).toEqual({ key: "val" });
  });

  it("preserves cause chain", () => {
    const cause = new Error("original");
    const err = new BaseError("wrapped", { cause });
    expect(err.cause).toBe(cause);
  });

  it("sets timestamp", () => {
    const err = new BaseError("ts");
    expect(err.timestamp).toBeTruthy();
  });

  it("toJSON serializes correctly", () => {
    const cause = new Error("root");
    const err = new BaseError("serializable", { cause, context: { a: 1 } });
    const json = err.toJSON();
    expect(json.name).toBe("BaseError");
    expect(json.message).toBe("serializable");
    expect(json.context).toEqual({ a: 1 });
    expect(json.cause).toBe("root");
  });
});

describe("Domain errors", () => {
  it("PathValidationError sets context", () => {
    const err = new PathValidationError("/foo", "denied");
    expect(err.name).toBe("PathValidationError");
    expect(err.context).toEqual({ path: "/foo", reason: "denied" });
  });

  it("FileNotFoundError sets context", () => {
    const err = new FileNotFoundError("/missing.txt");
    expect(err.context).toEqual({ path: "/missing.txt" });
  });

  it("DirectoryError sets operation", () => {
    const err = new DirectoryError("/dir", "create");
    expect(err.context).toEqual({ path: "/dir", operation: "create" });
  });

  it("TreeSitterError sets operation in message", () => {
    const err = new TreeSitterError("parse", { context: { lang: "ts" } });
    expect(err.message).toContain("parse");
    expect(err.context).toEqual({ lang: "ts" });
  });

  it("SymbolNotFoundError sets pattern", () => {
    const err = new SymbolNotFoundError("MyClass");
    expect(err.context).toEqual({ pattern: "MyClass" });
  });

  it("EditMatchError truncates long oldText", () => {
    const longText = "x".repeat(200);
    const err = new EditMatchError(longText, "/file.ts");
    expect((err.context as { oldTextSnippet: string }).oldTextSnippet.length).toBe(80);
  });

  it("WatcherError sets watcherId", () => {
    const err = new WatcherError("w1", "start");
    expect(err.context).toEqual({ watcherId: "w1", operation: "start" });
  });

  it("ConfigError sets path", () => {
    const err = new ConfigError("/cfg.json", "invalid");
    expect(err.context).toEqual({ path: "/cfg.json" });
  });

  it("SearchError merges extra context", () => {
    const err = new SearchError("regex", { context: { path: "/a" } });
    expect(err.context).toEqual({ pattern: "regex", path: "/a" });
  });

  it("UndoError sets operation", () => {
    const err = new UndoError("record", { context: { filePath: "/a" } });
    expect(err.context).toEqual({ operation: "record", filePath: "/a" });
  });
});