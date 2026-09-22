# ADR-011: Undo Persistence Disabled by Default + Debounced Writes

## Status: Accepted

## Context

The undo stack optionally persists to disk (`MCP_UNDO_PERSIST_DIR`) so undo survives process restarts. Profiling (perf R1–R5, 2026-09-22) showed the serialize+fsync per `record()` taxed the hot path of every edit operation. Additionally, the diff-patch storage mode (structuredPatch for entries >10KB) added complexity with marginal memory savings and a fragile reconstruction path.

## Decision

1. **Persistence disabled by default**: `MCP_UNDO_PERSIST_DIR` unset in `.env`. Undo is session-scoped (in-memory, bounded 100 entries × 1MB).
2. **Debounced persistence when enabled**: `persist()` uses a 500ms trailing debounce — rapid edits batch into one disk write. `flush()` forces an immediate write; shutdown handlers (SIGINT/SIGTERM in `index.ts`) call `undoManager.flush()` so the debounce never loses data at exit.
3. **Diff-patch storage removed**: entries store full previous content (up to `MCP_UNDO_MAX_ENTRY_BYTES`); larger files are not undoable. Simpler restore path, no `diff` dependency.

## Consequences

- **+** Edit hot path no longer pays serialize+fsync per operation
- **+** Undo restore is a single atomic write — no patch reconstruction failures
- **+** `diff` dependency removed from undo-manager
- **-** Cross-restart undo requires opting in via `MCP_UNDO_PERSIST_DIR`
- **-** Files >1MB are not undoable (unchanged ceiling)

## Mitigations

- `flush()` on shutdown covers the debounce window
- Persistence remains available for workflows that need cross-restart undo
- Bench baseline in `docs/BENCHMARKS.md` confirms `record()` at ~0.06ms/op