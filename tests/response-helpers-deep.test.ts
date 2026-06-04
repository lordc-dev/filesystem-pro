import { describe, it, expect } from "vitest";
import {
  textResponse,
  jsonResponse,
  pathSuccessResponse,
  dualPathSuccessResponse,
  searchResultsResponse,
  structuredSearchResponse,
  mediaResponse,
  MEDIA_MIME_TYPES,
  getMediaType,
  watcherStartedResponse,
  watcherStoppedResponse,
  editErrorResponse,
  editDiffResponse,
  diffResponse,
  infoResponse,
  messageResponse,
  errorResponse,
  semanticOperationResponse,
  symbolsOverviewResponse,
  symbolMatchesResponse,
  referencesResponse,
  renameResultResponse,
  formatSymbolForDisplay,
  formatSymbolAsText,
} from "../src/utils/response-helpers.js";

describe("response-helpers", () => {
  it("textResponse returns text with structured", () => {
    const r = textResponse("hello", { extra: true });
    expect(r.content[0]).toEqual({ type: "text", text: "hello" });
    expect(r.structuredContent).toEqual({ content: "hello", extra: true });
  });

  it("jsonResponse serializes data", () => {
    const r = jsonResponse({ key: "val" });
    expect(r.content[0].type).toBe("text");
    expect(r.structuredContent).toEqual({ key: "val" });
  });

  it("pathSuccessResponse", () => {
    const r = pathSuccessResponse("created", "/tmp/f.txt");
    expect(r.content[0].text).toContain("Successfully created");
    expect(r.structuredContent.success).toBe(true);
  });

  it("dualPathSuccessResponse", () => {
    const r = dualPathSuccessResponse("moved", "/a", "/b");
    expect(r.content[0].text).toContain("moved");
    expect(r.structuredContent.source).toBe("/a");
  });

  it("searchResultsResponse with matches", () => {
    const r = searchResultsResponse(["a.ts", "b.ts"]);
    expect(r.structuredContent.count).toBe(2);
  });

  it("searchResultsResponse empty", () => {
    const r = searchResultsResponse([]);
    expect(r.content[0].text).toContain("No matches");
  });

  it("structuredSearchResponse", () => {
    const r = structuredSearchResponse([{ file: "a.ts" }]);
    expect(r.structuredContent.count).toBe(1);
  });

  it("mediaResponse", () => {
    const r = mediaResponse("base64data", "image/png", "image");
    expect(r.structuredContent.mediaType).toBe("image");
  });

  it("MEDIA_MIME_TYPES has common types", () => {
    expect(MEDIA_MIME_TYPES[".png"]).toBe("image/png");
    expect(MEDIA_MIME_TYPES[".mp3"]).toBe("audio/mpeg");
    expect(MEDIA_MIME_TYPES[".svg"]).toBe("image/svg+xml");
  });

  it("getMediaType detects audio", () => {
    expect(getMediaType("audio/mpeg")).toBe("audio");
  });

  it("getMediaType defaults to image", () => {
    expect(getMediaType("image/png")).toBe("image");
  });

  it("watcherStartedResponse", () => {
    const r = watcherStartedResponse("w1", "/tmp");
    expect(r.structuredContent.watcherId).toBe("w1");
  });

  it("watcherStoppedResponse", () => {
    const r = watcherStoppedResponse("w1");
    expect(r.structuredContent.success).toBe(true);
  });

  it("editErrorResponse", () => {
    const r = editErrorResponse("bad edit");
    expect(r.isError).toBe(true);
    expect(r.structuredContent.applied).toBe(false);
  });

  it("editDiffResponse with changes", () => {
    const r = editDiffResponse("@@ -1 +1 @@\n-old\n+new", true, false);
    expect(r.structuredContent.identical).toBe(false);
    expect(r.structuredContent.applied).toBe(true);
  });

  it("editDiffResponse identical", () => {
    const r = editDiffResponse("", false, false);
    expect(r.structuredContent.identical).toBe(true);
  });

  it("editDiffResponse ambiguous", () => {
    const r = editDiffResponse("diff", true, true);
    expect(r.structuredContent.warnings.length).toBeGreaterThan(0);
  });

  it("diffResponse", () => {
    const r = diffResponse("@@ diff @@", true);
    expect(r.structuredContent.applied).toBe(true);
  });

  it("diffResponse identical", () => {
    const r = diffResponse("  ");
    expect(r.structuredContent.identical).toBe(true);
  });

  it("infoResponse", () => {
    const r = infoResponse({ size: 42, name: "test" });
    expect(r.content[0].text).toContain("size: 42");
  });

  it("messageResponse", () => {
    const r = messageResponse("done", { count: 5 });
    expect(r.structuredContent.count).toBe(5);
  });

  it("errorResponse", () => {
    const r = errorResponse("failed", { code: 500 });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.success).toBe(false);
  });

  it("semanticOperationResponse success", () => {
    const r = semanticOperationResponse({ success: true, diff: "@@ @@" });
    expect(r.structuredContent.success).toBe(true);
  });

  it("semanticOperationResponse error", () => {
    const r = semanticOperationResponse({ success: false, diff: "", error: "bad" });
    expect(r.content[0].text).toContain("Error: bad");
  });

  it("symbolsOverviewResponse", () => {
    const r = symbolsOverviewResponse("/app.ts", "typescript", [], 0);
    expect(r.structuredContent.language).toBe("typescript");
  });

  it("symbolMatchesResponse with body", () => {
    const r = symbolMatchesResponse([{
      namePath: "fn",
      kind: "Function",
      location: { startLine: 1, endLine: 5 },
      body: "function fn() {}",
    }]);
    expect(r.content[0].text).toContain("fn()");
  });

  it("symbolMatchesResponse empty", () => {
    const r = symbolMatchesResponse([]);
    expect(r.content[0].text).toContain("No symbols");
  });

  it("referencesResponse with definition", () => {
    const r = referencesResponse("fn", [{
      filePath: "a.ts",
      line: 1,
      column: 0,
      isDefinition: true,
    }], 1);
    expect(r.structuredContent.totalCount).toBe(1);
  });

  it("referencesResponse empty", () => {
    const r = referencesResponse("fn", [], 0);
    expect(r.content[0].text).toContain("No references");
  });

  it("renameResultResponse", () => {
    const diffs = new Map([["a.ts", "@@ diff @@"]]);
    const r = renameResultResponse("old", "new", ["a.ts"], 3, diffs, []);
    expect(r.structuredContent.newName).toBe("new");
  });

  it("renameResultResponse with errors", () => {
    const diffs = new Map();
    const r = renameResultResponse("old", "new", [], 0, diffs, ["error1"]);
    expect(r.content[0].text).toContain("Errors:");
  });

  it("formatSymbolForDisplay", () => {
    const r = formatSymbolForDisplay({
      name: "fn",
      namePath: "fn",
      kind: 12,
      location: { startLine: 0, endLine: 5, startColumn: 0, endColumn: 10 },
      children: [],
    });
    expect(r.location.startLine).toBe(1);
    expect(r.kindName).toBe("Function");
  });

  it("formatSymbolAsText", () => {
    const text = formatSymbolAsText({
      name: "fn",
      namePath: "fn",
      kind: 12,
      kindName: "Function",
      location: { startLine: 1, endLine: 5, startColumn: 0, endColumn: 10 },
    });
    expect(text).toContain("[Function]");
  });
});