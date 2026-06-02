# ADR-008: Circuit Breaker for Tree-sitter Operations

## Status: Accepted

## Context

Tree-sitter operations (parsing, symbol extraction) can fail catastrophically (WASM load failure, OOM on huge files, unhandled parse errors). Without protection, repeated failures cause cascading errors and degrade the entire semantic module.

## Decision

Implement circuit breaker pattern in `circuit-breaker.ts` for tree-sitter operations. After `failureThreshold` consecutive failures (default: 5), the circuit opens and all subsequent calls fail fast with `TS_CIRCUIT_OPEN` error. After `resetTimeout` (default: 30s), the circuit enters half-open state allowing one probe call.

Implementation: `CircuitBreaker` class with states `CLOSED → OPEN → HALF_OPEN → CLOSED`. Used by `tree-sitter-manager.ts` via `withCircuitBreaker()`.

## Consequences

- **+** Prevents cascading tree-sitter failures
- **+** Fast-fail with clear error code instead of repeated crashes
- **+** Self-healing via half-open probe after timeout
- **-** Semantic tools unavailable during open state
- **-** 30s blackout after repeated failures may confuse users

## Mitigations

- `TS_CIRCUIT_OPEN` error code allows LLM agents to adapt (skip semantic tools)
- Reset timeout configurable via `MCP_CIRCUIT_BREAKER_RESET_MS`
- Metrics track open/close transitions