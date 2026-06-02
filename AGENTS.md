# AGENTS.md — filesystem-pro MCP Server

**Source**: `~/.config/opencode/mcp/filesystem-pro`

## Architecture

```
src/
├── index.ts               # Server entry, roots protocol, shutdown
├── constants.ts           # SSOT: config defaults, error messages, SUPPORTED_LANGUAGES
├── config/                # Runtime config resolution (env > file > defaults)
├── validation/            # Path normalization, symlink resolution, roots check
├── search/                # ripgrep wrapper (PCRE2, byte-limit, concurrent pool)
├── semantic/              # Tree-sitter analysis + configs/ (17 languages)
├── tools/                 # 8 orchestrator modules, 50 tool implementations
├── undo/                  # Undo stack, staleness guard, composite refactors
├── intelligence/          # Intent → tool recommendation engine
├── operations/            # Diff, bulk rename, project patterns
├── schemas/               # Zod validation schemas
├── file-operations/       # Read/write/watch utilities
├── types/                 # MCP SDK augmentations
├── errors/                # BaseError + formatters
└── utils/                 # Logger, metrics, rate limiter, circuit breaker,
                            # concurrency, retry, fs-utils, api-version
```

## Tools — When & How

### Read & Write

| Tool                  | When                        | Key Params                                                          |
| --------------------- | --------------------------- | ------------------------------------------------------------------- |
| `read_text_file`      | Read file contents          | `path`, `head` (first N lines), `tail` (last N lines)               |
| `read_multiple_files` | Read several files at once  | `paths[]` — more efficient than sequential reads                    |
| `read_media_file`     | Read images/audio as base64 | `path` — supports png/jpg/gif/webp/bmp/svg/mp3/wav/ogg/flac/aac/m4a |
| `write_file`          | Create or overwrite a file  | `path`, `content` — atomic, won't leave broken files                |
| `edit_file`           | Make targeted line edits    | `path`, `edits[]`, `dryRun` first to preview the diff                |
| `delete_file`         | Delete a file (undoable)    | `path`                                                              |
| `delete_path`         | Delete any file or dir      | `path` — auto-detects the type                                      |

### Directories

| Tool                                | When                                             | Key Params                      |
| ----------------------------------- | ------------------------------------------------ | ------------------------------- |
| `create_directory`                  | Create dir including nested parents (idempotent) | `path`                          |
| `list_directory`                    | List files/dirs with [FILE]/[DIR] prefixes       | `path`                          |
| `list_directory_with_sizes`         | List with size info — find what's eating space   | `path`, `sortBy` (name/size)    |
| `directory_tree`                    | Full recursive tree as JSON                       | `path`, `maxDepth`, `maxEntries`, `exclude[]` |
| `move_file`                         | Move/rename (atomic)                             | `source`, `destination`         |
| `delete_directory`                  | Delete dir (undoable with `recursive=true`)      | `path`, `recursive`             |
| `get_file_info`                     | File metadata (size, dates, perms)               | `path`                          |
| `list_allowed_directories`          | Check which directories AI is allowed to touch   | —                               |
| `watch_directory` / `stop_watching` | Get notified when files change                   | `path`, `events[]`, `recursive` |

### Search (ripgrep)

| Tool                   | When                            | Key Params                                                                                          |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `search_files`         | Find files by name — fast       | `path`, `pattern`, `excludePatterns`                                                                |
| `find_by_glob`         | Find with glob patterns         | `patterns[]`, `cwd`, `ignore[]`, `onlyFiles`, `deep`                                                 |
| `search_content`       | Search inside files with regex  | `path`, `pattern`, `fileType`, `ignoreCase`, `context`, `maxResults`, `excludePatterns`, `pcre2`    |
| `count_matches`        | How many times does pattern appear? | `path`, `pattern`, `fileType`, `ignoreCase`, `excludePatterns`                                 |
| `diff_files`           | Compare two files side by side  | `file1`, `file2`, `context`, `format`, `ignoreWhitespace`                                           |
| `bulk_rename`          | Rename many files via regex     | `path`, `pattern`, `replacement`, `dryRun`, `recursive`, `includeExtensions[]`, `excludePatterns[]` |
| `get_project_patterns` | Read AGENTS.md coding patterns  | `path`, `patternName`, `type` (code/structure/config)                                               |

All search tools support: `fileType` filter, `excludePatterns`, `ignoreCase`, `maxResults`, `context`.

### Code Understanding (Tree-sitter — 17 languages)

TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift

| Tool                     | When                                  | Key Params                                            |
| ------------------------ | ------------------------------------- | ----------------------------------------------------- |
| `get_symbols_overview`   | List top-level symbols in a file      | `path`, `depth`, `kinds[]`                            |
| `find_symbol`            | Find symbol by pattern                | `path`, `pattern`, `kinds[]`, `depth`, `includeBody`  |
| `find_symbol_references` | Where is this symbol used?            | `path`, `namePath`, `searchPath`, `includeDefinition` |
| `find_unused_symbols`    | Find dead code nobody calls           | `path`, `searchPath`                                  |
| `find_deprecated_usages` | Find calls to @deprecated APIs        | `path`, `maxFiles`, `includeDefinitions`              |
| `find_imports`           | What does this file import?           | `path`                                                |
| `find_dependents`        | Who depends on this file?             | `path`, `searchPath`                                  |
| `find_related_tests`     | Where are the tests for this file?    | `path`, `searchPath`                                  |
| `find_unused_imports`    | Clean up imports that do nothing      | `path`                                                |
| `find_string_literals`   | Find string values matching pattern   | `path`, `pattern`, `exactMatch`, `ignoreCase`         |
| `get_callers`            | Who calls this function?              | `path`, `namePath`, `searchPath`                     |
| `get_callees`            | What does this function call?         | `path`, `namePath`                                    |
| `get_file_stats`         | Lines, symbols, imports/exports count | `path`                                                |
| `get_file_summary`       | Human-readable file summary           | `path`                                                |

### Code Editing (AST-based)

| Tool                   | When                                    | Key Params                                                                                              |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `replace_symbol_body`  | Swap implementation, keep signature     | `path`, `namePath`, `newBody`, `dryRun`                                                                 |
| `insert_before_symbol` | Insert code before a symbol             | `path`, `namePath`, `code`, `dryRun`                                                                    |
| `insert_after_symbol`  | Insert code after a symbol              | `path`, `namePath`, `code`, `dryRun`                                                                    |
| `rename_symbol`        | Rename across all references            | `path`, `namePath`, `newName`, `searchPath`, `dryRun`                                                   |
| `extract_method`       | Pull lines into new function            | `path`, `newMethodName`, `startLine`, `endLine`, `parentSymbol`, `dryRun`                               |
| `inline_variable`      | Replace variable with its initializer   | `path`, `variableName`, `parentSymbol`, `dryRun`                                                        |
| `introduce_parameter`  | Turn expression into function param     | `path`, `parameterName`, `startLine`, `endLine`, `startColumn`, `endColumn`, `functionSymbol`, `dryRun` |

### Undo

| Tool          | When                                   | Key Params          |
| ------------- | -------------------------------------- | ------------------- |
| `undo`        | Undo last N destructive operations     | `count` (default 1) |
| `undo_peek`   | Preview what undo would restore        | `count` (default 5) |
| `undo_all`    | Restore all recorded operations        | —                   |
| `undo_status` | Stack depth, staleness guard state     | —                   |

Staleness guard (ON by default): If you edited a file outside the AI session, the AI's edit gets rejected instead of silently overwriting your work. Configure persistence via `MCP_UNDO_PERSIST_DIR`.

### Observability

| Tool               | When                          | Key Params |
| ------------------ | ----------------------------- | ---------- |
| `get_server_stats` | Check server health at a glance | —          |

## Workflow Rules

1. **Always dry-run first**: Use `dryRun: true` on `edit_file`, `rename_symbol`, `replace_symbol_body`, `insert_before/after_symbol`, `extract_method`, `inline_variable`, `introduce_parameter`, and `bulk_rename`.
2. **Use undo, not guesses**: `undo_peek` → confirm → `undo` is safer than re-editing.
3. **Staleness guard warns**: If a file was modified externally between read and edit, the staleness guard blocks the edit. Re-read the file first.
4. **Semantic edits > raw edits**: Prefer `rename_symbol`, `replace_symbol_body`, `extract_method` over `edit_file` when working with code symbols.
5. **Read multiple files efficiently**: Use `read_multiple_files` for 2+ files instead of sequential reads.
6. **Use `find_by_glob` for file discovery**: Faster than `search_files` for path pattern matching.
7. **Use `search_content` with `pcre2` for complex regex**: PCRE2 enables lookbehind, lookahead, etc.
8. **Tree-sitter supports 17 languages**: TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift. Auto-detected by file extension.
9. **Delete operations are undoable**: `delete_file`, `delete_directory`, `delete_path` record content before deletion.
10. **Write operations auto-record undo**: All mutations via `write_file`, `edit_file`, symbol operations push to the undo stack.

## Security Model

- **Roots restriction**: ON by default (`MCP_ROOTS_RESTRICTION=0` to disable). Only allows operations within MCP roots.
- **Staleness guard**: ON by default (`MCP_STALENESS_GUARD=0` to disable). Blocks edits if file changed externally.
- **Rate limiting**: Per-tool + global token bucket.
- **Circuit breaker**: 5 consecutive tree-sitter failures → 30s open.
- **Ripgrep timeout**: 30s default (`MCP_RG_TIMEOUT_MS`). Max 8 concurrent (`MCP_MAX_CONCURRENT_RG`).
- **Atomic writes**: All file writes use temp+fsync+rename for crash safety.

## Environment Variables

#### Safety

| Variable                      | Default    | Description                                                                     |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `MCP_ROOTS_RESTRICTION`       | `1` (ON)   | Keep AI inside your project. Set `0` or `false` to unlock full access           |
| `MCP_STALENESS_GUARD`         | `1` (ON)   | Stop AI from overwriting files you changed elsewhere. `0` or `false` to disable |
| `MCP_MAX_FILE_SIZE_BYTES`     | `52428800` | Max file size AI can read (50MB). Don't let it dump huge files into context     |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `2097152`  | Max search output (2MB). Keeps context from exploding                           |

#### Undo

| Variable                   | Default   | Description                                                |
| -------------------------- | --------- | ---------------------------------------------------------- |
| `MCP_UNDO_PERSIST_DIR`     |           | Save undo stack to disk so it survives restarts            |
| `MCP_UNDO_STACK_SIZE`      | `100`     | How many edits you can undo                                |
| `MCP_UNDO_MAX_ENTRY_BYTES` | `1000000` | Max undo entry size before diff compression kicks in (1MB) |

#### Performance

| Variable                | Default | Description                                    |
| ----------------------- | ------- | ---------------------------------------------- |
| `MCP_CACHE_DISABLED`    | `false` | Disable all caching. Useful for debugging      |
| `MCP_SYMBOL_CACHE_SIZE` | `100`   | How many symbol sets to keep in memory         |
| `MCP_SYMBOL_CACHE_TTL`  | `60000` | Symbol cache lifetime (ms)                     |
| `MCP_AST_CACHE_SIZE`    | `25`    | How many ASTs to keep parsed                   |
| `MCP_AST_CACHE_TTL`     | `60000` | AST cache lifetime (ms)                        |
| `MCP_MAX_CONCURRENT_RG` | `8`     | Max ripgrep processes running at once          |
| `MCP_RG_TIMEOUT_MS`     | `30000` | Kill ripgrep if it takes longer than this (ms) |

#### Debugging

| Variable                  | Default | Description                             |
| ------------------------- | ------- | --------------------------------------- |
| `MCP_STRUCTURED_LOGS`     | `false` | JSON logs for every tool call and error |
| `LOG_ROOTS_EVENTS`        | `false` | Log roots protocol events               |
| `DEBUG_MCP` / `MCP_DEBUG` | `false` | Debug mode with tool selector status    |

#### Advanced

| Variable            | Default | Description                             |
| ------------------- | ------- | --------------------------------------- |
| `MCP_CONFIG_FILE`   |         | JSON config file (merged with env vars) |
| `MCP_TEMPLATES_DIR` |         | Custom templates directory              |

Configuration is resolved at **call time** (not import time) via getter functions. Env vars and config file changes take effect immediately without restart.

## Companion Project

[**Backup Pro**](https://github.com/lordc-dev/backup-pro) — version every file before AI touches it. Search backups, diff changes, restore with one click. SHA-256 integrity, deduplication, batch operations. The undo stack protects your current session; Backup Pro protects across sessions.

## Build & Test

```bash
cd ~/.config/opencode/mcp/filesystem-pro
pnpm install
pnpm build      # TypeScript → dist/
pnpm test       # Vitest
```

## CLI Flags

```bash
filesystem-pro --help          # Show help
filesystem-pro --version       # Print version
filesystem-pro --show-config   # Print resolved config as JSON
```