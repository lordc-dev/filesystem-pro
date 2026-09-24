# AGENTS.md — Filesystem Pro

> Guidance for AI agents working on this codebase.

## Project Overview

Filesystem Pro is an enhanced MCP (Model Context Protocol) filesystem server providing **50 tools** for AI-assisted code editing. It is a security-hardened fork of Anthropic's `@modelcontextprotocol/server-filesystem` (11 → 50 tools). Key capabilities:

- **ripgrep** for fast regex/glob search (~10x faster than Node glob)
- **tree-sitter** for AST-based semantic analysis in 18 languages
- **Full undo stack** with staleness guard and disk persistence
- **MCP Roots Protocol** for filesystem sandboxing
- **Production resilience**: circuit breaker, rate limiter, retry with backoff, atomic writes

Language: **TypeScript** (strict mode). Runtime: **Node.js** (ESM). Package manager: **pnpm**. Build: **esbuild**. Test: **vitest**. Lint: **eslint** (typescript-eslint). Typecheck: `tsc --noEmit`.

## Commands

```bash
pnpm install            # install deps
pnpm run build          # esbuild → dist/
pnpm run build-strict   # typecheck + build
pnpm run clean          # rm -rf dist
pnpm run watch          # tsc --watch
pnpm run typecheck      # tsc --noEmit --skipLibCheck false
pnpm run eslint         # lint check
pnpm run eslint:fix     # lint + autofix
pnpm test               # vitest (watch)
pnpm test:run           # vitest run (CI)
pnpm test:coverage      # vitest with coverage
pnpm run bench          # vitest performance-bench.test.ts
```

## Architecture (High-Level)

```
src/
├── index.ts               Entry: server setup, roots protocol, shutdown, CLI flags
├── constants.ts           SSOT: config defaults, error messages, SupportedLanguage, EXTENSION_LANGUAGE_MAP
├── config/                Runtime config (env > JSON file > defaults), Zod-validated
├── validation/            Path normalization, symlink resolution, roots check, regex/glob validation
├── search/                ripgrep wrapper (PCRE2, byte-limit, concurrent pool, SIGTERM on OOM)
├── semantic/              Tree-sitter: symbol extraction, references, code editor, call hierarchy
│   └── configs/          Per-language node-type configs (18 languages + index.ts)
├── tools/                 8 orchestrator modules → 50 tool implementations (auto-registration)
├── undo/                  Undo stack, staleness guard, composite refactors, disk persistence
├── intelligence/          Intent → tool recommendation engine (tool-selector.ts)
├── operations/            Diff, bulk rename, AGENTS.md project patterns
├── schemas/               Shared Zod schemas (SSOT)
├── file-operations/       Read/write/watch utilities
├── types/                 MCP SDK augmentations (removes `as any`)
├── errors/                BaseError + typed errors (ECODE registry, domain-prefixed)
└── utils/                 Logger, metrics (p50/p95), rate limiter, circuit breaker,
                           concurrency, retry, fs-utils, hash-utils, tool-factory
```

### Tool Registration (Convention-Based)

`src/tools/index.ts` auto-registers all `*-tools.ts` files. Each exports a `register*Tools(context: ToolContext): void` function. **Adding a tool = adding a file + following the pattern — no index edits needed.**

8 orchestrator modules: `file-tools.ts`, `directory-tools.ts`, `search-tools.ts`, `semantic-tools.ts`, `analysis-tools.ts`, `editing-tools.ts`, `undo-tools.ts`, `server-stats-tools.ts`.

### Config Resolution

Resolution priority: **env vars > JSON config file > defaults** (`runtime-config.ts`). Crucially, getters resolve at **call time** (not import time) via `getConfig()`. Changing an env var takes effect without restart. Config is validated with Zod (`RuntimeConfigSchema`).

### Roots Protocol

`rootsManager` (singleton in `validation/roots-manager.ts`) restricts filesystem access to client-declared roots. On by default (`MCP_ROOTS_RESTRICTION=1`). Falls back to unrestricted if client lacks support. Symlinks resolved via `cachedRealpath` (5s TTL LRU) before containment check to prevent traversal attacks.

### Undo System

`undoManager` (singleton, proxied for testability) records pre-mutation content. Files >1MB are not undoable (`MCP_UNDO_MAX_ENTRY_BYTES`). Optional disk persistence via `MCP_UNDO_PERSIST_DIR` (debounced 500ms trailing flush; `flush()` forces immediate write). Staleness guard (`staleness-guard.ts`) rejects edits to files modified outside the session.

### Semantic Module

`initializeSemanticModule()` must be called at startup. `treeSitterManager` lazy-loads grammars. Circuit breaker (`treeSitterBreaker`) protects against repeated parse failures. Two caches: AST cache + symbol cache (both LRU, TTL-based). All symbol finding goes through `symbol-lookup.ts` (SSOT).

### Search

ripgrep is **required** (not optional). `isRipgrepAvailable()` checked at startup. Max 8 concurrent processes (`MAX_CONCURRENT_RG`), 10s timeout default (`RG_TIMEOUT_MS`), SIGTERM on OOM. Arg length capped at 128KB (`MAX_RG_ARGS_BYTES`, CWE-400 mitigation).

### Resilience Layer

- **Circuit breaker** (`circuit-breaker.ts`) — protects tree-sitter from repeated failures
- **Rate limiter** (`rate-limiter.ts`) — token bucket per tool (60/min default), configurable via env
- **Retry** (`retry.ts`) — exponential backoff with jitter for transient I/O (`EAGAIN`, `EBUSY`, `EINTR`, `ENOENT`, `EPERM`)
- **Atomic writes** (`fs-utils.ts`) — temp file + rename; never leaves broken files. fsync configurable via `MCP_WRITE_FSYNC` (default on; `0` skips fsync, rename stays atomic)

## Coding Conventions

### SSOT (Single Source of Truth)

- **Constants** live in `constants.ts` — no duplicate magic numbers/strings
- **Error messages** use `ERROR_MESSAGES` factories in `constants.ts`
- **Schemas** live in `schemas/index.ts` — reuse, don't redeclare
- **Error codes** use `ECODE` registry in `errors/index.ts` — domain-prefixed numeric codes
- **Language map** is `EXTENSION_LANGUAGE_MAP` — never create local copies

### Style

- **Strict TypeScript** — `tsc --noEmit --skipLibCheck false` must pass with 0 errors
- **ESLint** — `typescript-eslint`, 0 warnings tolerance (`pnpm run eslint`)
- **ESM** — `.js` extensions in imports (NodeNext resolution)
- **No comments** unless explaining non-obvious intent
- **Type augmentation** over `as any` — see `types/mcp-sdk-augmentation.ts`
- **Getter functions** for config — never read env vars directly outside `runtime-config.ts`
- **Barrel exports** — each module exposes an `index.ts`
- **Singletons** — `undoManager`, `rootsManager`, `rateLimiter`, `treeSitterManager`, `toolSelector` (all via Proxy or module-level instances for testability)

### Adding a New Tool

1. Create `src/tools/<category>-<tool-name>.ts` implementing the tool handler
2. Register in the appropriate `*-tools.ts` orchestrator (or add to its import list)
3. Add Zod schemas to `schemas/index.ts` if input/output is complex
4. Add error codes to `ECODE` if new error domain
5. Add to `TOOL_MATRIX` in `intelligence/tool-selector.ts` for intent routing
6. Test with vitest; ensure `pnpm run typecheck && pnpm run eslint` pass

### Testing

- Tests live alongside source (vitest convention). Use `*.test.ts` suffix.
- `setUndoManager()` / `setRateLimiter()` / `resetConfig()` available for injection/mocks.
- Property-based testing via `fast-check` (available devDep).

## Security Constraints

- **Never** disable roots restriction in production (`MCP_ROOTS_RESTRICTION=0` is dev-only)
- **Always** resolve symlinks before path validation (`cachedRealpath`)
- **Never** bypass the staleness guard — it prevents silent overwrites
- **Atomic writes only** — use `atomicWrite` from `utils/fs-utils.ts`
- **Rate limit** every tool — use `rateLimiter` wrapper
- **Validate** all user inputs with Zod schemas before processing
- **Cap** ripgrep arg length at 128KB (CWE-400)
- **Reject** paths outside roots after symlink resolution

## Dependencies (Key)

- `@modelcontextprotocol/sdk` — MCP protocol
- `web-tree-sitter` + 19 `tree-sitter-*` grammars — AST analysis
- `zod` — schema validation
- `chokidar` — file watching
- `picomatch` — glob matching
- `diff` — unified diff generation (`diff-operations.ts`)

## Do NOT

- Don't add new runtime deps without strong justification — prefer native Node APIs
- Don't read env vars outside `config/runtime-config.ts` — use `getConfig()`
- Don't create local language/extension maps — use `EXTENSION_LANGUAGE_MAP`
- Don't hardcode error messages — use `ERROR_MESSAGES` factories
- Don't use `as any` — add proper type augmentations in `types/`
- Don't commit `dist/` — it's built artefact
- Don't edit files without backup first (use `backup-pro_create_backup`)
- Don't skip `dryRun: true` on semantic edit operations (rename/replace/extract)
