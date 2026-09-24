/**
 * Access Control Tests
 *
 * Covers the three compensating controls for unrestricted mode:
 * deny-list (MCP_DENY_PATHS), unrestricted ack (MCP_UNRESTRICTED_ACK),
 * and outside-cwd logging (MCP_LOG_OUTSIDE_CWD).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { matchDenyPath, assertDestructiveAllowed, isSandboxed, logIfOutsideCwd } from "../src/validation/access-control.js";
import { loadConfig, resetConfig } from "../src/config/runtime-config.js";
import { resetMetrics } from "../src/utils/metrics.js";

beforeEach(() => {
  resetConfig();
  resetMetrics();
});

afterEach(() => {
  resetConfig();
  delete process.env.MCP_DENY_PATHS;
  delete process.env.MCP_UNRESTRICTED_ACK;
  delete process.env.MCP_LOG_OUTSIDE_CWD;
  delete process.env.MCP_ROOTS_RESTRICTION;
});

describe("deny-list matching", () => {
  it("returns null when no deny paths configured", async () => {
    await loadConfig();
    expect(matchDenyPath("/Users/x/project/file.ts")).toBeNull();
  });

  it("matches absolute path prefix", async () => {
    process.env.MCP_DENY_PATHS = "/Users/x/.ssh";
    await loadConfig();
    expect(matchDenyPath("/Users/x/.ssh")).not.toBeNull();
    expect(matchDenyPath("/Users/x/.ssh/id_rsa")).not.toBeNull();
    expect(matchDenyPath("/Users/x/.sshx/file")).toBeNull(); // no partial segment match
  });

  it("expands ~ to home directory", async () => {
    process.env.MCP_DENY_PATHS = "~/.ssh";
    await loadConfig();
    expect(matchDenyPath(`${process.env.HOME}/.ssh/id_rsa`)).not.toBeNull();
  });

  it("matches glob **/.env", async () => {
    process.env.MCP_DENY_PATHS = "**/.env";
    await loadConfig();
    expect(matchDenyPath("/any/project/.env")).not.toBeNull();
    expect(matchDenyPath("/any/project/src/.env")).not.toBeNull();
    expect(matchDenyPath("/any/project/.envrc")).toBeNull();
    expect(matchDenyPath("/any/project/.env.local")).toBeNull(); // **/.env denies the file itself, not siblings
  });

  it("matches glob **/node_modules/**", async () => {
    process.env.MCP_DENY_PATHS = "**/node_modules/**";
    await loadConfig();
    expect(matchDenyPath("/proj/node_modules/pkg/index.js")).not.toBeNull();
    expect(matchDenyPath("/proj/src/index.ts")).toBeNull();
  });
});

describe("unrestricted ack guard", () => {
  it("blocks destructive tools when unsandboxed and not acknowledged", async () => {
    process.env.MCP_ROOTS_RESTRICTION = "0";
    await loadConfig();
    expect(() => assertDestructiveAllowed("write_file")).toThrow(/UNRESTRICTED/);
  });

  it("allows destructive tools when acknowledged via MCP_UNRESTRICTED_ACK", async () => {
    process.env.MCP_ROOTS_RESTRICTION = "0";
    process.env.MCP_UNRESTRICTED_ACK = "1";
    await loadConfig();
    expect(() => assertDestructiveAllowed("write_file")).not.toThrow();
  });

  it("allows destructive tools when deny-list configured (partial sandbox)", async () => {
    process.env.MCP_ROOTS_RESTRICTION = "0";
    process.env.MCP_DENY_PATHS = "~/.ssh";
    await loadConfig();
    expect(() => assertDestructiveAllowed("write_file")).not.toThrow();
  });

  it("isSandboxed false with roots off and no deny-list", async () => {
    process.env.MCP_ROOTS_RESTRICTION = "0";
    await loadConfig();
    expect(isSandboxed()).toBe(false);
  });

  it("isSandboxed true with deny-list", async () => {
    process.env.MCP_ROOTS_RESTRICTION = "0";
    process.env.MCP_DENY_PATHS = "~/.ssh";
    await loadConfig();
    expect(isSandboxed()).toBe(true);
  });
});

describe("outside-cwd logging", () => {
  it("does not throw for paths outside cwd", () => {
    expect(() => logIfOutsideCwd("/definitely/outside/file.txt", "read_text_file")).not.toThrow();
  });

  it("does not throw for paths inside cwd", () => {
    expect(() => logIfOutsideCwd(`${process.cwd()}/src/index.ts`, "read_text_file")).not.toThrow();
  });
});