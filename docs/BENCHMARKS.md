# Benchmark Thresholds

Run with `pnpm bench`.

| Operation | Threshold | Notes |
|---|---|---|
| `readTextContent` (1000 lines) | < 5ms avg | 50 iterations |
| `undo push + restore` | < 5ms avg | 50 iterations |
| `template cache set+get` | < 0.1ms per op | 200 iterations |
| `searchContent` (20 files) | < 100ms total | ripgrep |
| `directory listing` (100 files) | < 5ms avg | 10 iterations |

If a benchmark fails, investigate regression in the affected module before merging.

## Baseline — 2026-09-22 (post perf R1–R5)

Node 20, M-series, vitest 4.1.7. Total suite: 303ms.

| Operation | Threshold | Measured | Notes |
|---|---|---|---|
| `readTextContent` (1000 lines) | < 5ms avg | 8ms total (50 iter) | ~0.16ms/op |
| `readTextContent` head 10 | < 2ms avg | 6ms total (50 iter) | ~0.12ms/op |
| `undoManager.record` | < 5ms avg | 3ms total (50 iter) | ~0.06ms/op, debounced persist |
| `searchContent` (20 files) | < 100ms | 16ms | ripgrep |
| `directory listing` (100 files) | < 5ms avg | 14ms total (10 iter) | ~1.4ms/op |