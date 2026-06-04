import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, getConfig, resetConfig } from "../src/config/runtime-config.js";

beforeEach(() => {
  resetConfig();
});

afterEach(() => {
  resetConfig();
  delete process.env.MCP_ROOTS_RESTRICTION;
  delete process.env.MCP_DEBUG;
  delete process.env.MCP_CACHE_DISABLED;
  delete process.env.MCP_SYMBOL_CACHE_SIZE;
  delete process.env.MCP_UNDO_STACK_SIZE;
  delete process.env.MCP_UNDO_PERSIST_DIR;
  delete process.env.MCP_MAX_FILE_SIZE_BYTES;
  delete process.env.MCP_CONFIG_FILE;
  delete process.env.MCP_STALENESS_GUARD;
});

describe("getConfig", () => {
  it("returns default config when not loaded", () => {
    const config = getConfig();
    expect(config.roots.enabled).toBe(true);
    expect(config.cache.symbolCacheSize).toBe(100);
    expect(config.undo.maxStackSize).toBe(100);
    expect(config.debug).toBe(false);
  });

  it("caches config after first call", () => {
    const c1 = getConfig();
    const c2 = getConfig();
    expect(c1).toBe(c2);
  });
});

describe("loadConfig", () => {
  it("loads config with defaults", async () => {
    const config = await loadConfig();
    expect(config.roots.enabled).toBe(true);
    expect(config.search.maxResults).toBe(100);
  });

  it("respects MCP_ROOTS_RESTRICTION=0", async () => {
    process.env.MCP_ROOTS_RESTRICTION = "0";
    const config = await loadConfig();
    expect(config.roots.enabled).toBe(false);
  });

  it("respects MCP_DEBUG=true", async () => {
    process.env.MCP_DEBUG = "true";
    const config = await loadConfig();
    expect(config.debug).toBe(true);
  });

  it("respects MCP_CACHE_DISABLED=true", async () => {
    process.env.MCP_CACHE_DISABLED = "true";
    const config = await loadConfig();
    expect(config.cache.disabled).toBe(true);
  });

  it("respects MCP_SYMBOL_CACHE_SIZE", async () => {
    process.env.MCP_SYMBOL_CACHE_SIZE = "200";
    const config = await loadConfig();
    expect(config.cache.symbolCacheSize).toBe(200);
  });

  it("respects MCP_UNDO_STACK_SIZE", async () => {
    process.env.MCP_UNDO_STACK_SIZE = "50";
    const config = await loadConfig();
    expect(config.undo.maxStackSize).toBe(50);
  });

  it("respects MCP_UNDO_PERSIST_DIR", async () => {
    process.env.MCP_UNDO_PERSIST_DIR = "/tmp/undo";
    const config = await loadConfig();
    expect(config.undo.persistDir).toBe("/tmp/undo");
  });

  it("respects MCP_MAX_FILE_SIZE_BYTES", async () => {
    process.env.MCP_MAX_FILE_SIZE_BYTES = "1000000";
    const config = await loadConfig();
    expect(config.fileRead.maxFileSizeBytes).toBe(1000000);
  });

  it("respects MCP_STALENESS_GUARD=0", async () => {
    process.env.MCP_STALENESS_GUARD = "0";
    const config = await loadConfig();
    expect(config.stalenessGuard.enabled).toBe(false);
  });

  it("ignores invalid env values", async () => {
    process.env.MCP_SYMBOL_CACHE_SIZE = "not-a-number";
    const config = await loadConfig();
    expect(config.cache.symbolCacheSize).toBe(100);
  });
});

describe("resetConfig", () => {
  it("resets config to null", async () => {
    await loadConfig();
    resetConfig();
    const config = getConfig();
    expect(config).toBeDefined();
  });
});