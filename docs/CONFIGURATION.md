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

### `.env` File

At startup, the server loads a `.env` file from the project root via [dotenv](https://github.com/motdotla/dotenv). This is a convenience for local development — it lets you set env vars without modifying your MCP client config or shell profile.

```bash
cp .env.example .env
```

**Resolution priority** (highest to lowest):

1. **Env vars** set in the MCP client config or shell (e.g. `export MCP_ROOTS_RESTRICTION=false` to disable)
2. **`.env` file** in the project root (loaded at startup by dotenv)
3. **`MCP_CONFIG_FILE`** JSON config file (merged before env var overrides)
4. **Defaults** in `constants.ts`

> The `.env` file is gitignored and never committed. Use `.env.example` as a template.

### JSON Config File (optional)

For complex setups, you can point `MCP_CONFIG_FILE` to a JSON file. It is merged with defaults **before** env var overrides are applied.

```json
{
  "roots": { "enabled": true },
  "cache": { "symbolCacheSize": 200, "symbolCacheTtlMs": 120000 },
  "undo": { "maxStackSize": 200, "persistDir": "/tmp/mcp-undo" },
  "search": { "maxResults": 200, "excludeDirs": ["node_modules", "dist"], "maxOutputBytes": 2097152 },
  "fileRead": { "maxFileSizeBytes": 52428800 },
  "stalenessGuard": { "enabled": true },
  "debug": false
}
```

In most cases `.env` is simpler and sufficient — prefer it over the JSON file.

## Environment Variables

### Debug

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_DEBUG` | `false` | Enable verbose debug logging (`true` = enabled) |
| `DEBUG_MCP` | `false` | Alias for `MCP_DEBUG` (`true` = enabled) |
| `DEBUG` | `false` | Generic debug flag (`true` = enabled) |
| `MCP_CONFIG_FILE` | — | Path to JSON config file (see above) |

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
| `MCP_ROOTS_RESTRICTION` | `true` | Path restriction to root directories. Set `false` to disable. **ON by default.** |
| `MCP_STALENESS_GUARD` | `true` | Staleness guard for undo fingerprint tracking. Set `false` to disable. **ON by default.** |
| `MCP_RG_TIMEOUT_MS` | `10000` | Ripgrep execution timeout in milliseconds |
| `MCP_MAX_CONCURRENT_RG` | `8` | Maximum concurrent ripgrep processes |
| `MCP_MAX_FILE_SIZE_BYTES` | `52428800` (50MB) | Maximum file size for read and write operations |
| `MCP_FS_TIMEOUT_MS` | `60000` (60s) | Timeout for filesystem read operations (AbortController). Files not read within this time are aborted. |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `2097152` (2MB) | Maximum output bytes for search results |

### Semantic Analysis (tree-sitter)

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_CACHE_DISABLED` | `false` | Disable all caching (`true` = disabled) |
| `MCP_SYMBOL_CACHE_SIZE` | `100` | Maximum cached symbol sets |
| `MCP_SYMBOL_CACHE_TTL` | `60000` | Symbol cache TTL in milliseconds |
| `MCP_AST_CACHE_SIZE` | `25` | Maximum cached AST entries |
| `MCP_AST_CACHE_TTL` | `60000` | AST cache TTL in milliseconds |

### Undo Stack

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_UNDO_STACK_SIZE` | `100` | Maximum undo stack entries |
| `MCP_UNDO_MAX_ENTRY_BYTES` | `1000000` (1MB) | Maximum size per undo entry |
| `MCP_UNDO_PERSIST_DIR` | — | Directory for persistent undo storage. When unset, undo is session-only. |

## API Versioning

Each MCP tool exposes its version via `_meta.apiVersion` and in `get_server_stats` output. The version is derived from `package.json` and follows semver:

- **MAJOR**: Breaking changes (removed tool, incompatible schema changes)
- **MINOR**: Non-breaking additions (new optional fields, new outputs)

## Metrics (in-memory)

Metrics are collected in-memory and exposed via the `get_server_stats` MCP tool. There is no HTTP endpoint — all observability goes through the tool interface.

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
| `mcp_uptime_ms` | gauge | — | Process uptime |

Histograms expose p50 and p95 percentiles plus bucket counts. Default buckets: 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000ms.

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