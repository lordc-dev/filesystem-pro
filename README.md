# Filesystem Pro

[English](../README.md) | [Español](docs/README.es.md) | [Català](docs/README.ca.md) | [Galego](docs/README.gl.md) | [Euskara](docs/README.eu.md) | [Français](docs/README.fr.md) | [Português](docs/README.pt.md)

**Every AI coding session starts the same: you give access, it breaks something, and you're stuck.** Filesystem Pro fixes that. AI can read, search, edit, and refactor your code with real developer tools — ripgrep finds code fast, tree-sitter understands structure (no regex guessing), and every edit is undoable with one click. 50 tools. Zero trust by default. Works with Claude, Cursor, and any MCP-compatible AI.

> **Enhanced fork** of the [Anthropic MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — 11 → 50 tools, ripgrep search, tree-sitter code understanding, full undo, and production-grade resilience.

_Built and maintained by:_

[![LinkedIn](https://img.shields.io/badge/LinkedIn-albertocastrootero-0A66C2.svg?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/albertocastrootero)

---

## Why Filesystem Pro?

- **AI can't find your code?** — ripgrep search ~10x faster than Node.js glob. Finds what matters, skips what doesn't.
- **AI edits the wrong thing?** — tree-sitter understands your code structure in 17 languages. Edits hit the right symbol, not some regex guess.
- **AI breaks something and you're stuck?** — full undo stack with one-click rollback. Staleness guard prevents silent overwrites of files you changed outside the session.
- **Worried about what AI can touch?** — roots protocol ON by default. Symlinks resolved, paths validated, rate-limited. Zero trust out of the box.
- **50 tools, not 11** — everything the original server has, plus semantic analysis, AST-based refactoring, code understanding, and observability.

---

## vs Original (`@modelcontextprotocol/server-filesystem`)

|                        | Original                        | Filesystem Pro                                                          |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| **Tools**              | 11                              | 50                                                                      |
| **Architecture**       | Monolithic (2 files)            | Modular (14 modules)                                                    |
| **Search**             | Node.js glob                    | ripgrep (PCRE2, ~10x faster)                                            |
| **Code understanding** | None                            | Tree-sitter (17 languages), call hierarchy, dead code detection         |
| **Refactoring**        | None                            | 6 AST-based edit tools (rename, extract, inline, etc.)                  |
| **Undo**               | None                            | Full stack + staleness guard + diff-based compression                   |
| **Observability**      | None                            | Structured JSON logging, in-memory metrics (p50/p95), server stats tool |
| **Watching**           | None                            | chokidar directory watcher                                              |
| **Config**             | CLI args only                   | Env vars + JSON config + CLI (runtime resolution)                       |
| **Roots Protocol**     | CLI args + roots, error if none | ON by default, unrestricted fallback                                    |
| **Security**           | Basic path check                | Symlink-resolved paths, LRU cache, EACCES/EPERM safe, rate limiting     |
| **Resilience**         | None                            | Circuit breaker, I/O retry with backoff, per-tool rate limiting         |

## Installation

### 1. Install ripgrep

| Platform             | Command                                  |
| -------------------- | ---------------------------------------- |
| **macOS**            | `brew install ripgrep`                   |
| **Debian/Ubuntu**    | `sudo apt install ripgrep`               |
| **Fedora**           | `sudo dnf install ripgrep`               |
| **Arch**             | `sudo pacman -S ripgrep`                 |
| **Windows (winget)** | `winget install BurntSushi.ripgrep.MSVC` |
| **Windows (scoop)**  | `scoop install ripgrep`                  |
| **Windows (choco)**  | `choco install ripgrep`                  |

> Alternatively, download from [ripgrep releases](https://github.com/BurntSushi/ripgrep/releases).

### 2. Install and build the server

```bash
cd /path/to/filesystem-pro
pnpm install
pnpm run build
```

## Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["/path/to/filesystem-pro/dist/index.js"],
      "env": {
        "MCP_ROOTS_RESTRICTION": "1"
      }
    }
  }
}
```

Alternatively, pass allowed directories as CLI args (fallback when roots are unavailable):

```bash
node dist/index.js /path/to/dir1 /path/to/dir2
```

### Roots Protocol — keep AI in your project directory

The [MCP Roots Protocol](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) tells the server which directories AI is allowed to touch. ON by default (`MCP_ROOTS_RESTRICTION=1`):

1. On startup, the server asks your client for workspace roots (e.g. `file:///home/user/myapp`)
2. Every file operation is restricted to those roots — AI can't escape your project
3. If roots change mid-session, the server updates automatically
4. If your client doesn't support roots, the server falls back to **unrestricted mode**

> **OpenCode** (v1.15.x) doesn't implement Roots Protocol — the server logs `[Roots] Client doesn't support roots protocol - running in unrestricted mode`. See [opencode/issues](https://github.com/anomalyco/opencode/issues).

### Environment Variables

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

---

## Tools (50)

### Read & Write

| Tool                  | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `read_text_file`      | Read any file. Use `head`/`tail` to read just what you need   |
| `read_media_file`     | Read images and audio files as base64                         |
| `read_multiple_files` | Read several files at once — no waiting                       |
| `write_file`          | Create or overwrite a file. Atomic — won't leave broken files |
| `edit_file`           | Make targeted line edits. `dryRun` first to preview the diff  |
| `delete_file`         | Delete a file (undoable)                                      |
| `delete_path`         | Delete any file or directory — auto-detects the type          |

### Directories

| Tool                                | Description                                            |
| ----------------------------------- | ------------------------------------------------------ |
| `create_directory`                  | Create directories — parents included, no worries      |
| `list_directory`                    | List contents with `[FILE]`/`[DIR]` labels             |
| `list_directory_with_sizes`         | List with sizes — find what's eating disk space        |
| `directory_tree`                    | Full recursive tree. Filter with `exclude`, `maxDepth` |
| `move_file`                         | Move or rename — atomic, no partial states             |
| `delete_directory`                  | Delete a directory. `recursive=true` for non-empty     |
| `get_file_info`                     | File metadata: size, dates, permissions                |
| `list_allowed_directories`          | Check which directories AI is allowed to touch         |
| `watch_directory` / `stop_watching` | Get notified when files change in real time            |

### Search (ripgrep)

| Tool                   | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `search_files`         | Find files by name — fast                                     |
| `find_by_glob`         | Find with glob patterns (`**/*.ts`, `src/**/*`)               |
| `search_content`       | Search inside files with regex (PCRE2)                        |
| `count_matches`        | How many times does this pattern appear?                      |
| `diff_files`           | Compare two files side by side                                |
| `bulk_rename`          | Rename many files at once with a pattern. `dryRun` to preview |
| `get_project_patterns` | Read coding patterns from AGENTS.md                           |

All search tools support: `fileType` filter, `excludePatterns`, `ignoreCase`, `maxResults`, `context`.

### Code Understanding (Tree-sitter — 17 languages)

TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift

| Tool                     | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `get_symbols_overview`   | List top-level symbols in a file                   |
| `find_symbol`            | Find symbol by pattern (`MyClass/myMethod`)        |
| `find_symbol_references` | Where is this symbol used across the codebase?     |
| `find_unused_symbols`    | Find dead code nobody calls                        |
| `find_deprecated_usages` | Find calls to `@deprecated` symbols you should fix |
| `find_imports`           | What does this file import?                        |
| `find_dependents`        | Who depends on this file?                          |
| `find_related_tests`     | Where are the tests for this file?                 |
| `find_unused_imports`    | Clean up imports that do nothing                   |
| `find_string_literals`   | Find string values matching a pattern              |
| `get_callers`            | Who calls this function?                           |
| `get_callees`            | What does this function call?                      |
| `get_file_stats`         | Lines, symbols, imports/exports count              |
| `get_file_summary`       | Human-readable file summary                        |

### Code Editing (AST-based)

| Tool                                           | Description                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `replace_symbol_body`                          | Swap implementation, keep the signature — no grep risk        |
| `insert_before_symbol` / `insert_after_symbol` | Add code right where the symbol is, not by line number        |
| `rename_symbol`                                | Rename everywhere it's used. `dryRun` to preview first        |
| `extract_method`                               | Pull lines into a new function — free variables auto-detected |
| `inline_variable`                              | Replace a variable with its value wherever it's used          |
| `introduce_parameter`                          | Turn an expression into a function parameter                  |

### Undo

| Tool          | Description                                                      |
| ------------- | ---------------------------------------------------------------- |
| `undo`        | Undo the last edit. Or the last N edits. One click and it's gone |
| `undo_peek`   | Preview what undo would restore — check before you commit        |
| `undo_all`    | Reset everything back to how it was before the session started   |
| `undo_status` | Check undo stack depth and staleness guard state                 |

Staleness guard (ON by default): If you edited a file outside the AI session, the AI's edit gets rejected instead of silently overwriting your work. Configure persistence via `MCP_UNDO_PERSIST_DIR`.

### Observability

| Tool               | Description                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `get_server_stats` | Check server health — uptime, tool performance (p50/p95), undo depth, config at a glance |

---

## Architecture

```
src/
├── index.ts               # Server entry, roots protocol, shutdown
├── constants.ts           # SSOT: config defaults, error messages, SupportedLanguage
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

### Key Decisions

- **Config that doesn't freeze at startup** — getter functions resolve env vars at call time. Change a variable, no restart needed
- **Symlinks won't trick the sandbox** — `cachedRealpath` resolves every path before checking. LRU cache (5s TTL) keeps it fast
- **AI won't silently overwrite your changes** — staleness guard rejects edits on files modified outside the session. `MCP_STALENESS_GUARD=0` to disable
- **Edits are atomic or not at all** — temp file + rename pattern. Your file either changes completely or stays untouched
- **Large files don't bloat memory** — undo for files >1MB stores diff patches, not full copies
- **Ripgrep won't eat your RAM** — SIGTERM on OOM threshold. Max 8 concurrent processes, 30s timeout
- **No single tool can hog the server** — token bucket per tool (60/min default)
- **AST-first, regex fallback** — free variable analysis in 17 languages via tree-sitter. Regex only when AST can't parse

---

## Development

```bash
pnpm test              # Run tests (vitest)
pnpm test:run          # CI mode
pnpm test:coverage     # With coverage
pnpm run build         # Build (swc → dist/)
pnpm run clean         # Clean dist/
pnpm run clean && pnpm run build  # Clean build
pnpm run watch         # Watch mode
pnpm run eslint        # Lint check (0 errors, 0 warnings)
pnpm run eslint:fix    # Lint + auto-fix
pnpm run typecheck     # TypeScript strict check
```

## Companion Project

[**Backup Pro**](https://github.com/lordc-dev/backup-pro) — version every file before AI touches it. Search backups, diff changes, restore with one click. SHA-256 integrity, deduplication, batch operations. The undo stack protects your current session; Backup Pro protects across sessions.

## License

MIT — See original [MCP Servers repository](https://github.com/modelcontextprotocol/servers) for details.

## Credits

- Original: [Anthropic MCP Servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- MCP SDK: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
