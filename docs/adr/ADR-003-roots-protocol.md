# ADR-003: Roots Protocol for Path Sandboxing

## Status: Accepted

## Context

The MCP Roots Protocol defines which directories the server can access. Without enforcement, any tool could read/write arbitrary paths.

## Decision

Implement `RootsManager` that:
1. Accepts root paths from MCP client via `roots/list`
2. Validates all file operations against allowed roots
3. Uses `cachedRealpath` to resolve symlinks before containment check
4. Provides both sync (`isPathAllowed`) and async (`isPathAllowedAsync`) APIs

Async version resolves symlinks via `cachedRealpath`. Sync version uses `path.normalize` only (faster but symlink-unsafe).

## Consequences

- **+** Client controls file system access boundaries
- **+** Symlink escape vectors mitigated via async path
- **-** Performance cost for realpath resolution on every validated path
- **-** Sync API is symlink-unsafe by design

## Mitigations

- `cachedRealpath` LRU cache limits realpath syscalls
- High-throughput paths (read operations) can use sync API with known-safe roots