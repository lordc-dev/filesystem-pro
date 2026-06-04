import { describe, it, expect } from "vitest";
import {
  textResponse,
  jsonResponse,
  pathSuccessResponse,
  dualPathSuccessResponse,
  searchResultsResponse,
  structuredSearchResponse,
  mediaResponse,
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
  MEDIA_MIME_TYPES,
  type FormattedSymbol,
} from "../src/utils/response-helpers.js";
import type { Symbol } from "../src/semantic/types.js";

describe("textResponse", () => {
  it("creates text response", () => {
    const r = textResponse("hello");
    expect(r.content[0]).toEqual({ type: "text", text: "hello" });
    expect(r.isError).toBeUndefined();
  });

  it("includes structured data", () => {
    const r = textResponse("hello", { extra: 1 });
    expect(r.structuredContent).toEqual({ content: "hello", extra: 1 });
  });
});

describe("jsonResponse", () => {
  it("serializes data as JSON", () => {
    const r = jsonResponse({ foo: "bar" });
    expect(r.content[0].type).toBe("text");
    expect(JSON.parse((r.content[0] as { text: string }).text)).toEqual({ foo: "bar" });
  });
});

describe("pathSuccessResponse", () => {
  it("creates path success response", () => {
    const r = pathSuccessResponse("deleted", "/tmp/file.txt");
    expect(r.structuredContent).toEqual({
      success: true,
      path: "/tmp/file.txt",
      message: "Successfully deleted /tmp/file.txt",
    });
  });
});

describe("dualPathSuccessResponse", () => {
  it("creates dual-path success response", () => {
    const r = dualPathSuccessResponse("moved", "/a", "/b");
    expect(r.structuredContent).toEqual({
      success: true,
      source: "/a",
      destination: "/b",
      message: "Successfully moved /a to /b",
    });
  });
});

describe("searchResultsResponse", () => {
  it("returns matches when found", () => {
    const r = searchResultsResponse(["a.ts", "b.ts"]);
    expect(r.structuredContent!.count).toBe(2);
  });

  it("returns empty message when no matches", () => {
    const r = searchResultsResponse([], "Nothing here");
    expect((r.content[0] as { text: string }).text).toBe("Nothing here");
  });
});

describe("structuredSearchResponse", () => {
  it("returns results with count", () => {
    const r = structuredSearchResponse([{ file: "a.ts", line: 1 }]);
    expect(r.structuredContent!.count).toBe(1);
  });
});

describe("mediaResponse", () => {
  it("creates image response", () => {
    const r = mediaResponse("base64data", "image/png", "image");
    expect(r.structuredContent!.mediaType).toBe("image");
  });

  it("creates audio response", () => {
    const r = mediaResponse("base64data", "audio/mp3", "audio");
    expect(r.structuredContent!.mediaType).toBe("audio");
  });
});

describe("getMediaType", () => {
  it("returns audio for audio MIME types", () => {
    expect(getMediaType("audio/mpeg")).toBe("audio");
    expect(getMediaType("audio/wav")).toBe("audio");
  });

  it("returns image for other MIME types", () => {
    expect(getMediaType("image/png")).toBe("image");
    expect(getMediaType("application/pdf")).toBe("image");
  });
});

describe("MEDIA_MIME_TYPES", () => {
  it("contains common image types", () => {
    expect(MEDIA_MIME_TYPES[".png"]).toBe("image/png");
    expect(MEDIA_MIME_TYPES[".jpg"]).toBe("image/jpeg");
    expect(MEDIA_MIME_TYPES[".gif"]).toBe("image/gif");
    expect(MEDIA_MIME_TYPES[".webp"]).toBe("image/webp");
  });

  it("contains common audio types", () => {
    expect(MEDIA_MIME_TYPES[".mp3"]).toBe("audio/mpeg");
    expect(MEDIA_MIME_TYPES[".wav"]).toBe("audio/wav");
    expect(MEDIA_MIME_TYPES[".flac"]).toBe("audio/flac");
  });
});

describe("watcherStartedResponse", () => {
  it("creates watcher started response", () => {
    const r = watcherStartedResponse("w1", "/tmp");
    expect(r.structuredContent!.watcherId).toBe("w1");
  });
});

describe("watcherStoppedResponse", () => {
  it("creates watcher stopped response", () => {
    const r = watcherStoppedResponse("w1");
    expect(r.structuredContent!.success).toBe(true);
  });
});

describe("editErrorResponse", () => {
  it("creates error response with edit schema", () => {
    const r = editErrorResponse("bad edit");
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.applied).toBe(false);
  });
});

describe("editDiffResponse", () => {
  it("creates diff with applied=true", () => {
    const r = editDiffResponse("+ added", true, false);
    expect(r.structuredContent!.applied).toBe(true);
    expect(r.structuredContent!.identical).toBe(false);
  });

  it("marks identical diff", () => {
    const r = editDiffResponse("", true, false);
    expect(r.structuredContent!.identical).toBe(true);
  });

  it("adds ambiguity warning", () => {
    const r = editDiffResponse("diff", true, true);
    expect(r.structuredContent!.warnings.length).toBeGreaterThan(0);
  });
});

describe("diffResponse", () => {
  it("creates diff response", () => {
    const r = diffResponse("+ added", true);
    expect(r.structuredContent!.diff).toBe("+ added");
  });

  it("marks identical diff", () => {
    const r = diffResponse("  ");
    expect(r.structuredContent!.identical).toBe(true);
  });
});

describe("infoResponse", () => {
  it("creates key-value info response", () => {
    const r = infoResponse({ name: "test", size: 100 });
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain("name");
    expect(text).toContain("size");
  });
});

describe("messageResponse", () => {
  it("creates message response", () => {
    const r = messageResponse("done", { count: 5 });
    expect(r.structuredContent!.count).toBe(5);
  });
});

describe("errorResponse", () => {
  it("creates error response with isError", () => {
    const r = errorResponse("something failed");
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.success).toBe(false);
  });
});

describe("semanticOperationResponse", () => {
  it("creates success response", () => {
    const r = semanticOperationResponse({ success: true, diff: "+ added" });
    expect(r.structuredContent!.success).toBe(true);
  });

  it("creates error response", () => {
    const r = semanticOperationResponse({ success: false, diff: "", error: "no symbol" });
    expect((r.content[0] as { text: string }).text).toContain("no symbol");
  });
});

describe("formatSymbolForDisplay", () => {
  it("converts 0-indexed to 1-indexed lines", () => {
    const sym: Symbol = {
      name: "foo",
      namePath: "foo",
      kind: 12,
      location: { startLine: 0, endLine: 5, startColumn: 2, endColumn: 10, startOffset: 0, endOffset: 50 },
      children: [],
    };
    const f = formatSymbolForDisplay(sym);
    expect(f.location.startLine).toBe(1);
    expect(f.location.endLine).toBe(6);
  });

  it("recursively formats children", () => {
    const sym: Symbol = {
      name: "Cls",
      namePath: "Cls",
      kind: 5,
      location: { startLine: 0, endLine: 10, startColumn: 0, endOffset: 200, startOffset: 0, endColumn: 1 },
      children: [{
        name: "method",
        namePath: "Cls/method",
        kind: 6,
        location: { startLine: 2, endLine: 5, startColumn: 4, endOffset: 150, startOffset: 50, endColumn: 5 },
        children: [],
      }],
    };
    const f = formatSymbolForDisplay(sym);
    expect(f.children!.length).toBe(1);
    expect(f.children![0].location.startLine).toBe(3);
  });
});

describe("formatSymbolAsText", () => {
  it("formats symbol as single line", () => {
    const sym: FormattedSymbol = {
      name: "foo",
      namePath: "foo",
      kind: 12,
      kindName: "Function",
      location: { startLine: 5, endLine: 10, startColumn: 0, endColumn: 1 },
    };
    expect(formatSymbolAsText(sym)).toContain("[Function] foo");
    expect(formatSymbolAsText(sym)).toContain("line 5");
  });
});

describe("symbolsOverviewResponse", () => {
  it("creates overview with symbols", () => {
    const r = symbolsOverviewResponse("/test.ts", "typescript", [], 3);
    expect(r.structuredContent!.totalCount).toBe(3);
  });
});

describe("symbolMatchesResponse", () => {
  it("creates matches response", () => {
    const r = symbolMatchesResponse([{
      namePath: "Foo/bar",
      kind: "Method",
      location: { startLine: 10, endLine: 20 },
    }]);
    expect(r.structuredContent!.count).toBe(1);
  });

  it("shows body when provided", () => {
    const r = symbolMatchesResponse([{
      namePath: "Foo",
      kind: "Class",
      location: { startLine: 1, endLine: 10 },
      body: "class Foo {}",
    }]);
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain("class Foo {}");
  });
});

describe("referencesResponse", () => {
  it("creates references response", () => {
    const r = referencesResponse("myFunc", [{
      filePath: "/a.ts",
      line: 5,
      column: 10,
      isDefinition: true,
    }], 1);
    expect(r.structuredContent!.totalCount).toBe(1);
  });
});

describe("renameResultResponse", () => {
  it("creates rename result response with diffs", () => {
    const diffs = new Map([["/a.ts", "+renamed"]]);
    const r = renameResultResponse("old", "new", ["/a.ts"], 3, diffs, []);
    expect(r.structuredContent!.totalReferences).toBe(3);
    expect(r.structuredContent!.errors).toEqual([]);
  });

  it("includes errors", () => {
    const r = renameResultResponse("old", "new", [], 0, new Map(), ["permission denied"]);
    expect(r.structuredContent!.errors).toContain("permission denied");
  });
});