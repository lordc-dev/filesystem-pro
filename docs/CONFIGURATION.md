# Filesystem Pro — Configuration Reference

## CLI Flags

```
Usage: filesystem-pro [flags]
```

| Flag | Short | Description |
|------|-------|-------------|
| `--help` | `-h` | Show help and exit |
| `--version` | `-v` | Print version and exit |
| `--show-config` | — | Print resolved configuration (defaults + env + config file) as JSON and exit |

All runtime configuration is via environment variables (see below). CLI flags are for inspection only.

## Environment Variables

### Core Server

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_STRUCTURED_LOGS` | `0` | Enable structured JSON logging (`1` = enabled) |
| `MCP_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |

### Debug

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_DEBUG` | `false` | Enable verbose debug logging (`true` = enabled) |
| `DEBUG_MCP` | `false` | Alias for `MCP_DEBUG` (`true` = enabled) |
| `MCP_CONFIG_FILE` | — | Path to JSON config file. Loaded before env var overrides. |
| `MCP_TEMPLATES_DIR` | — | Custom directory for prompt templates |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `5242880` (5MB) | Maximum output bytes for search results |

### Prometheus Metrics

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_METRICS_PORT` | `0` (disabled) | HTTP port for Prometheus `/metrics` and `/health` endpoints |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_RATE_LIMIT_<TOOL>` | — | Per-tool rate limit in `maxTokens:tokensPerMinute` format. Example: `MCP_RATE_LIMIT_EDIT_FILE=20:120` |

Default rate limits (applied when no env override):
- Per-tool: 10 burst / 60 per minute
- Global: 30 burst / 120 per minute

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ROOTS_RESTRICTION` | `1` | Enable path restriction to configured root directories. Set `0` to disable. **Enabled by default.** |
| `MCP_STALENESS_GUARD` | `1` | Enable staleness guard for undo fingerprint tracking. Set `0` to disable. **Enabled by default.** |
| `MCP_RG_TIMEOUT_MS` | `30000` | Ripgrep execution timeout in milliseconds |
| `MCP_MAX_CONCURRENT_RG` | `8` | Maximum concurrent ripgrep processes |
| `MCP_MAX_FILE_SIZE_BYTES` | `52428800` (50MB) | Maximum file size for both read and write operations |
| `MCP_MAX_WRITE_SIZE_BYTES` | `52428800` (50MB) | Maximum content size accepted by `write_file` (defaults to `MCP_MAX_FILE_SIZE_BYTES`) |
| `MCP_FS_TIMEOUT_MS` | `60000` (60s) | Timeout for filesystem read operations (AbortController). Files not read within this time are aborted. |
| `MCP_UNDO_HMAC_KEY` | — | HMAC-SHA256 key for undo entry integrity verification. **When unset, a warning is logged at startup — undo entries are NOT integrity-protected.** |
| `MCP_AUDIT_LOG_PATH` | — | File path for append-only audit log of destructive operations. When unset, audit logs go to structured log only. |
| `MCP_AUDIT_LOG_MAX_BYTES` | `10485760` (10MB) | Maximum audit log file size before rotation. When exceeded, the log is truncated to 80% of max. |

### Semantic Analysis

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_CACHE_DISABLED` | `false` | Disable all caching (`true` = disabled) |
| `MCP_CACHE_TTL` | `5000` | Cache TTL in milliseconds for tree-sitter AST and symbol caches |
| `MCP_CACHE_SIZE` | `100` | Maximum number of cached AST/symbol entries |
| `MCP_SYMBOL_CACHE_SIZE` | `100` | Maximum cached symbol sets |
| `MCP_SYMBOL_CACHE_TTL` | `60000` | Symbol cache TTL in milliseconds |
| `MCP_AST_CACHE_SIZE` | `100` | Maximum cached AST entries |
| `MCP_AST_CACHE_TTL` | `60000` | AST cache TTL in milliseconds |
| `MCP_PRELOAD_LANGUAGES` | `typescript,javascript,python` | Comma-separated list of languages to preload at startup |

### Undo Stack

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_UNDO_STACK_SIZE` | `50` | Maximum undo stack entries |
| `MCP_UNDO_MAX_ENTRY_BYTES` | `1048576` (1MB) | Maximum size per undo entry |
| `MCP_UNDO_PERSIST_DIR` | — | Directory for persistent undo storage. When unset, undo is session-only. |

## API Versioning

Each MCP tool has an independent API version in `MAJOR.MINOR` format:

- **MAJOR**: Breaking changes (removed tool, incompatible schema changes)
- **MINOR**: Non-breaking additions (new optional fields, new outputs)

Tool versions are exposed via `_meta.apiVersion` in tool annotations and in `get_server_stats` output.

## Metrics

### HTTP Endpoint

Enable with `MCP_METRICS_PORT=9090`. Available endpoints:

- `GET /metrics` — Prometheus exposition format
- `GET /health` — JSON health check

### Available Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `mcp_tool_duration_ms` | histogram | `tool`, `operation_type` | Tool execution latency |
| `mcp_tool_invocations_total` | counter | `tool`, `status`, `operation_type` | Total tool invocations |
| `mcp_tool_errors_total` | counter | `tool`, `operation_type` | Tool error count |
| `mcp_tool_rate_limited_total` | counter | `tool`, `scope` | Rate-limited requests |
| `mcp_cache_duration_ms` | histogram | `cache`, `result` | Cache lookup latency (hit/miss) |
| `mcp_circuit_breaker_failure` | counter | `breaker` | Circuit breaker failures |
| `mcp_circuit_breaker_close` | counter | `breaker` | Circuit breaker close events |
| `mcp_circuit_breaker_rejected` | counter | `breaker` | Circuit breaker rejected requests |
| `mcp_audit_operations_total` | counter | `operation`, `actor` | Audit log entries |
| `mcp_uptime_ms` | gauge | — | Process uptime |

### P50/P95 Latency

Histograms expose Prometheus-native `histogram` format with `_bucket{le="..."}` labels, plus `_count` and `_sum`. Default buckets: 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000ms. This enables multi-instance aggregation via `promql` `histogram_quantile()`.

## Circuit Breaker

The tree-sitter parser is protected by a circuit breaker:

- **5 consecutive failures** → OPEN (fail fast for 30 seconds)
- **After 30s** → HALF_OPEN (allows one probe request)
- **1 success** in HALF_OPEN → CLOSED (normal operation)
- **1 failure** in HALF_OPEN → OPEN (restart timer)

## Error Codes

All domain errors carry a numeric `code` field:

| Range | Domain |
|-------|--------|
| 1xxx | Path validation |
| 2xxx | File operations |
| 3xxx | Directory operations |
| 4xxx | Tree-sitter parsing |
| 5xxx | Symbol lookup |
| 6xxx | Undo stack |
| 7xxx | Edit matching |
| 8xxx | File watching |
| 9xxx | Configuration |
| 10xxx | Search operations |
| 11xxx | Rate limiting |
| 12xxx | Audit logging |

## I/O Resilience

Filesystem I/O operations are wrapped with retry logic for transient errors:

- **Retryable errors**: `EAGAIN`, `EBUSY`, `EINTR`, `ENOENT`, `ECONNRESET`, `EPIPE`
- **Default**: 3 attempts, 50ms base delay, 2x backoff, ±20% jitter
- **Max delay**: 1000ms