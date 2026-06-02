# ADR-005: Lazily-Loaded Tree-sitter Grammars with Parallel Preload

## Status: Accepted

## Context

Tree-sitter requires WASM grammar files per language. Loading all 15+ languages at startup adds latency. But first parse of any language must wait for grammar load.

## Decision

1. Lazy load: grammars loaded on first parse request for a given language
2. Parallel preload: after `Parser.init()`, preload top 5 languages (typescript, javascript, tsx, jsx, python) in parallel via `Promise.all`
3. Cache loaded languages in `Map<SupportedLanguage, Parser.Language>`
4. Extract WASM resolution to `GrammarResolver` (npm/pnpm/bundled fallback chain)

## Consequences

- **+** Startup is fast (only `Parser.init()` + 5 parallel loads)
- **+** Less common languages load on demand
- **-** First use of uncommon language has latency
- **-** `GrammarResolver` fallback chain is complex (npm → pnpm → bundled)

## Mitigations

- Preload covers 90%+ of real-world usage
- Grammar load failures are non-fatal (per-language `.catch(() => {})`)