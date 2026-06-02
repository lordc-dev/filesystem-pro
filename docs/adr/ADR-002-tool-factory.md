# ADR-002: Tool Factory Pattern for MCP Registration

## Status: Accepted

## Context

The MCP SDK requires registering tools with `server.registerTool()`, each needing input/output schemas (Zod), a handler, and metadata. 48+ tools = massive boilerplate if each is registered manually.

## Decision

Use a `tool-factory.ts` that provides `readOnly()` and `destructive()` factory functions. These wrap `server.registerTool()` with:
- Automatic Zod→JSON Schema conversion
- Staleness fingerprint recording for destructive operations
- Undo tracking for destructive operations
- Structured output validation against declared `outputSchema`

## Consequences

- **+** ~10 lines per tool definition instead of ~30
- **+** Consistent staleness/undo behavior across all destructive tools
- **+** Output schema validation prevents undeclared keys from leaking
- **-** Factory adds indirection — new developers must learn the pattern
- **-** Generic handler typing requires type assertion at call site

## Mitigations

- `ToolContext` type documents the factory API
- Type assertion documented with explicit cast instead of `@ts-expect-error`