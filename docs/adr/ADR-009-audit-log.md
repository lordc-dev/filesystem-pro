# ADR-009: Audit Logging with Graceful Shutdown

## Status: Proposed (NOT implemented)

> **Note**: `audit-log.ts` does not exist in `src/` — this ADR describes a
> design that was never built. Destructive operations are recorded via the
> undo stack (in-memory + optional `MCP_UNDO_PERSIST_DIR` persistence) and
> structured logs, not a dedicated append-only audit log. The `AUDIT_WRITE`
> ECODE (12001) is reserved for this future feature.

## Context

Filesystem MCP servers perform destructive operations (write, delete, move). Without audit logging, there is no record of what changed, making incident investigation and compliance impossible. Additionally, if the process is killed (SIGINT/SIGTERM) mid-write, partial audit entries may be lost.

## Decision

Implement append-only audit logging in `audit-log.ts`. Each destructive operation (write, edit, delete, move, rename) appends a JSON entry to the audit log file. On SIGINT/SIGTERM, `closeAuditLog()` is called from `index.ts` shutdown handlers to flush pending writes.

Implementation: `Writable` stream with `fs.createWriteStream(path, { flags: 'a' })`. `closeAuditLog()` calls `stream.end()` and awaits drain. Registered in `process.on('SIGINT')` and `process.on('SIGTERM')`.

## Consequences

- **+** Full audit trail of destructive file operations
- **+** Graceful shutdown prevents log corruption
- **+** Append-only design is crash-safe (partial entries don't corrupt existing data)
- **-** I/O overhead on every destructive operation
- **-** Audit log file grows unbounded without rotation

## Mitigations

- Audit logging opt-in (only when `MCP_STRUCTURED_LOGS=true` or explicit config)
- `closeAuditLog()` on shutdown prevents data loss
- Log entries are single-line JSON for easy parsing with `jq`/`ripgrep`