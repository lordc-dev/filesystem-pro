# ARCHITECTURE.md — Filesystem Pro

> Deep architecture reference for contributors and AI agents.
> For agent-facing rules, see [AGENTS.md](./AGENTS.md). For end-user docs, see [README.md](./README.md).

## Contents

- [1. Overview](#1-overview)
- [2. Module Map](#2-module-map)
- [3. Server Lifecycle](#3-server-lifecycle)
- [4. Configuration System](#4-configuration-system)
- [5. Roots Protocol & Path Validation](#5-roots-protocol--path-validation)
- [6. Tool Registration System](#6-tool-registration-system)
- [7. Search Subsystem (ripgrep)](#7-search-subsystem-ripgrep)
- [8. Semantic Subsystem (tree-sitter)](#8-semantic-subsystem-tree-sitter)
- [9. Undo System](#9-undo-system)
- [10. Resilience Layer](#10-resilience-layer)
- [11. Error & Schema SSOT](#11-error--schema-ssot)
- [12. Intelligence Layer](#12-intelligence-layer)
- [13. Security Model](#13-security-model)
- [14. Data Flow Diagrams](#14-data-flow-diagrams)
- [15. Extension Points](#15-extension-points)

---

## 1. Overview

Filesystem Pro is a **50-tool MCP filesystem server** built as a security-hardened, modular fork of Anthropic's `@modelcontextprotocol/server-filesystem`. The server speaks the [Model Context Protocol](https://modelcontextprotocol.io) over stdio and exposes tools that AI agents (Claude, Cursor, OpenCode, etc.) invoke to read, search, edit, and reason about source code.

### Design Principles

| Principle                         | Implementation                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **SSOT (Single Source of Truth)** | `constants.ts`, `schemas/index.ts`, `errors/index.ts` are authoritative. No duplicates.                             |
| **Convention over configuration** | `src/tools/*-tools.ts` are auto-discovered; new tools need no index edits.                                          |
| **Runtime-resolved config**       | Env vars and config file read at call time via `getConfig()` — never at import time.                                |
| **Defensive by default**          | Roots Protocol ON, staleness guard ON, rate limit ON, atomic writes mandatory.                                      |
| **Testable singletons**           | `undoManager`, `rateLimiter`, `treeSitterManager`, `toolSelector` are proxied; `set*()` / `reset*()` for injection. |
| **Fail fast, fail loud**          | Strict TS, 0 ESLint warnings, Zod-validated config, typed errors with `ECODE` registry.                             |

### Stack

- **Language:** TypeScript (strict), ESM, `.js` import extensions (NodeNext).
- **Runtime:** Node.js (ESM).
- **Build:** esbuild (single-file bundle → `dist/index.js`).
- **Typecheck:** `tsc --noEmit --skipLibCheck false` (strict).
- **Lint:** eslint + typescript-eslint (0 warnings tolerance).
- **Test:** vitest (co-located `*.test.ts`); `fast-check` for property-based tests.
- **Package manager:** pnpm.

---

## 2. Module Map

```
src/
├── index.ts                  Entry point: CLI flags, McpServer setup, roots wiring, shutdown
├── constants.ts              SSOT: defaults, error message factories, SupportedLanguage, EXTENSION_LANGUAGE_MAP
│
├── config/
│   ├── index.ts              Barrel + config getters (isRootsRestrictionEnabled, shouldLogRootsEvents)
│   └── runtime-config.ts     loadConfig() / getConfig() / resetConfig(); env > file > defaults; Zod-validated
│
├── validation/
│   ├── index.ts              Barrel
│   ├── path-utils.ts         normalizePath, expandHome, resolvePath, cachedRealpath (LRU 1s TTL), parseFileUri
│   ├── path-validation.ts    validatePath (orchestrates path-utils + roots)
│   ├── roots-manager.ts      RootsManager singleton; setRoots(), isPathAllowedAsync(), validatePathAgainstRootsAsync()
│   ├── glob-validation.ts    validateGlobPattern, validateGlobBrackets, formatGlobErrorWithHints
│   ├── regex-validation.ts   validateRegexPattern, formatRegexErrorWithHints
│   └── pattern-validation.ts Pattern validation helpers
│
├── search/                   ripgrep wrapper (REQUIRED, not optional)
│   ├── index.ts              Barrel
│   ├── ripgrep-types.ts      ContentSearchResult, GlobOptions, ContentSearchOptions, etc.
│   ├── ripgrep-args.ts       RipgrepArgsBuilder, rgArgs helper, parseRipgrepLines
│   ├── ripgrep-executor.ts   ensureRipgrep, isRipgrepAvailable, executeRipgrep, executeRipgrepWithLimit
│   │                         - Semaphore(MAX_CONCURRENT_RG=8)
│   │                         - Timeout: RG_TIMEOUT_MS (default 10s, env MCP_RG_TIMEOUT_MS)
│   │                         - Arg length cap: MAX_RG_ARGS_BYTES=128KB (CWE-400)
│   │                         - SIGTERM on timeout/OOM
│   ├── ripgrep-search.ts     searchFiles, searchContent, batchSearchContent, countMatches
│   └── ripgrep-glob.ts       globSearch, listDirectoryWithRipgrep
│
├── semantic/                 tree-sitter AST analysis (19 languages)
│   ├── index.ts              Barrel + initializeSemanticModule() + getSemanticModuleStatus()
│   ├── types.ts              Symbol, SymbolKind, SymbolLocation, SupportedLanguage, EXTENSION_LANGUAGE_MAP
│   ├── tree-sitter-manager.ts Singleton; lazy-loads WASM grammars; AST LRU cache; circuit breaker wrapped
│   ├── grammar-resolver.ts   Resolves grammar WASM paths; SUPPORTED_LANGUAGES list
│   ├── language-config.ts   LANGUAGE_CONFIGS: per-language node-type configs
│   ├── language-config-types.ts NodeTypeConfig, LanguageConfig types
│   ├── configs/              Per-language node-type configs (19 files: typescript, python, go, rust, …)
│   │                         Each exports a config consumed by language-config.ts
│   ├── symbol-extractor.ts   extractSymbols, extractSymbolsFromFile, flattenSymbols, getSymbolBody, getSymbolText
│   ├── symbol-extractor-helpers.ts
│   ├── symbol-lookup.ts      **SSOT** for all symbol finding: findSymbol, findSymbols, findSymbolOrThrow,
│   │                         hasSymbol, lookupSymbols, findSymbolsByKind, getTopLevelSymbols,
│   │                         getSymbolAtPosition, getSymbolChildren, findStringLiterals
│   ├── symbol-matcher.ts     matchPattern, matchesDepth, matchesKind, buildNamePathMap
│   ├── symbol-cache.ts       LRUCache, symbolCache, hashContent, getSymbolCacheStats, clearSymbolCaches
│   ├── reference-finder.ts    findReferences, findReferencesFromDefinition, getSearchableFiles, findUnusedSymbols
│   ├── reference-classifier.ts Classifies references: call, import, type, new, assignment, …
│   ├── code-editor.ts        replaceSymbolBody, insertBefore/AfterSymbol, renameSymbol, deleteSymbol
│   ├── code-editor-helpers.ts
│   ├── code-editor-rename.ts
│   ├── code-editor-types.ts
│   ├── call-hierarchy.ts      getCallers, getCallees, countCallers, countCallees
│   ├── deprecated-finder.ts   findDeprecatedSymbolsInFile, findDeprecatedUsages, formatDeprecatedUsagesReport
│   ├── file-stats.ts          getFileStats, batchGetFileStats, getFileSummary, countTotalSymbols
│   ├── import-analyzer.ts     extractImports, findDependents, findRelatedTests, findUnusedImports (delegates to TS/Python/Kotlin analyzers)
│   ├── import-types.ts
│   ├── ts-import-analyzer.ts  TS/JS/TSX/JSX import extraction
│   ├── python-import-analyzer.ts Python import extraction
│   ├── kotlin-import-analyzer.ts Kotlin import extraction
│   ├── string-literal-finder.ts findStringLiterals, findStringIdentifiers
│   └── unused-symbol-finder.ts findUnusedSymbols (cross-file dead code)
│
├── tools/                    8 orchestrator modules → 50 tool implementations
│   ├── index.ts              registerAllTools(ctx); convention-based auto-discovery of *-tools.ts
│   ├── types.ts              ToolContext, ToolFactories, ToolRegistrar
│   ├── file-tools.ts         Orchestrator: read_text_file, read_multiple_files, read_media_file, write_file, edit_file, delete_file, delete_path
│   ├── file-read.ts          read_text_file / read_media_file / read_multiple_files handlers
│   ├── file-write.ts         write_file / edit_file handlers
│   ├── directory-tools.ts    Orchestrator: create, list, move, delete, get_info, watch, allowed
│   ├── directory-create.ts, directory-delete.ts, directory-get-info.ts, directory-list.ts,
│   │   directory-move.ts, directory-watch.ts, directory-allowed.ts, directory-helpers.ts
│   ├── search-tools.ts       Orchestrator: search_files, find_by_glob, search_content, count_matches, diff_files, bulk_rename, get_project_patterns
│   ├── search-content.ts, search-files.ts, search-glob.ts, search-count.ts, search-diff.ts,
│   │   search-bulk-rename.ts, search-patterns.ts
│   ├── semantic-tools.ts     Orchestrator: get_symbols_overview, find_symbol, find_symbol_references, find_unused_symbols,
│   │                         find_deprecated_usages, find_string_literals
│   ├── semantic-find-symbol.ts, semantic-find-symbol-references.ts, semantic-find-unused-symbols.ts,
│   │   semantic-find-deprecated-usages.ts, semantic-find-string-literals.ts, semantic-get-symbols-overview.ts
│   ├── analysis-tools.ts     Orchestrator: find_imports, find_dependents, find_related_tests, find_unused_imports,
│   │                         get_callers, get_callees, get_file_stats, get_file_summary
│   ├── analysis-find-imports.ts, analysis-find-dependents.ts, analysis-find-related-tests.ts,
│   │   analysis-find-unused-imports.ts, analysis-get-callers.ts, analysis-get-callees.ts,
│   │   analysis-get-file-stats.ts, analysis-get-file-summary.ts
│   ├── editing-tools.ts      Orchestrator: replace_symbol_body, insert_before/after_symbol, rename_symbol,
│   │                         extract_method, inline_variable, introduce_parameter
│   ├── undo-tools.ts         Orchestrator: undo, undo_peek, undo_all, undo_status
│   └── server-stats-tools.ts Orchestrator: get_server_stats
│
├── undo/
│   ├── index.ts              Barrel
│   ├── undo-manager.ts       UndoManager (Proxy singleton); record/recordBatch/undo/undoAll/peek/clear; debounced persistence (500ms)
│   ├── staleness-guard.ts    StalenessGuard singleton; fingerprints (mtimeMs, size); rejects stale writes
│   ├── undo-persistence.ts   loadFromDisk, saveToDisk, ensurePersistDir (atomic)
│   ├── composite-refactors.ts Composite refactor tracking (multi-step operations)
│   ├── extract-method.ts     Undo integration for extract_method
│   ├── inline-variable.ts    Undo integration for inline_variable
│   └── introduce-parameter.ts Undo integration for introduce_parameter
│
├── intelligence/
│   └── tool-selector.ts      ToolSelector singleton; TOOL_MATRIX (50 tools), INTENT_PATTERNS; recommendTools(intent)
│
├── operations/
│   ├── bulk-rename-operations.ts  Regex-based batch rename
│   ├── diff-operations.ts         File diff (unified/side-by-side/inline)
│   └── project-patterns.ts        AGENTS.md pattern parser (get_project_patterns tool)
│
├── schemas/
│   └── index.ts              Shared Zod schemas (SSOT): PathSchema, SymbolSchema, ImportInfoSchema, CallerInfoSchema, etc.
│
├── file-operations/
│   ├── index.ts              Barrel
│   ├── read-utils.ts         Read helpers (size check, encoding)
│   ├── write-utils.ts        Write helpers (atomic write integration)
│   ├── directory-utils.ts   Directory traversal helpers
│   └── watch-utils.ts       watcherManager (chokidar), watchDirectory, stopWatching, removeAllWatchers
│
├── types/
│   ├── mcp-sdk-augmentation.ts   Type augmentations for MCP SDK internals (removes `as any`)
│   ├── mcp-sdk-augmentation.d.ts Ambient declarations
│   └── emscripten.d.ts           Emscripten types (web-tree-sitter dependency)
│
├── errors/
│   └── index.ts              ECODE registry (domain-prefixed numeric codes), BaseError, typed errors,
│                              ERROR_MESSAGE map
│
└── utils/
    ├── index.ts              Barrel
    ├── logger.ts             Structured logger (console + JSON when MCP_STRUCTURED_LOGS=true)
    ├── metrics.ts            Counters, histograms (p50/p95), gauges; getMetrics(), resetMetrics()
    ├── rate-limiter.ts       RateLimiter singleton (token bucket per tool + global); loadRateLimitsFromEnv
    ├── circuit-breaker.ts    CircuitBreaker class; treeSitterBreaker singleton
    ├── retry.ts              withRetry (exponential backoff + jitter); DEFAULT_RETRY_CONFIG
    ├── concurrency.ts        Semaphore (used by ripgrep executor)
    ├── fs-utils.ts           atomicWrite (temp + rename; fsync via MCP_WRITE_FSYNC, default on)
    ├── hash-utils.ts         fnv1a, fnv1aBase36 (content hashing for cache keys)
    ├── text-utils.ts         normalizeLineEndings, formatSize, escapeRegex
    ├── tool-factory.ts       setupToolFactories, ToolFactories, ANNOTATION_PRESETS
    ├── response-helpers.ts   SSOT response formatters: textResponse, jsonResponse, semanticOperationResponse, …
    ├── error-formatters.ts   formatValidationError
    ├── safe-execute.ts       safeExecute wrapper (SafeResult)
    └── api-version.ts        API_VERSION_STRING
```

---

## 3. Server Lifecycle

`src/index.ts` orchestrates startup in this order:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Parse CLI flags (--help, --version, --show-config) — SYNC        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Create McpServer instance                                        │
│    - Setup tool factories (setupToolFactories)                      │
│    - registerAllTools({ server, factories }) — eager imports        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. runServer() async init:                                          │
│    a. loadConfig()         — reads MCP_CONFIG_FILE if set            │
│    b. --show-config exit   — print resolved config & exit            │
│    c. loadRateLimitsFromEnv()                                       │
│    d. isRipgrepAvailable() — warn if missing                        │
│    e. undoManager.initialize() — loads persisted stack if dir set   │
│    f. initializeSemanticModule() — tree-sitter init + preload        │
│    g. server.connect(new StdioServerTransport())                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Roots Protocol setup (if MCP_ROOTS_RESTRICTION != 0):           │
│    a. setNotificationHandler(RootsListChangedNotificationSchema)    │
│    b. setTimeout(refreshRoots, 100ms) — initial request             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Debug/status logging:                                            │
│    - isDebugMode() → toolSelector.generateStatusReport()            │
│    - Warn if roots restriction disabled                             │
│    - Warn if staleness guard disabled                               │
│    - Log startup summary { version, roots, staleness, debug, undo } │
└─────────────────────────────────────────────────────────────────────┘
```

**Shutdown:** `SIGINT`/`SIGTERM` → `watcherManager.removeAllWatchers()` → `process.exit(0)`.

### Server version

`__SERVER_VERSION__` is injected by esbuild at build time (defined in `esbuild.config.mjs`).

---

## 4. Configuration System

### Resolution Priority (highest → lowest)

```
┌──────────────────────────────────────────────────┐
│ 1. Environment variables                         │  ← Highest priority
│    (MCP_ROOTS_RESTRICTION, MCP_STALENESS_GUARD, │
│     MCP_SYMBOL_CACHE_SIZE, MCP_RG_TIMEOUT_MS, …)│
└──────────────────────────────────────────────────┘
                    ▼ overrides
┌──────────────────────────────────────────────────┐
│ 2. JSON config file (MCP_CONFIG_FILE path)       │
│    Deep-merged with defaults via deepMerge()      │
└──────────────────────────────────────────────────┘
                    ▼ overrides
┌──────────────────────────────────────────────────┐
│ 3. Defaults (getDefaultConfig() in runtime-config)│  ← Lowest priority
│    Defaults mirror constants.ts values            │
└──────────────────────────────────────────────────┘
```

### Call-Time Resolution (Critical Design Decision)

```typescript
// ❌ WRONG — freezes config at import time
const maxResults = getConfig().search.maxResults;  // stale if env changes

// ✅ CORRECT — resolves at call time
function search() {
  const max = getConfig().search.maxResults;  // always fresh
  ...
}
```

`getConfig()` returns the cached `resolvedConfig` singleton, but `applyEnvOverrides()` is applied lazily on first access — so config works even if `loadConfig()` hasn't run yet. After `loadConfig()` resolves, the file-merged config replaces the lazy default.

### Validation

`RuntimeConfigSchema` (Zod) validates the merged config. If validation fails, the server logs a warning and falls back to the pre-validation config — **never crashes**.

### Env Vars → Config Mapping

| Env Var                       | Config Path                 | Default                            |
| ----------------------------- | --------------------------- | ---------------------------------- |
| `MCP_ROOTS_RESTRICTION`       | `roots.enabled`             | `true`                             |
| `MCP_STALENESS_GUARD`         | `stalenessGuard.enabled`    | `true`                             |
| `MCP_CACHE_DISABLED`          | `cache.disabled`            | `false`                            |
| `MCP_SYMBOL_CACHE_SIZE`       | `cache.symbolCacheSize`     | `100`                              |
| `MCP_SYMBOL_CACHE_TTL`        | `cache.symbolCacheTtlMs`    | `60000`                            |
| `MCP_AST_CACHE_SIZE`          | `cache.astCacheSize`        | `25`                               |
| `MCP_AST_CACHE_TTL`           | `cache.astCacheTtlMs`       | `60000`                            |
| `MCP_UNDO_STACK_SIZE`         | `undo.maxStackSize`         | `100`                              |
| `MCP_UNDO_MAX_ENTRY_BYTES`    | `undo.maxEntrySizeBytes`    | `1_000_000`                        |
| `MCP_UNDO_PERSIST_DIR`        | `undo.persistDir`           | `""`                               |
| `MCP_MAX_FILE_SIZE_BYTES`     | `fileRead.maxFileSizeBytes` | `52_428_800` (50MB)                |
| `MCP_WRITE_FSYNC`             | `write.fsync`               | `true`                             |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `search.maxOutputBytes`     | `2_097_152` (2MB)                  |
| `DEBUG_MCP` / `MCP_DEBUG`     | `debug`                     | `false`                            |
| `MCP_RATE_LIMIT_<TOOL>`       | Per-tool rate limit         | `maxTokens:tokensPerMinute` format |

### Reset (for tests)

`resetConfig()` clears the singleton, forcing the next `getConfig()` / `loadConfig()` to re-resolve.

---

## 5. Roots Protocol & Path Validation

### Roots Protocol (MCP 2025-06-18 spec)

The [Roots Protocol](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) lets the MCP client declare which filesystem directories the server is allowed to touch.

```
┌──────────────┐  listRoots()   ┌───────────────┐
│  MCP Client  │ ◄────────────►│  Server       │
│ (Claude, etc)│                │ rootsManager  │
└──────────────┘                └───────────────┘
       │                              │
       │ rootsListChanged notif       │ setRoots(roots)
       └──────────────────────────────►│
                                      │
                                      ▼
                              ┌──────────────────┐
                              │ isPathAllowed()  │
                              │ (per operation)  │
                              └──────────────────┘
```

**`RootsManager`** (`validation/roots-manager.ts`):

- Singleton (`rootsManager`).
- `setRoots(roots)` — async; parses `file://` URIs via SSOT `parseFileUri`; resolves to absolute paths.
- `isPathAllowedAsync(targetPath)` — **resolves symlinks** via `cachedRealpath` (1s TTL LRU) before checking containment. Prevents symlink traversal attacks.
- `restrictToRoots` only true when ≥1 valid root exists; otherwise unrestricted mode.
- `clearRoots()` returns to unrestricted.

**Feature gate:** `isRootsRestrictionEnabled()` reads `getConfig().roots.enabled`. If `MCP_ROOTS_RESTRICTION=0`, roots are ignored entirely.

**OpenCode note:** OpenCode v1.15.x doesn't implement Roots Protocol — server logs `[Roots] Client doesn't support roots protocol - running in unrestricted mode`.

### Path Validation Flow

```
validatePath(targetPath)
        │
        ▼
┌─────────────────────────────────┐
│ normalizePath / expandHome       │
│ resolvePath                     │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ cachedRealpath (symlink resolve)│
│ - LRU cache, 1s TTL             │
│ - Catches EACCES/EPERM safely    │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ validatePathAgainstRootsAsync() │
│ - Throws PathValidationError     │
│   (ECODE.PATH_TRAVERSAL) if     │
│   outside roots                  │
└─────────────────────────────────┘
        │
        ▼
   Validated path
```

### Symlink Security

`cachedRealpath` resolves symlinks **before** the roots containment check. Without this, a symlink inside a root pointing outside would bypass the sandbox. The 1s TTL LRU cache avoids repeated `fs.realpath()` syscalls while keeping the TOCTOU window minimal (reduced from 5s in a security audit).

---

## 6. Tool Registration System

### Convention-Based Auto-Discovery

`src/tools/index.ts`:

```typescript
const TOOL_MODULES = [
  import("./file-tools.js"),
  import("./directory-tools.js"),
  // ... 8 total
];

// Scans each module for exports matching /^register.*Tools$/
// and registers them in a REGISTRY Map.
```

**Adding a new tool category:**

1. Create `src/tools/<category>-tools.ts` exporting `register<Category>Tools(context: ToolContext): void`
2. Add to `TOOL_MODULES` array (or rely on eager imports)
3. Done — `registerAllTools()` picks it up

**Adding a new tool to an existing category:**

1. Create `src/tools/<category>-<tool-name>.ts` with the handler
2. Import and register in the category's `*-tools.ts` orchestrator

### ToolContext

```typescript
interface ToolContext {
  server: McpServer;
  factories: ToolFactories; // from setupToolFactories()
}
```

### Tool Factories (`utils/tool-factory.ts`)

`setupToolFactories(server)` returns factories that wrap `server.registerTool()` with:

- Zod schema validation
- Rate limiting (per-tool token bucket)
- Staleness guard integration
- Undo recording (for destructive ops)
- Standardized response formatting (via `response-helpers.ts`)
- Annotations (read-only hint, destructive hint, idempotent hint)

`ANNOTATION_PRESETS` provide standard MCP tool annotations.

### 8 Orchestrator Modules

| Module                  | Tools  | Category                                                                     |
| ----------------------- | ------ | ---------------------------------------------------------------------------- |
| `file-tools.ts`         | 7      | read/write/delete                                                            |
| `directory-tools.ts`    | 9      | list/create/move/delete/watch                                                |
| `search-tools.ts`       | 7      | ripgrep search + diff + rename                                               |
| `semantic-tools.ts`     | 6      | symbol extraction/references/unused/deprecated                               |
| `analysis-tools.ts`     | 8      | imports/dependents/tests/callers/callees/stats                               |
| `editing-tools.ts`      | 6      | AST-based refactors                                                          |
| `undo-tools.ts`         | 4      | undo/peek/all/status                                                         |
| `server-stats-tools.ts` | 1      | get_server_stats                                                             |
| **Total**               | **48** | + `list_allowed_directories` + `watch_directory` + `stop_watching` = **~50** |

---

## 7. Search Subsystem (ripgrep)

### Why ripgrep is REQUIRED

ripgrep is ~10x faster than Node.js glob for file discovery and supports PCRE2 regex. The server treats it as a hard dependency — search tools throw `RipgrepNotFoundError` if unavailable. `isRipgrepAvailable()` is checked at startup (warns, doesn't crash).

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ search/                                                      │
│                                                              │
│  ripgrep-args.ts          ripgrep-executor.ts                 │
│  ┌──────────────────┐     ┌──────────────────────────────┐    │
│  │ RipgrepArgsBuilder│   │ ensureRipgrep()               │    │
│  │ - adds --json     │    │ - which rg / candidate paths  │    │
│  │ - adds -N          │   │ - cached path                 │    │
│  │ - adds excludes    │   │ - PCRE2 detection             │    │
│  │ - adds file types  │   │ executeRipgrep(args, pcre2)   │    │
│  └──────────────────┘     │ - Semaphore(8) concurrency    │    │
│           │                │ - Timeout 10s → SIGTERM       │    │
│           ▼                │ - Arg cap 128KB (CWE-400)    │    │
│  ripgrep-search.ts         │ executeRipgrepWithLimit()    │    │
│  - searchFiles             │ - byte-bounded output         │    │
│  - searchContent           │ - kills on maxBytes exceeded │    │
│  - batchSearchContent      └──────────────────────────────┘    │
│  - countMatches                                               │
│                                                              │
│  ripgrep-glob.ts                                             │
│  - globSearch (uses rg --files)                              │
│  - listDirectoryWithRipgrep                                  │
└─────────────────────────────────────────────────────────────┘
```

### Concurrency & Limits

| Limit                            | Value     | Env Override                    |
| -------------------------------- | --------- | ------------------------------- |
| Max concurrent ripgrep processes | 8         | `MCP_MAX_CONCURRENT_RG`         |
| Execution timeout                | 10,000 ms | `MCP_RG_TIMEOUT_MS`             |
| Max total arg length             | 128 KB    | hardcoded (`MAX_RG_ARGS_BYTES`) |
| Max search output                | 2 MB      | `MCP_MAX_SEARCH_OUTPUT_BYTES`   |

`Semaphore` (from `utils/concurrency.ts`) gates concurrent spawns. On timeout, `SIGTERM` is sent; the promise rejects with a timeout error.

### PCRE2 Detection

`requiresPCRE2(pattern)` detects lookahead/lookbehind, named groups, backreferences. If PCRE2 needed but unavailable, throws. PCRE2 support is cached after first check.

### Output Truncation

`executeRipgrepWithLimit(args, maxBytes)` kills the process when output exceeds `maxBytes`, returning truncated results. Used by content search to respect `MCP_MAX_SEARCH_OUTPUT_BYTES`.

---

## 8. Semantic Subsystem (tree-sitter)

### Initialization

`initializeSemanticModule()` (`semantic/index.ts`) → `treeSitterManager.initialize()`:

1. `await Parser.init()` — loads WASM runtime
2. Creates `Parser` instance
3. Preloads 5 languages: typescript, javascript, tsx, jsx, python
4. Other 14 languages lazy-load on first use

### TreeSitterManager (Singleton)

```
┌─────────────────────────────────────────────────────┐
│ TreeSitterManager (singleton, class-level instance) │
│                                                     │
│  Parser instance (web-tree-sitter)                  │
│  Languages Map<SupportedLanguage, Language>         │
│  GrammarResolver — resolves WASM paths              │
│                                                     │
│  AST Cache (LRU):                                   │
│  - Size: MCP_AST_CACHE_SIZE (25)                   │
│  - TTL:  MCP_AST_CACHE_TTL_MS (60s)                │
│  - Key: `${language}:${fnv1a(content)}`            │
│  - Eviction: oldest entry when full                 │
│                                                     │
│  parse(source, language) → Tree                     │
│  parseFile(filePath, content) → {tree, language}    │
│                                                     │
│  Circuit breaker wraps all parse calls:             │
│  treeSitterBreaker.execute(() => _parse(...))       │
└─────────────────────────────────────────────────────┘
```

### Symbol Extraction Pipeline

```
Source code
    │
    ▼
treeSitterManager.parse(content, language)  ← circuit breaker protected
    │
    ▼ AST (Tree)
    │
symbol-extractor.ts
extractSymbols(tree, language)
    │
    │  Walks AST using LANGUAGE_CONFIGS[language]
    │  Each config maps node types → SymbolKind
    │  Builds Symbol tree (recursive children)
    │
    ▼ Symbol[]
    │
symbol-lookup.ts (SSOT for all finding)
    │
    ├── findSymbol(symbols, pattern, opts)      ← exact or wildcard
    ├── findSymbols(symbols, pattern, opts)     ← multiple matches
    ├── findSymbolOrThrow(...)                  ← throws SymbolNotFoundError
    ├── hasSymbol(...)                           ← boolean
    ├── lookupSymbols(symbols, namePaths[])     ← batch lookup via Map
    ├── findSymbolsByKind(symbols, kinds[])     ← filter by SymbolKind
    ├── getTopLevelSymbols(symbols)             ← depth=0 only
    ├── getSymbolAtPosition(symbols, line, col) ← smallest containing range
    ├── getSymbolChildren(symbols, parentPath)  ← direct children
    └── findStringLiterals(...)                 ← delegates to string-literal-finder
```

### Symbol Cache

`symbolCache` (`semantic/symbol-cache.ts`):

- LRU cache keyed by `fnv1a(content)`
- Size: `MCP_SYMBOL_CACHE_SIZE` (100)
- TTL: `MCP_SYMBOL_CACHE_TTL_MS` (60s)
- `clearSymbolCaches()` for invalidation
- `getSymbolCacheStats()` for monitoring

### Code Editing (AST-based)

`semantic/code-editor.ts` provides:

- `replaceSymbolBody(filePath, content, namePath, newBody)` — preserves signature
- `insertBeforeSymbol` / `insertAfterSymbol` — AST-positioned insertion
- `renameSymbol(filePath, content, namePath, newName, searchPath)` — cross-file rename via ripgrep + AST
- `deleteSymbol` — remove symbol

These integrate with the undo system (`undo/composite-refactors.ts`, `undo/extract-method.ts`, etc.) to record pre-mutation state.

### Reference Finding

`reference-finder.ts`:

1. Extract symbols from definition file (AST)
2. Build search patterns from symbol names
3. Use ripgrep to find occurrences across files
4. `reference-classifier.ts` classifies each: `call`, `import`, `type`, `new`, `assignment`, `property`, `argument`, `return`, `declaration`, `extends`, `implements`, `decorator`, `jsx`, `unknown`
5. `findUnusedSymbols` — symbols with zero non-definition references = dead code

### Call Hierarchy

`call-hierarchy.ts`:

- `getCallers(filePath, namePath, searchPath)` — upstream: who calls this function?
- `getCallees(filePath, namePath)` — downstream: what does this function call?
- Uses AST to extract call expressions, ripgrep to find call sites across files

### Supported Languages (19)

TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift.

Per-language configs in `semantic/configs/<lang>.ts` map tree-sitter node types to `SymbolKind`.

---

## 9. Undo System

### UndoManager (Proxy Singleton)

```
┌─────────────────────────────────────────────────────────────┐
│ undoManager (Proxy → _undoManager, swappable for tests)    │
│                                                             │
│  Stack: UndoEntry[]                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ UndoEntry {                                             ││
│  │   filePath: string                                      ││
│  │   previousContent: string | null                       ││
│  │   timestamp: number                                    ││
│  │   description: string                                   ││
│  │ }                                                       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Max size: MCP_UNDO_STACK_SIZE (100)                        │
│  Max entry: MCP_UNDO_MAX_ENTRY_BYTES (1MB)                  │
│  Files >1MB: not undoable (stored as null → unlink on undo) │
│                                                             │
│  record(filePath, description)     ← before each mutation   │
│  recordBatch(entries[])            ← before multi-file ops  │
│  undo(count=1)                     ← splice + reverse       │
│  undoAll()                        ← undo(stack.length)      │
│  peek(count=5)                    ← preview without apply   │
│  clear()                          ← empty stack             │
│                                                             │
│  Persistence (optional):                                    │
│  - MCP_UNDO_PERSIST_DIR → save stack to disk                │
│  - Atomic writes (temp + rename)                            │
│  - Debounced 500ms trailing flush; flush() forces write    │
│  - Loaded on initialize()                                  │
└─────────────────────────────────────────────────────────────┘
```

### Recording Strategy

```
Before mutation:
  1. Read current file content (catch: null if doesn't exist)
  2. If content > MAX_ENTRY_SIZE (1MB): store null (undo = unlink)
  3. Else: store previousContent directly
  4. Push entry to stack; shift if > maxSize
  5. persist() if persistence enabled (debounced)
```

### Undo Strategy

```
undo(count):
  1. splice(-count) from stack
  2. reverse (undo in reverse order)
  3. For each entry:
     a. previousContent=null → unlink file (was new file or too large)
     b. previousContent present → mkdir -p dirname → atomicWrite → utimes restore
  4. persist()
```

### Staleness Guard

`staleness-guard.ts` prevents silent overwrites:

```
Read operation (read_text_file, read_multiple_files, etc.):
  → stalenessGuard.recordFromPath(filePath)
  → Records { mtimeMs, size } fingerprint

Write operation (write_file, edit_file, replace_symbol_body, etc.):
  → stalenessGuard.checkAndGetError(filePath)
  → If file's mtime/size changed since record → return error
  → Caller rejects the write with "File changed externally" message

After successful write:
  → stalenessGuard.invalidate(filePath)
  → Next read re-populates fingerprint
```

**Bounded memory:** `MAX_FINGERPRINTS = 2000`. Evicts oldest when full.

**Toggle:** `MCP_STALENESS_GUARD=0` disables. When disabled, `checkAndGetError()` returns null immediately.

### Composite Refactors

`undo/composite-refactors.ts` tracks multi-step operations (like `extract_method` which inserts a new function + replaces extracted lines) as a single undo unit.

---

## 10. Resilience Layer

### Circuit Breaker (`utils/circuit-breaker.ts`)

```
States: CLOSED → OPEN → HALF_OPEN → CLOSED

CLOSED:
  - Normal operation
  - Failures increment counter
  - On failureThreshold (5) → OPEN

OPEN:
  - All requests fail fast
  - After resetTimeoutMs (30s) → HALF_OPEN

HALF_OPEN:
  - One probe request allowed
  - Success (≥ halfOpenSuccessThreshold=1) → CLOSED
  - Failure → OPEN
```

**Pre-built instance:** `treeSitterBreaker` — wraps all `treeSitterManager.parse()` and `parseFile()` calls. Prevents cascading failures when tree-sitter WASM repeatedly fails to load or parse.

### Rate Limiter (`utils/rate-limiter.ts`)

**Token bucket per tool + global bucket:**

```
Per-tool bucket:
  - Default: maxTokens=10, tokensPerMinute=60
  - Configurable: MCP_RATE_LIMIT_<TOOL>=maxTokens:tokensPerMinute
  - Refills continuously (refillPerMs = tokensPerMinute / 60000)

Global bucket:
  - maxTokens=30, tokensPerMinute=120
  - Resets if exhausted (creates fresh bucket)

check(toolName):
  1. Per-tool bucket.consume()
  2. If per-tool fails → reject with retryAfterMs
  3. Global bucket.consume()
  4. If global fails → reject (and reset global bucket)
  5. Both pass → allowed
```

**Metrics:** `rate_limited` counter tagged with `{ tool, scope: "tool"|"global" }`.

### Retry (`utils/retry.ts`)

`withRetry(fn, config)` — exponential backoff with jitter for transient I/O:

```typescript
DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 50,
  maxDelayMs: 2000,
  multiplier: 2,
  jitter: 0.2,
  retryableCodes: ["EAGAIN", "EBUSY", "EINTR", "ENOENT", "EPERM"],
};
```

### Atomic Writes (`utils/fs-utils.ts`)

`atomicWrite(filePath, content)`:

1. Write to `filePath + '.tmp.<pid>.<random>'`
2. `handle.sync()` (fsync) — configurable via `MCP_WRITE_FSYNC=0` to skip (rename stays atomic; only crash-durability is traded)
3. `fs.rename(tmp, filePath)` — atomic on POSIX
4. Never leaves a partially-written file

All write operations (write_file, edit_file, undo restore) must use `atomicWrite`.

### Concurrency (`utils/concurrency.ts`)

`Semaphore` — async mutex with permit count. Used by ripgrep executor to cap concurrent processes.

---

## 11. Error & Schema SSOT

### Error Codes (`errors/index.ts`)

Domain-prefixed numeric codes in `ECODE` registry:

| Domain               | Range | Examples                                           |
| -------------------- | ----- | -------------------------------------------------- |
| Path validation      | 1xxx  | `PATH_INVALID` (1001), `PATH_TRAVERSAL` (1002)     |
| File operations      | 2xxx  | `FILE_NOT_FOUND` (2001), `FILE_TOO_LARGE` (2004)   |
| Directory operations | 3xxx  | `DIR_NOT_EMPTY` (3002)                             |
| Tree-sitter          | 4xxx  | `TS_PARSE_FAILED` (4002), `TS_CIRCUIT_OPEN` (4004) |
| Symbol lookup        | 5xxx  | `SYM_NOT_FOUND` (5001)                             |
| Undo                 | 6xxx  | `UNDO_EMPTY` (6001), `UNDO_PERSIST_FAIL` (6003)    |
| Edit                 | 7xxx  | `EDIT_MATCH_FAIL` (7001), `EDIT_CONFLICT` (7002)   |
| Watcher              | 8xxx  | `WATCH_NOT_FOUND` (8001)                           |
| Config               | 9xxx  | `CFG_INVALID` (9001)                               |
| Search               | 10xxx | `SEARCH_TIMEOUT` (10003)                           |
| Rate limiting        | 11xxx | `RATE_EXCEEDED` (11001)                            |
| Audit                | 12xxx | `AUDIT_WRITE` (12001)                              |

`BaseError` preserves cause chain and structured context:

```typescript
class BaseError extends Error {
  readonly code: ErrorCode | undefined;
  readonly context: Record<string, unknown>;
  readonly timestamp: string;
  toJSON(): { name; code; message; context; timestamp; cause };
}
```

Typed subclasses: `PathValidationError`, `FileNotFoundError`, `DirectoryError`, `TreeSitterError`, `SymbolNotFoundError`, `UndoError`, `EditMatchError`, `WatcherError`, `ConfigError`, `SearchError`.

### Error Messages (`constants.ts`)

`ERROR_MESSAGES` — factory functions (not hardcoded strings):

```typescript
ERROR_MESSAGES.symbolNotFound("MyClass/myMethod");
// → "Symbol not found: MyClass/myMethod"
```

### Schemas (`schemas/index.ts`)

Shared Zod schemas — **reuse, don't redeclare**:

- `PathSchema`, `PatternSchema`, `ExcludePatternsSchema`
- `SymbolSchema` (recursive via `z.lazy()`)
- `SymbolKindSchema` (26 enum values)
- `ImportInfoSchema`, `ImportSpecifierSchema`, `DependentFileSchema`, `RelatedTestFileSchema`, `UnusedImportSchema`
- `CallerInfoSchema`, `CalleeInfoSchema`
- `LineStatsSchema`, `SymbolStatsSchema`, `CodeFileStatsSchema`
- `ContentSearchResultSchema` (recursive)
- `ProjectPatternSchema`, `TreeEntrySchema` (recursive)
- `SuccessSchema`, `PathSuccessSchema`, `DualPathSuccessSchema`

---

## 12. Intelligence Layer

### ToolSelector (`intelligence/tool-selector.ts`)

**Purpose:** Map natural-language intent → recommended tools. Used for debug status reporting and future smart routing.

```
┌─────────────────────────────────────────────────────────┐
│ TOOL_MATRIX (50 ToolInfo entries)                       │
│ - name, category, description, capabilities,           │
│   prerequisites, alternatives, readOnly                 │
│                                                         │
│ INTENT_PATTERNS (~30 regex patterns)                    │
│ - /\b(read|view|show).*\b(file|content)\b/i            │
│   → [read_text_file]                                    │
│ - /\b(rename|move).*\b(file|symbol)\b/i                 │
│   → [rename_symbol, move_file, bulk_rename]            │
│ - /\b(caller|upstream|impact.*change)\b/i              │
│   → [get_callers]                                        │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
          │
          ▼
recommendTools(intent: string): ToolRecommendation[]
  - Tests each intent pattern against input
  - Collects matching tools
  - Filters by prerequisites (e.g., ripgrep availability)
  - Returns sorted recommendations with confidence + alternatives
```

**Status report** (`generateStatusReport()`): Shows ripgrep status, tool count, categories, and warns if ripgrep-dependent tools will fail.

---

## 13. Security Model

### Defense in Depth

```
Layer 1: Roots Protocol (filesystem sandbox)
  │ - Client declares allowed directories
  │ - All ops validated against roots
  │ - Symlink-resolved before check (cachedRealpath, 1s TTL LRU)
  │
Layer 2: Path Validation
  │ - normalizePath, expandHome, resolvePath
  │ - Reject paths outside roots (ECODE.PATH_TRAVERSAL)
  │ - EACCES/EPERM safe
  │
Layer 3: Staleness Guard
  │ - Reject edits to externally-modified files
  │ - Prevents silent overwrites
  │
Layer 4: Rate Limiting
  │ - Per-tool token bucket (default 60/min)
  │ - Global bucket (120/min)
  │ - No single tool can hog the server
  │
Layer 5: Input Validation
  │ - Zod schemas for all tool inputs
  │ - Regex/glob pattern validation
  │ - File size limits (50MB read, 2MB search output)
  │
Layer 6: Resource Limits
  │ - ripgrep: 8 concurrent max, 10s timeout, 128KB arg cap (CWE-400)
  │ - Undo: 100 entries max, 1MB per entry, 2000 fingerprints
  │ - Cache: bounded LRU with TTL
  │
Layer 7: Atomic Operations
  │ - All writes via temp + rename
  │ - Never leaves partial files
  │
Layer 8: Circuit Breaker
    - tree-sitter failures trip breaker
    - Prevents cascading failures
```

### Threats Mitigated

| Threat                                                | Mitigation                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Path traversal (`../../etc/passwd`)                   | Roots Protocol + `cachedRealpath` before containment check               |
| Symlink escape (symlink inside root → outside)        | `cachedRealpath` resolves symlinks; LRU cache prevents repeated syscalls |
| Silent overwrite of external changes                  | Staleness guard (mtime + size fingerprint)                               |
| Resource exhaustion (huge files)                      | `MCP_MAX_FILE_SIZE_BYTES` (50MB), `MCP_MAX_SEARCH_OUTPUT_BYTES` (2MB)    |
| Arg bomb (CWE-400)                                    | `MAX_RG_ARGS_BYTES` = 128KB cap on ripgrep args                          |
| Cascading failure (tree-sitter WASM crash)            | Circuit breaker (5 failures → open 30s)                                  |
| Tool abuse                                            | Per-tool rate limiting (60/min default)                                  |
| Race condition (read → edit → another process writes) | Staleness guard rejects edit                                             |
| Partial write (process killed mid-write)              | Atomic write (temp + rename)                                             |

---

## 14. Data Flow Diagrams

### Read Flow

```
Agent → read_text_file(path)
  │
  ▼
validatePath(path) → normalize → cachedRealpath → validatePathAgainstRootsAsync
  │
  ▼
stalenessGuard.recordFromPath(path)  ← record fingerprint
  │
  ▼
fs.readFile(path, 'utf-8')
  │
  ▼
Check MCP_MAX_FILE_SIZE_BYTES
  │
  ▼
Return content (or head/tail if specified)
```

### Edit Flow

```
Agent → edit_file(path, edits, dryRun?)
  │
  ▼
validatePath(path)
  │
  ▼
stalenessGuard.checkAndGetError(path)  ← reject if stale
  │
  ▼
undoManager.record(path, 'edit_file')  ← snapshot before
  │
  ▼
For each edit: find oldText → replace with newText
  │
  ▼
atomicWrite(path, newContent)
  │
  ▼
stalenessGuard.invalidate(path)
  │
  ▼
Return diff (git-style)
```

### Semantic Edit Flow (replace_symbol_body)

```
Agent → replace_symbol_body(path, namePath, newBody, dryRun?)
  │
  ▼
validatePath(path)
  │
  ▼
treeSitterManager.parseFile(path, content)  ← circuit breaker
  │
  ▼
extractSymbols(tree, language)
  │
  ▼
symbol-lookup.findSymbolOrThrow(symbols, namePath)
  │
  ▼
stalenessGuard.checkAndGetError(path)
  │
  ▼
undoManager.record(path, 'replace_symbol_body: namePath')
  │
  ▼
code-editor.replaceSymbol(path, content, symbol, newBody)
  │
  ▼
atomicWrite(path, newContent)
  │
  ▼
stalenessGuard.invalidate(path)
  │
  ▼
Return result (symbol info + diff)
```

### Search Flow

```
Agent → search_content(path, pattern, opts)
  │
  ▼
validateRegexPattern(pattern)  ← regex/glob-validation.ts
  │
  ▼
RipgrepArgsBuilder()
  .withPattern(pattern)
  .withPath(path)
  .withExcludes(opts.excludePatterns)
  .withFileType(opts.fileType)
  .withContext(opts.context)
  .build()
  │
  ▼
requiresPCRE2(pattern)?  → check PCRE2 support
  │
  ▼
rgSemaphore.acquire()  ← max 8 concurrent
  │
  ▼
spawn(rgPath, args)
  │
  ├─ timeout 10s → SIGTERM
  ├─ output > 2MB → SIGTERM (executeRipgrepWithLimit)
  │
  ▼
parseRipgrepLines(output) → ContentSearchResult[]
  │
  ▼
Return results
```

### Undo Flow

```
Agent → undo(count=3)
  │
  ▼
undoManager.undo(3)
  │
  ▼
stack.splice(-3)  ← get last 3 entries
  │
  ▼
reverse entries  ← undo in reverse order
  │
  ▼
For each entry:
  ├─ previousContent=null → fs.unlink (was new file or too large)
  └─ previousContent present → mkdir -p dirname → atomicWrite → utimes restore
  │
  ▼
stalenessGuard.invalidate(filePath)  ← for each restored file
  │
  ▼
persist() if enabled
  │
  ▼
Return { undone: 3, restored: [...] }
```

---

## 15. Extension Points

### Adding a New Tool

1. **Create handler:** `src/tools/<category>-<tool-name>.ts`
   - Export a handler function
   - Use `ToolFactories` for registration boilerplate
   - Use schemas from `schemas/index.ts`
   - Use `response-helpers.ts` for output formatting

2. **Register in orchestrator:** Import and register in `src/tools/<category>-tools.ts`

3. **Add schema** (if complex input/output): `src/schemas/index.ts`

4. **Add error code** (if new domain): `ECODE` in `src/errors/index.ts`

5. **Add to tool matrix:** `TOOL_MATRIX` in `src/intelligence/tool-selector.ts`

6. **Test:** `*.test.ts` co-located; `pnpm test`

7. **Verify:** `pnpm run typecheck && pnpm run eslint`

### Adding a New Language

1. Add grammar dependency to `package.json` (`tree-sitter-<lang>`)
2. Add to `onlyBuiltDependencies` in `package.json`
3. Create `src/semantic/configs/<lang>.ts` — node-type → SymbolKind mapping
4. Register in `src/semantic/configs/index.ts`
5. Add extension to `EXTENSION_LANGUAGE_MAP` in `constants.ts`
6. Add to `SupportedLanguage` type
7. Add to `SUPPORTED_LANGUAGES` in `grammar-resolver.ts`
8. Optionally add to `PRELOAD_LANGUAGES` in `tree-sitter-manager.ts`
9. If import analysis needed: create `src/semantic/<lang>-import-analyzer.ts` and wire into `import-analyzer.ts`

### Adding a New Error Domain

1. Add codes to `ECODE` in `src/errors/index.ts` (domain-prefixed range)
2. Add messages to `ERROR_MESSAGE` map
3. Create typed error class extending `BaseError`
4. Use in tool handlers

### Adding Config Options

1. Add to `RuntimeConfig` interface + `RuntimeConfigSchema` in `runtime-config.ts`
2. Add default in `getDefaultConfig()`
3. Add env override in `applyEnvOverrides()`
4. Document in README.md environment variables table
5. Add getter function in `config/index.ts` if frequently accessed

---

## Appendix: Key File Locations

| What                | Where                                             |
| ------------------- | ------------------------------------------------- |
| Server entry        | `src/index.ts`                                    |
| SSOT constants      | `src/constants.ts`                                |
| Config resolution   | `src/config/runtime-config.ts`                    |
| Path validation     | `src/validation/path-validation.ts`               |
| Roots manager       | `src/validation/roots-manager.ts`                 |
| Symlink cache       | `src/validation/path-utils.ts` (`cachedRealpath`) |
| ripgrep executor    | `src/search/ripgrep-executor.ts`                  |
| Tree-sitter manager | `src/semantic/tree-sitter-manager.ts`             |
| Symbol lookup SSOT  | `src/semantic/symbol-lookup.ts`                   |
| Undo manager        | `src/undo/undo-manager.ts`                        |
| Staleness guard     | `src/undo/staleness-guard.ts`                     |
| Circuit breaker     | `src/utils/circuit-breaker.ts`                    |
| Rate limiter        | `src/utils/rate-limiter.ts`                       |
| Retry               | `src/utils/retry.ts`                              |
| Atomic write        | `src/utils/fs-utils.ts`                           |
| Error codes         | `src/errors/index.ts` (`ECODE`)                   |
| Zod schemas         | `src/schemas/index.ts`                            |
| Tool selector       | `src/intelligence/tool-selector.ts`               |
| Tool registration   | `src/tools/index.ts`                              |
| Response helpers    | `src/utils/response-helpers.ts`                   |
| Tool factories      | `src/utils/tool-factory.ts`                       |
| Language configs    | `src/semantic/configs/*.ts`                       |
| Build config        | `esbuild.config.mjs`                              |
| ESLint config       | `eslint.config.js`                                |
| TS config           | `tsconfig.json`                                   |
| Test config         | `vitest.config.ts`                                |
