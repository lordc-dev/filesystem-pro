import { describe, it, expect } from "vitest";
import { API_VERSION, API_VERSION_STRING, TOOL_API_VERSIONS, getToolApiVersion } from "../src/utils/api-version.js";

describe("api-version", () => {
  it("exports API_VERSION with major, minor, patch", () => {
    expect(API_VERSION.major).toBeTypeOf("number");
    expect(API_VERSION.minor).toBeTypeOf("number");
    expect(API_VERSION.patch).toBeTypeOf("number");
    expect(API_VERSION.major).toBeGreaterThanOrEqual(0);
  });

  it("API_VERSION_STRING matches package version format", () => {
    expect(API_VERSION_STRING).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("TOOL_API_VERSIONS contains expected tools", () => {
    expect(TOOL_API_VERSIONS["read_text_file"]).toBeDefined();
    expect(TOOL_API_VERSIONS["write_file"]).toBeDefined();
    expect(TOOL_API_VERSIONS["edit_file"]).toBeDefined();
    expect(TOOL_API_VERSIONS["undo"]).toBeDefined();
    expect(TOOL_API_VERSIONS["get_server_stats"]).toBeDefined();
  });

  it("all tool versions follow MAJOR.MINOR format", () => {
    for (const [tool, version] of Object.entries(TOOL_API_VERSIONS)) {
      expect(version).toMatch(/^\d+\.\d+$/, `Tool ${tool} has invalid version format: ${version}`);
    }
  });

  it("getToolApiVersion returns version for known tools", () => {
    expect(getToolApiVersion("read_text_file")).toBe(TOOL_API_VERSIONS["read_text_file"]);
  });

  it("getToolApiVersion returns undefined for unknown tools", () => {
    expect(getToolApiVersion("nonexistent_tool")).toBeUndefined();
  });

  it("every registered tool has a version", () => {
    const essentialTools = [
      "read_text_file", "write_file", "edit_file", "search_content",
      "find_symbol", "undo", "directory_tree", "move_file",
    ];
    for (const tool of essentialTools) {
      expect(TOOL_API_VERSIONS[tool]).toBeDefined();
    }
  });
});