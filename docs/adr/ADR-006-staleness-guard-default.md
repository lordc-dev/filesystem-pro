# ADR-006: Staleness Guard Default-On

## Status: Accepted

## Context

Without staleness guard, the agent can silently overwrite files changed by external processes between read and edit. This causes data loss.

## Decision

Enable staleness guard by default. Opt-out via `MCP_DISABLE_STALENESS_GUARD=true` env var or config.

## Consequences

- **+** Data loss prevented by default
- **+** Graceful opt-out for workflows that need it
- **-** Staleness check reads file before every destructive operation (I/O cost)
- **-** Breaking change for users relying on stale edits silently succeeding

## Mitigations

- Logged warning when disabled
- Staleness check is cheap (stat + mtime/hash)