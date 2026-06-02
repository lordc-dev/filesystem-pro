# ADR-001: Singleton Pattern for Stateful Services

## Status: Accepted

## Context

Tree-sitter manager, undo manager, and staleness guard maintain global state (parser instances, undo stacks, fingerprints). Multiple instances would cause inconsistent state and resource leaks.

## Decision

Use the Singleton pattern via `static getInstance()` + private constructor for stateful services. Export the singleton instance as the default API.

## Consequences

- **+** Global state is consistent across all tool handlers
- **+** Resource lifecycle is predictable (one parser, one undo stack)
- **-** Harder to test in isolation (must mock or reset)
- **-** Not suitable for multi-tenant scenarios

## Mitigations

- `reset()` methods for testing
- Singletons accessed via exported instance, not `getInstance()` in production code