import { describe, it, expect } from "vitest";
import {
  errorResponse,
  pathSuccessResponse,
  messageResponse,
} from "../src/utils/response-helpers.js";

describe("Response Helpers - errorResponse", () => {
  it("should return isError: true for stale writes", () => {
    const result = errorResponse("File modified externally since last read", {
      path: "/tmp/test.txt",
    });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.success).toBe(false);
    expect(structured.message).toBe("File modified externally since last read");
    expect(structured.path).toBe("/tmp/test.txt");
  });

  it("should include extra fields in structuredContent", () => {
    const result = errorResponse("stale error", {
      path: "/tmp/file.ts",
      namePath: "MyClass/myMethod",
      applied: false,
    });

    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.path).toBe("/tmp/file.ts");
    expect(structured.namePath).toBe("MyClass/myMethod");
    expect(structured.applied).toBe(false);
  });

  it("should differ from pathSuccessResponse which has no isError", () => {
    const errResult = errorResponse("fail", { path: "/tmp/x" });
    const okResult = pathSuccessResponse("ok", "/tmp/x");

    expect(errResult.isError).toBe(true);
    expect(okResult.isError).toBeUndefined();
  });

  it("should differ from messageResponse which has no success field", () => {
    const errResult = errorResponse("fail");
    const msgResult = messageResponse("info");

    const errStructured = errResult.structuredContent as Record<string, unknown>;
    const msgStructured = msgResult.structuredContent as Record<string, unknown>;

    expect(errStructured.success).toBe(false);
    expect(msgStructured.success).toBeUndefined();
  });
});