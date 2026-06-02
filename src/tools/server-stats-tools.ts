/**
 * Server Statistics Tool
 *
 * Exposes in-memory metrics, cache sizes, and server health information
 * via an MCP tool for observability without external services.
 */

import { createRequire } from "module";
import { z } from "zod";
import { getMetrics } from "../utils/metrics.js";
import { undoManager } from "../undo/undo-manager.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { getConfig, isRootsRestrictionEnabled } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { symbolCache } from "../semantic/symbol-cache.js";
import { treeSitterManager } from "../semantic/tree-sitter-manager.js";
import { type ToolContext } from "./types.js";
import { API_VERSION_STRING } from "../utils/api-version.js";

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require("../../package.json");

export function registerServerStatsTools({ server: _server, factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly("get_server_stats", {
    title: "Get Server Statistics",
    description:
      "Get server metrics, cache sizes, undo stack depth, and uptime. " +
      "Returns counters (tool invocations, errors), histograms (p50/p95 durations), " +
      "gauges (cache sizes), memory/CPU usage, and config status.",
    inputSchema: {},
    outputSchema: {
      version: z.string().describe("Server version"),
      apiVersion: z.string().describe("API version (semver contract for tool IO)"),
      uptimeMs: z.number().describe("Uptime in milliseconds"),
      metrics: z.string().describe("JSON-encoded metrics snapshot"),
      undoStackDepth: z.number().describe("Current undo stack depth"),
      stalenessGuardEnabled: z.boolean().describe("Whether staleness guard is active"),
      rootsRestriction: z.boolean().describe("Whether roots restriction is enabled"),
      memory: z.object({
        rss: z.number(),
        heapTotal: z.number(),
        heapUsed: z.number(),
        external: z.number(),
        arrayBuffers: z.number(),
      }).describe("Process memory usage in bytes"),
      cpu: z.object({
        user: z.number(),
        system: z.number(),
      }).describe("Process CPU usage in microseconds"),
      caches: z.object({
        symbolCache: z.object({
          size: z.number(),
          maxSize: z.number(),
          ttlMs: z.number(),
          hits: z.number(),
          misses: z.number(),
          hitRate: z.number(),
        }),
        astCache: z.object({
          size: z.number(),
          maxSize: z.number(),
          ttlMs: z.number(),
          hits: z.number(),
          misses: z.number(),
          hitRate: z.number(),
        }),
        stalenessGuard: z.object({
          size: z.number(),
          maxSize: z.number(),
        }),
      }).describe("Cache statistics"),
      health: z.object({
        status: z.string(),
        ripgrep: z.boolean(),
        treeSitter: z.boolean(),
        undoPersistence: z.boolean(),
      }).describe("Health check status"),
    },
  }, async () => {
    const metrics = getMetrics();
    const config = getConfig();
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    const symbolCacheStats = symbolCache.getStats();
    const astCacheStats = treeSitterManager.getCacheStats();

    let treeSitterOk = false;
    try {
      treeSitterManager.getParser();
      treeSitterOk = true;
    } catch {
      treeSitterOk = false;
    }

    const healthStatus = (() => {
      const issues: string[] = [];
      if (!treeSitterOk) issues.push("tree-sitter");
      if (mem.heapUsed > mem.heapTotal * 0.9) issues.push("high-memory");
      return issues.length === 0 ? "healthy" : `degraded(${issues.join(",")})`;
    })();

    return {
      content: [],
      structuredContent: {
        version: SERVER_VERSION,
        apiVersion: API_VERSION_STRING,
        uptimeMs: metrics.uptimeMs,
        metrics: JSON.stringify(metrics),
        undoStackDepth: undoManager.size,
        stalenessGuardEnabled: config.stalenessGuard.enabled,
        rootsRestriction: isRootsRestrictionEnabled(),
        memory: {
          rss: mem.rss,
          heapTotal: mem.heapTotal,
          heapUsed: mem.heapUsed,
          external: mem.external,
          arrayBuffers: mem.arrayBuffers,
        },
        cpu: {
          user: cpu.user,
          system: cpu.system,
        },
        caches: {
          symbolCache: symbolCacheStats,
          astCache: astCacheStats,
          stalenessGuard: {
            size: stalenessGuard.size,
            maxSize: 2000,
          },
        },
        health: {
          status: healthStatus,
          ripgrep: true,
          treeSitter: treeSitterOk,
          undoPersistence: undoManager.isPersistenceEnabled,
        },
      },
    };
  });
}

export { getMetrics, incrementCounter, observeHistogram, setGauge } from "../utils/metrics.js";