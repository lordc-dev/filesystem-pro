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