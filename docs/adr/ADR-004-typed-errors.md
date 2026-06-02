# ADR-004: Typed Error Hierarchy with Cause Chaining

## Status: Accepted

## Context

All `throw new Error(ERROR_MESSAGES.x)` calls lose domain context and cause chain. Callers cannot distinguish between a path validation error and a tree-sitter init error without parsing message strings.

## Decision

Create `src/errors/index.ts` with a `BaseError` hierarchy:
- `BaseError` extends `Error` with `context`, `timestamp`, `cause` (using Error cause chain), and `toJSON()`
- Domain-specific subclasses: `PathValidationError`, `TreeSitterError`, `SymbolNotFoundError`, `EditMatchError`, `DirectoryError`, `WatcherError`, `ConfigError`, `SearchError`, `UndoError`, `FileNotFoundError`
- Replace `throw new Error(ERROR_MESSAGES.x)` with typed equivalents throughout codebase

## Consequences

- **+** `instanceof` checks enable domain-specific catch blocks
- **+** `toJSON()` provides structured error data for MCP responses
- **+** Cause chain preserves original error for debugging
- **-** Must import error classes at each throw site
- **-** Existing `ERROR_MESSAGES` factory partially redundant (message is in error class now)

## Mitigations

- `ERROR_MESSAGES` still used for non-error response text (e.g., "File not found" shown to user)
- Error classes compose with `ERROR_MESSAGES` when appropriate