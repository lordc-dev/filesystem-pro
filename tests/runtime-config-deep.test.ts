import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { loadConfig, getConfig, resetConfig } from "../src/config/runtime-config.js";

beforeEach(() => {
  resetConfig();
});

afterEach(() => {
  resetConfig();
  delete process.env.MCP_CONFIG_FILE;
  delete process.env.MCP_UNDO_STACK_SIZE;
  delete process.env.MCP_SYMBOL_CACHE_SIZE;
  delete process.env.MCP_UNDO_PERSIST_DIR;
  delete process.env.MCP_MAX_FILE_SIZE_BYTES;
  delete process.env.MCP_MAX_SEARCH_OUTPUT_BYTES;
  delete process.env.DEBUG_MCP;
  delete process.env.MCP_DEBUG;
  delete process.env.MCP_ROOTS_RESTRICTION;
  delete process.env.MCP_STALENESS_GUARD;
  delete process.env.MCP_CACHE_DISABLED;
  delete process.env.MCP_SYMBOL_CACHE_TTL;
  delete process.env.MCP_AST_CACHE_SIZE;
  delete process.env.MCP_AST_CACHE_TTL;
  delete process.env.MCP_UNDO_MAX_ENTRY_BYTES;
});

describe("runtime-config deep", () => {
  it("getConfig returns defaults when loadConfig not called", () => {
    const config = getConfig();
    expect(config.roots.enabled).toBe(true);
    expect(config.debug).toBe(false);
    expect(config.undo.maxStackSize).toBe(100);
    expect(config.cache.disabled).toBe(false);
  });

  it("loadConfig returns default config", async () => {
    const config = await loadConfig();
    expect(config.roots.enabled).toBe(true);
    expect(config.search.maxResults).toBe(100);
    expect(config.stalenessGuard.enabled).toBe(true);
    expect(config.undo.persistDir).toBe("");
  });

  it("loadConfig with env overrides for undo stack size", async () => {
    process.env.MCP_UNDO_STACK_SIZE = "200";
    const config = await loadConfig();
    expect(config.undo.maxStackSize).toBe(200);
  });

  it("loadConfig with env overrides for symbol cache size", async () => {
    process.env.MCP_SYMBOL_CACHE_SIZE = "500";
    const config = await loadConfig();
    expect(config.cache.symbolCacheSize).toBe(500);
  });

  it("loadConfig with env overrides for undo persist dir", async () => {
    process.env.MCP_UNDO_PERSIST_DIR = "/tmp/custom-undo";
    const config = await loadConfig();
    expect(config.undo.persistDir).toBe("/tmp/custom-undo");
  });

  it("loadConfig with env overrides for max file size", async () => {
    process.env.MCP_MAX_FILE_SIZE_BYTES = "104857600";
    const config = await loadConfig();
    expect(config.fileRead.maxFileSizeBytes).toBe(104857600);
  });

  it("loadConfig with env overrides for max search output", async () => {
    process.env.MCP_MAX_SEARCH_OUTPUT_BYTES = "4194304";
    const config = await loadConfig();
    expect(config.search.maxOutputBytes).toBe(4194304);
  });

  it("loadConfig with debug env var", async () => {
    process.env.DEBUG_MCP = "true";
    const config = await loadConfig();
    expect(config.debug).toBe(true);
  });

  it("loadConfig with MCP_DEBUG env var", async () => {
    process.env.MCP_DEBUG = "true";
    const config = await loadConfig();
    expect(config.debug).toBe(true);
  });

  it("loadConfig with roots restriction disabled", async () => {
    process.env.MCP_ROOTS_RESTRICTION = "0";
    const config = await loadConfig();
    expect(config.roots.enabled).toBe(false);
  });

  it("loadConfig with staleness guard disabled", async () => {
    process.env.MCP_STALENESS_GUARD = "false";
    const config = await loadConfig();
    expect(config.stalenessGuard.enabled).toBe(false);
  });

  it("loadConfig with cache disabled", async () => {
    process.env.MCP_CACHE_DISABLED = "true";
    const config = await loadConfig();
    expect(config.cache.disabled).toBe(true);
  });

  it("loadConfig with invalid env value ignores it", async () => {
    process.env.MCP_UNDO_STACK_SIZE = "not-a-number";
    const config = await loadConfig();
    expect(config.undo.maxStackSize).toBe(100);
  });

  it("loadConfig with negative env value ignores it", async () => {
    process.env.MCP_SYMBOL_CACHE_SIZE = "-5";
    const config = await loadConfig();
    expect(config.cache.symbolCacheSize).toBe(100);
  });

  it("loadConfig from JSON file", async () => {
    const tempDir = await fs.mkdtemp("/tmp/config-test-");
    const configPath = path.join(tempDir, "test-config.json");
    await fs.writeFile(configPath, JSON.stringify({
      undo: { maxStackSize: 50 },
      debug: true,
    }));
    process.env.MCP_CONFIG_FILE = configPath;
    const config = await loadConfig();
    expect(config.undo.maxStackSize).toBe(50);
    expect(config.debug).toBe(true);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("loadConfig from missing file uses defaults", async () => {
    process.env.MCP_CONFIG_FILE = "/tmp/nonexistent-config-xyz.json";
    const config = await loadConfig();
    expect(config.undo.maxStackSize).toBe(100);
  });

  it("loadConfig with invalid JSON in config file uses defaults", async () => {
    const tempDir = await fs.mkdtemp("/tmp/config-test-");
    const configPath = path.join(tempDir, "bad-config.json");
    await fs.writeFile(configPath, "not valid json {{{");
    process.env.MCP_CONFIG_FILE = configPath;
    const config = await loadConfig();
    expect(config.undo.maxStackSize).toBe(100);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("loadConfig with cache TTL env var", async () => {
    process.env.MCP_SYMBOL_CACHE_TTL = "300000";
    const config = await loadConfig();
    expect(config.cache.symbolCacheTtlMs).toBe(300000);
  });

  it("loadConfig with AST cache size env var", async () => {
    process.env.MCP_AST_CACHE_SIZE = "50";
    const config = await loadConfig();
    expect(config.cache.astCacheSize).toBe(50);
  });

  it("loadConfig with AST cache TTL env var", async () => {
    process.env.MCP_AST_CACHE_TTL = "120000";
    const config = await loadConfig();
    expect(config.cache.astCacheTtlMs).toBe(120000);
  });

  it("loadConfig with undo max entry bytes env var", async () => {
    process.env.MCP_UNDO_MAX_ENTRY_BYTES = "2000000";
    const config = await loadConfig();
    expect(config.undo.maxEntrySizeBytes).toBe(2000000);
  });

  it("caches resolved config on second call", async () => {
    const config1 = await loadConfig();
    const config2 = getConfig();
    expect(config1).toBe(config2);
  });

  it("resetConfig allows reloading", async () => {
    const config1 = await loadConfig();
    resetConfig();
    process.env.MCP_UNDO_STACK_SIZE = "300";
    const config2 = await loadConfig();
    expect(config2.undo.maxStackSize).toBe(300);
  });
});