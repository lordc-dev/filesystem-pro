/**
 * In-Memory Metrics (SSOT)
 * 
 * Lightweight counters, histograms, and gauges for observability.
 * Zero-dependency — no external monitoring service needed.
 * 
 * Enable with MCP_STRUCTURED_LOGS=1 for JSON output.
 * Query via the `get_server_stats` MCP tool.
 * 
 * Capacity limits are defined in constants.ts (MAX_COUNTER_KEYS, etc.).
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CounterEntry {
  name: string;
  value: number;
  labels: Record<string, string>;
}

export interface HistogramEntry {
  name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  labels: Record<string, string>;
  buckets: { boundary: number; count: number }[];
}

export interface GaugeEntry {
  name: string;
  value: number;
  labels: Record<string, string>;
}

export interface MetricsSnapshot {
  counters: CounterEntry[];
  histograms: HistogramEntry[];
  gauges: GaugeEntry[];
  uptimeMs: number;
  timestamp: string;
}

import { MAX_HISTOGRAM_SAMPLES, MAX_COUNTER_KEYS, MAX_HISTOGRAM_KEYS, MAX_GAUGE_KEYS, DEFAULT_METRICS_BUCKETS } from "../constants.js";
import fsp from "fs/promises";
import path from "path";

// ============================================================================
// FILE EXPORT (MCP_METRICS_FILE — JSON lines, append-only)
// ============================================================================

/** Last time a snapshot was written to the metrics file */
let lastFileWrite = 0;
const METRICS_FILE_INTERVAL_MS = 30_000;

// ponytail: bounded queue — at most one pending write; the hot path never
// blocks on fs I/O (fire-and-forget promise chain, async APIs throughout).
// Overflow drops the snapshot — metrics are best-effort by contract.
let writePending = false;

/**
 * Append a metrics snapshot to MCP_METRICS_FILE as a JSON line.
 * Throttled to one write per 30s — metrics are for post-hoc auditing,
 * not real-time monitoring. Failures are logged and swallowed (metrics
 * must never break tool calls).
 */
export function maybeWriteMetricsFile(): void {
  const filePath = process.env.MCP_METRICS_FILE;
  if (!filePath) return;

  const now = Date.now();
  if (now - lastFileWrite < METRICS_FILE_INTERVAL_MS) return;
  if (writePending) return; // previous snapshot still flushing — drop this one
  lastFileWrite = now;
  writePending = true;

  const snapshot = getMetrics();
  const line = JSON.stringify(snapshot) + "\n";
  const dir = path.dirname(filePath);

  // Async I/O throughout — a microtask running mkdirSync/appendFileSync
  // would still block the event loop after the tool call returned.
  void fsp.mkdir(dir, { recursive: true }).then(() => fsp.appendFile(filePath, line, "utf-8")).catch((err: unknown) => {
    // Swallow — metrics export must never break the server
    console.error(`[WARN] [Metrics] Failed to write metrics file: ${err instanceof Error ? err.message : String(err)}`);
  }).finally(() => {
    writePending = false;
  });
}

// ============================================================================
// CONSTANTS
// ============================================================================


// Removed local constants — now imported from ../constants.js

// ============================================================================
// INTERNAL STATE
// ============================================================================

const counters = new Map<string, number>();
const histograms = new Map<string, { samples: number[]; labels: Record<string, string> }>();
const gauges = new Map<string, { value: number; labels: Record<string, string> }>();

function counterKey(name: string, labels: Record<string, string> = {}): string {
  if (Object.keys(labels).length === 0) return name;
  const labelParts = Object.entries(labels).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => k + '="' + v + '"').join(',');
  return labels && Object.keys(labels).length > 0 ? `${name}{${labelParts}}` : name;
}

const startTime = Date.now();

// ============================================================================
// PUBLIC API
// ============================================================================

export function incrementCounter(name: string, labels?: Record<string, string>, amount = 1): void {
  const key = counterKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + amount);
  if (counters.size > MAX_COUNTER_KEYS) {
    const firstKey = counters.keys().next().value;
    if (firstKey !== undefined) counters.delete(firstKey);
  }
}

export function observeHistogram(name: string, valueMs: number, labels?: Record<string, string>): void {
  const key = counterKey(name, labels);
  const existing = histograms.get(key);
  if (existing) {
    existing.samples.push(valueMs);
    if (existing.samples.length > MAX_HISTOGRAM_SAMPLES) {
      existing.samples.splice(0, existing.samples.length - MAX_HISTOGRAM_SAMPLES);
    }
  } else {
    if (histograms.size >= MAX_HISTOGRAM_KEYS) {
      const firstKey = histograms.keys().next().value;
      if (firstKey !== undefined) histograms.delete(firstKey);
    }
    histograms.set(key, { samples: [valueMs], labels: labels ?? {} });
  }
}

export function setGauge(name: string, value: number, labels?: Record<string, string>): void {
  const key = counterKey(name, labels);
  if (!gauges.has(key) && gauges.size >= MAX_GAUGE_KEYS) {
    const firstKey = gauges.keys().next().value;
    if (firstKey !== undefined) gauges.delete(firstKey);
  }
  gauges.set(key, { value, labels: labels ?? {} });
}

export function getMetrics(): MetricsSnapshot {
  const now = Date.now();

  const counterEntries: CounterEntry[] = [];
  for (const [key, value] of counters) {
    const { name, labels } = parseKey(key);
    counterEntries.push({ name, value, labels });
  }

  const histogramEntries: HistogramEntry[] = [];
  for (const [key, { samples, labels }] of histograms) {
    const { name } = parseKey(key);
    if (samples.length === 0) continue;
    const sorted = [...samples].sort((a, b) => a - b);
    const buckets = computeBuckets(sorted, [...DEFAULT_METRICS_BUCKETS]);
    histogramEntries.push({
      name,
      count: sorted.length,
      sum: sorted.reduce((a, b) => a + b, 0),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      labels,
      buckets,
    });
  }

  const gaugeEntries: GaugeEntry[] = [];
  for (const [key, { value, labels }] of gauges) {
    const { name } = parseKey(key);
    gaugeEntries.push({ name, value, labels });
  }

  return {
    counters: counterEntries,
    histograms: histogramEntries,
    gauges: gaugeEntries,
    uptimeMs: now - startTime,
    timestamp: new Date(now).toISOString(),
  };
}

export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
  gauges.clear();
}

function computeBuckets(sorted: number[], boundaries: number[]): { boundary: number; count: number }[] {
  const result: { boundary: number; count: number }[] = [];
  let boundaryIdx = 0;
  for (const boundary of boundaries) {
    while (boundaryIdx < sorted.length && sorted[boundaryIdx] <= boundary) {
      boundaryIdx++;
    }
    result.push({ boundary, count: boundaryIdx });
  }
  return result;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function parseKey(key: string): { name: string; labels: Record<string, string> } {
  const braceIdx = key.indexOf("{");
  if (braceIdx === -1) return { name: key, labels: {} };
  const name = key.substring(0, braceIdx);
  const inner = key.substring(braceIdx + 1, key.length - 1);
  const labels: Record<string, string> = {};
  for (const pair of inner.split(",")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx !== -1) {
      labels[pair.substring(0, eqIdx)] = pair.substring(eqIdx + 1).replace(/^"/, "").replace(/"$/, "");
    }
  }
  return { name, labels };
}