import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startMetricsServer, stopMetricsServer, toPrometheus } from "../src/utils/metrics-server.js";
import { resetMetrics, incrementCounter, observeHistogram, setGauge, getMetrics } from "../src/utils/metrics.js";

describe("metrics-server", () => {
  afterEach(async () => {
    await stopMetricsServer();
  });

  describe("toPrometheus", () => {
    beforeEach(() => {
      resetMetrics();
    });

    it("formats uptime gauge", () => {
      const snapshot = getMetrics();
      const result = toPrometheus(snapshot);
      expect(result).toContain("mcp_uptime_ms");
    });

    it("formats counters with labels", () => {
      incrementCounter("tool_invocations", { tool: "read_file", status: "ok" });
      incrementCounter("tool_invocations", { tool: "read_file", status: "error" });
      incrementCounter("tool_errors", { tool: "edit_file" });

      const snapshot = getMetrics();
      const result = toPrometheus(snapshot);

      expect(result).toContain("mcp_tool_invocations_total");
      expect(result).toContain('tool="read_file"');
      expect(result).toContain("mcp_tool_errors_total");
    });

    it("formats histograms with Prometheus bucket format", () => {
      observeHistogram("tool_duration_ms", 50, { tool: "search" });
      observeHistogram("tool_duration_ms", 100, { tool: "search" });
      observeHistogram("tool_duration_ms", 200, { tool: "search" });

      const snapshot = getMetrics();
      const result = toPrometheus(snapshot);

      expect(result).toContain("mcp_tool_duration_ms_count");
      expect(result).toContain("mcp_tool_duration_ms_sum");
      expect(result).toContain('le="50"');
      expect(result).toContain('le="100"');
      expect(result).toContain('le="+Inf"');
      expect(result).toContain("# TYPE mcp_histogram histogram");
    });

    it("formats gauges", () => {
      setGauge("cache_entries", 10, { type: "symbol" });

      const snapshot = getMetrics();
      const result = toPrometheus(snapshot);

      expect(result).toContain("mcp_cache_entries");
    });
  });

  describe("startMetricsServer", () => {
    it("starts and stops HTTP server", async () => {
      await expect(startMetricsServer(19877)).resolves.toBeUndefined();
      await stopMetricsServer();
    });
  });
});