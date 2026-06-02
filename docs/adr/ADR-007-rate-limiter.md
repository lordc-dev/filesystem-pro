# ADR-007: Per-Tool Rate Limiter

## Status: Accepted

## Context

A single tool making excessive calls can starve other tools, exhaust server resources, or trigger OS-level limits (file descriptors, memory). Without rate limiting, a misbehaving LLM agent can degrade or crash the MCP server.

## Decision

Implement token-bucket rate limiting per tool in `tool-factory.ts`. Default: 60 requests/minute per tool. Global rate limit shared across all tools. Configurable via `MCP_RATE_LIMIT_*` env vars.

Implementation: `rate-limiter.ts` uses `TokenBucket` algorithm. `tool-factory.ts` checks `limiter.consume()` before executing each tool handler. If rate exceeded, returns structured error with retry hint.

## Consequences

- **+** Prevents resource exhaustion from runaway tool calls
- **+** Per-tool isolation — one tool cannot starve others
- **+** Gentle degradation (error response, not crash)
- **-** Adds latency for rate-check on every invocation
- **-** Default limits may need tuning per workload

## Mitigations

- Configurable via env vars and config file
- Rate limit errors include `retryAfterMs` hint
- Metrics emitted for rate-limit events