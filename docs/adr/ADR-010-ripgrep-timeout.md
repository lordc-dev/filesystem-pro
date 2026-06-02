# ADR-010: Ripgrep Process Timeout and Byte Limit

## Status: Accepted

## Context

Ripgrep searches across large codebases can return megabytes of output or hang on pathological patterns (catastrophic backtracking). Without limits, a single search can exhaust memory or block the event loop indefinitely.

## Decision

Implement three layers of protection in `ripgrep-executor.ts`:

1. **Byte limit kill**: Track stdout byte count during streaming. If `MCP_MAX_SEARCH_OUTPUT_BYTES` (default: 2MB) exceeded, send SIGTERM to ripgrep child process. Partial results (up to limit) are returned with a warning.

2. **Process timeout**: If ripgrep doesn't complete within `MCP_RG_TIMEOUT_MS` (default: 30s), send SIGTERM. Prevents zombie processes on pathological patterns.

3. **Concurrency limit**: Max `MCP_MAX_CONCURRENT_RG` (default: 8) ripgrep processes running simultaneously. Queues excess calls.

Implementation: Child process spawned with `child_process.spawn()`. stdout stream tracked via `Buffer.concat()`. Timer via `setTimeout()`. Concurrency via semaphore-like counter in `ripgrep-executor.ts`.

## Consequences

- **+** Prevents OOM from unbounded search results
- **+** Prevents zombie ripgrep processes
- **+** Prevents process flood from concurrent searches
- **-** Large search results truncated (user gets partial results + warning)
- **-** 30s timeout may abort legitimate broad searches
- **-** Concurrency limit may queue searches during burst activity

## Mitigations

- All limits configurable via env vars
- Truncated results include warning about byte limit hit
- Timeout errors include suggestion to narrow pattern
- Concurrency queue is FIFO — no starvation