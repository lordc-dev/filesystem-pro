# Filesystem Pro — Estado y Pendientes

> Documento de continuidad. Última actualización: 2026-09-24 (sesión de review + hardening).
> Repo: `~/.config/opencode/filesystem-pro` · Rama: `main` (15+ commits por delante de origin, sin push)

## Contexto

Sesión larga de review y hardening del MCP filesystem-pro tras su reinicio.
Cuatro rondas de review externo (hallazgos verificados por el revisor en cada ronda).
Todo lo crítico está cerrado y verificado. Quedan 3 puntos diferidos por acuerdo explícito.

## Estado verificado (no reabrir)

- **1448 tests ✓** (90 archivos), typecheck ✓, ESLint ✓ (0 warnings), coverage **80.38%** líneas (threshold 80%).
- Git limpio. `dist/` reconstruido tras cada ronda. CI en `.github/workflows/ci.yml` (typecheck+lint+coverage+bench+build+TOOLS.md freshness).
- Commits hasta `45e5a6f` verificados por el revisor externo.

### Cerrado en rondas anteriores (resumen)

| Área | Estado |
|---|---|
| extract_method (3 bugs: strings como vars, globals, post-block returns) | ✓ cerrado, tests end-to-end |
| Tools nuevos: copy_file, chmod (octal+simbólico), create_symlink | ✓ verificados vía MCP |
| bulk_rename: contención basename-only + validatePath por destino (también dryRun) | ✓ |
| chmod recursivo: lstat walk, symlinks SIEMPRE skipped, post-order, caps 10k/32 | ✓ |
| undo: unión PreviousState (created/snapshot/notUndoable), bytes reales, binarios → notUndoable (round-trip UTF-8 verificado), ENOENT-only en created, tracking por entrada, realpath del padre antes de mkdir, migración legacy | ✓ |
| atomicWrite: cleanup .tmp en todo fallo, preserva modo exacto (chmod tras open, umask-proof) | ✓ |
| Política escrituras: todo tool que toca disco via `destructive()`; guard derivado del factory (SSOT); test catálogo | ✓ |
| Rate limiter global sin reset en rechazo | ✓ |
| read_multiple_files: 50 files/concurrencia 8/límite por archivo/budget total (reserva antes del await) | ✓ |
| read_media_file: size check antes de leer | ✓ |
| metrics: fs/promises async, guard single-pending | ✓ |
| Registro único tools (ruta async muerta eliminada) + test módulos completos | ✓ |
| TOOLS.md autogenerado + CI freshness check | ✓ |
| Docs: política sin-roots explícita en README, timeout 10s en 7 idiomas, 18 lenguajes | ✓ |
| Flaky test symbol-lookup: margen 5× | ✓ |

## Pendiente (diferido por acuerdo — NO crítico)

### 1. delete recursivo: undo no cubre symlinks ni entradas especiales
- **Archivo**: `src/tools/directory-delete.ts:17` — `collectFilesInDir` solo recopila `isFile()`.
- **Problema**: undo de un `delete_directory` restaura archivos normales pero pierde symlinks (y otros tipos) que había en el árbol.
- **Fix propuesto**: recopilar también symlinks en el batch de undo (guardar target del link), o documentar la limitación en la descripción del tool.
- **Esfuerzo**: bajo. Test: árbol con symlink + archivo, delete, undo, verificar ambos restaurados.

### 2. move_file / bulk_rename sin transacción de deshacer
- **Problema**: documentados como no-undoable (honesto), pero no existe transacción de lote reversible.
- **Decisión pendiente**: implementar transacción (registrar origen+destino, undo = move inverso) o dejar documentado. Ponytail dice: dejarlo, el usuario tiene el diff.
- **Esfuerzo**: medio si se implementa.

### 3. División de módulos grandes (refactor estético)
- `response-helpers.ts`, `reference-classifier.ts`, `tree-sitter-manager.ts`, `extract-method-analysis.ts`.
- **Acuerdo explícito con el revisor**: NO dividir sin un problema funcional concreto. Extraer solo cuando un cambio real en esos módulos lo justifique.

## Convenciones de la sesión (mantener)

- Commits temáticos, sin atribución IA. Formato: `fix(scope): ...` / `feat(scope): ...` / `docs: ...`.
- Backup con backup-pro antes de editar. dryRun en edits semánticos.
- Verificar tras cada cambio: `pnpm typecheck && pnpm lint && pnpm vitest run` + `node esbuild.config.mjs`.
- El revisor externo valida cada ronda — no dar nada por cerrado sin su verificación.
- Tests de regresión para cada fix de seguridad (patrón: repro → fix → test que falla sin el fix).

## Nota sobre el MCP server en runtime

El server corre `dist/index.js` — tras cambios hay que rebuild + reiniciar opencode para que el MCP los recoja. Generar prompt de test post-reinicio para verificar vía las tools MCP (patrón usado toda la sesión).