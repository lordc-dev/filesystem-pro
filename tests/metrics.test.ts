import { describe, it, expect, beforeEach } from "vitest";
import {
  incrementCounter,
  observeHistogram,
  setGauge,
  getMetrics,
  resetMetrics,
} from "../src/utils/metrics.js";

beforeEach(() => {
  resetMetrics();
});

describe("incrementCounter", () => {
  it("increments a counter", () => {
    incrementCounter("requests");
    incrementCounter("requests");
    const m = getMetrics();
    const req = m.counters.find(c => c.name === "requests");
    expect(req?.value).toBe(2);
  });

  it("increments with labels", () => {
    incrementCounter("requests", { method: "GET" });
    incrementCounter("requests", { method: "POST" });
    const m = getMetrics();
    expect(m.counters.length).toBe(2);
  });

  it("increments by custom amount", () => {
    incrementCounter("bytes", {}, 100);
    const m = getMetrics();
    const b = m.counters.find(c => c.name === "bytes");
    expect(b?.value).toBe(100);
  });
});

describe("observeHistogram", () => {
  it("records histogram samples", () => {
    observeHistogram("duration", 50);
    observeHistogram("duration", 100);
    observeHistogram("duration", 150);
    const m = getMetrics();
    const h = m.histograms.find(h => h.name === "duration");
    expect(h?.count).toBe(3);
    expect(h?.min).toBe(50);
    expect(h?.max).toBe(150);
  });

  it("computes percentiles", () => {
    for (let i = 1; i <= 100; i++) {
      observeHistogram("latency", i);
    }
    const m = getMetrics();
    const h = m.histograms.find(h => h.name === "latency");
    expect(h?.p50).toBeGreaterThan(40);
    expect(h?.p95).toBeGreaterThan(80);
  });

  it("records with labels", () => {
    observeHistogram("duration", 10, { op: "read" });
    observeHistogram("duration", 20, { op: "write" });
    const m = getMetrics();
    expect(m.histograms.length).toBe(2);
  });
});

describe("setGauge", () => {
  it("sets a gauge value", () => {
    setGauge("active_connections", 5);
    const m = getMetrics();
    const g = m.gauges.find(g => g.name === "active_connections");
    expect(g?.value).toBe(5);
  });

  it("updates gauge value", () => {
    setGauge("temp", 10);
    setGauge("temp", 20);
    const m = getMetrics();
    const g = m.gauges.find(g => g.name === "temp");
    expect(g?.value).toBe(20);
  });
});

describe("getMetrics", () => {
  it("includes uptime", () => {
    const m = getMetrics();
    expect(m.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(m.timestamp).toBeDefined();
  });

  it("returns empty after reset", () => {
    incrementCounter("x");
    resetMetrics();
    const m = getMetrics();
    expect(m.counters.length).toBe(0);
    expect(m.histograms.length).toBe(0);
    expect(m.gauges.length).toBe(0);
  });
});