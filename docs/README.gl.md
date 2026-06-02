# Filesystem Pro

[English](../README.md) | [Español](README.es.md) | [Català](README.ca.md) | [Galego](README.gl.md) | [Euskara](README.eu.md) | [Français](README.fr.md) | [Português](README.pt.md)

**Todas as sesións de programación con IA comezan igual: dáselle acceso, rompe algo e quedas atrapado.** Filesystem Pro arranxa isto. A IA pode ler, buscar, editar e refactorizar o teu código con ferramentas de desenvolvedor reais — ripgrep atopa código rápido, tree-sitter entende a estrutura (sen adiviñar con regex), e cada edición é desfacible cun clic. 50 ferramentas. Confianza cero por defecto. Funciona con Claude, Cursor e calquera IA compatible con MCP.

> **Fork mellorado** do [Anthropic MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — de 11 → 50 ferramentas, busca con ripgrep, comprensión de código con tree-sitter, desfacer completo e resiliencia de produción.

_Creado e mantido por:_

[![LinkedIn](https://img.shields.io/badge/LinkedIn-albertocastrootero-0A66C2.svg?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/albertocastrootero)

---

## Por que Filesystem Pro?

- **A IA non atopa o teu código?** — busca con ripgrep ~10x máis rápida que Node.js glob. Atopa o que importa, omitindo o que non.
- **A IA edita o que non debe?** — tree-sitter entende a estrutura do teu código en 17 linguaxes. As edicións acertan no símbolo correcto, non nunha suposición de regex.
- **A IA rompe algo e quedas atrapado?** — pila completa de desfacer con recuperación cun clic. A garda de obsolescencia evita sobrescrituras silenciosas de ficheiros que cambiaches fóra da sesión.
- **Preocupado polo que a IA pode tocar?** — protocolo roots activado por defecto. Symlinks resoltos, rutas validadas, con límite de taxa. Confianza cero desde o inicio.
- **50 ferramentas, non 11** — todo o que ten o servidor orixinal, máis análise semántica, refactorización baseada en AST, comprensión de código e observabilidade.

---

## vs Orixinal (`@modelcontextprotocol/server-filesystem`)

|                           | Orixinal                          | Filesystem Pro                                                                            |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| **Ferramentas**           | 11                                | 50                                                                                        |
| **Arquitectura**          | Monolítica (2 ficheiros)          | Modular (14 módulos)                                                                      |
| **Busca**                 | Node.js glob                      | ripgrep (PCRE2, ~10x máis rápido)                                                         |
| **Comprensión de código** | Ningunha                          | Tree-sitter (17 linguaxes), xerarquía de chamadas, detección de código morto              |
| **Refactorización**       | Ningunha                          | 6 ferramentas de edición baseadas en AST (renomear, extraer, inline, etc.)                |
| **Desfacer**              | Ningunha                          | Pila completa + garda de obsolescencia + compresión baseada en diff                       |
| **Observabilidade**       | Ningunha                          | Rexistro JSON estruturado, métricas en memoria (p50/p95), ferramenta de stats do servidor |
| **Vixilancia**            | Ningunha                          | Vixilante de directorios chokidar                                                         |
| **Configuración**         | Só argumentos CLI                 | Env vars + config JSON + CLI (resolución en tempo de execución)                           |
| **Protocolo Roots**       | Args CLI + roots, erro se non hai | ON por defecto, fallback sen restricións                                                  |
| **Seguridade**            | Verificación básica de ruta       | Rutas con symlinks resoltos, caché LRU, seguro contra EACCES/EPERM, límite de taxa        |
| **Resiliencia**           | Ningunha                          | Circuit breaker, reintento de I/O con backoff, límite de taxa por ferramenta              |

## Instalación

### 1. Instalar ripgrep

| Plataforma           | Comando                                  |
| -------------------- | ---------------------------------------- |
| **macOS**            | `brew install ripgrep`                   |
| **Debian/Ubuntu**    | `sudo apt install ripgrep`               |
| **Fedora**           | `sudo dnf install ripgrep`               |
| **Arch**             | `sudo pacman -S ripgrep`                 |
| **Windows (winget)** | `winget install BurntSushi.ripgrep.MSVC` |
| **Windows (scoop)**  | `scoop install ripgrep`                  |
| **Windows (choco)**  | `choco install ripgrep`                  |

> Alternativamente, descarga desde [ripgrep releases](https://github.com/BurntSushi/ripgrep/releases).

### 2. Instalar e construír o servidor

```bash
cd /path/to/filesystem-pro
pnpm install
pnpm run build
```

## Configuración

Engade á configuración do teu cliente MCP:

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

Alternativamente, pasa os directorios permitidos como argumentos CLI (fallback cando roots non están dispoñibles):

```bash
node dist/index.js /path/to/dir1 /path/to/dir2
```

### Protocolo Roots — mantén a IA no directorio do teu proxecto

O [MCP Roots Protocol](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) indica ao servidor que directorios pode tocar a IA. Activado por defecto (`MCP_ROOTS_RESTRICTION=1`):

1. Ao iniciar, o servidor pide ao cliente as raíces do espazo de traballo (ex. `file:///home/user/myapp`)
2. Cada operación de ficheiro restrínese a esas raíces — a IA non pode saír do teu proxecto
3. Se as raíces cambian durante a sesión, o servidor actualízase automaticamente
4. Se o teu cliente non soporta roots, o servidor recorre ao **modo sen restricións**

> **OpenCode** (v1.15.x) non implementa o Protocolo Roots — o servidor rexistra `[Roots] Client doesn't support roots protocol - running in unrestricted mode`. Consulta [opencode/issues](https://github.com/anomalyco/opencode/issues).

### Variables de Contorno

#### Seguridade

| Variable                      | Predeterminado | Descrición                                                                                            |
| ----------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `MCP_ROOTS_RESTRICTION`       | `1` (ON)       | Mantén a IA dentro do teu proxecto. Establece `0` ou `false` para acceso total                        |
| `MCP_STALENESS_GUARD`         | `1` (ON)       | Evita que a IA sobrescriba ficheiros que cambiaches noutro lugar. `0` ou `false` para desactivar      |
| `MCP_MAX_FILE_SIZE_BYTES`     | `52428800`     | Tamaño máximo de ficheiro que a IA pode ler (50MB). Non deixes que bote ficheiros enormes ao contexto |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `2097152`      | Saída máxima de busca (2MB. Evita que o contexto explote                                              |

#### Desfacer

| Variable                   | Predeterminado | Descrición                                                                    |
| -------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `MCP_UNDO_PERSIST_DIR`     |                | Garda a pila de desfacer en disco para que sobreviva a reinicios              |
| `MCP_UNDO_STACK_SIZE`      | `100`          | Cantas edicións podes desfacer                                                |
| `MCP_UNDO_MAX_ENTRY_BYTES` | `1000000`      | Tamaño máximo de entrada de desfacer antes de activar a compresión diff (1MB) |

#### Rendemento

| Variable                | Predeterminado | Descrición                                     |
| ----------------------- | -------------- | ---------------------------------------------- |
| `MCP_CACHE_DISABLED`    | `false`        | Desactivar toda a caché. Útil para depuración  |
| `MCP_SYMBOL_CACHE_SIZE` | `100`          | Cantos conxuntos de símbolos manter en memoria |
| `MCP_SYMBOL_CACHE_TTL`  | `60000`        | Tempo de vida da caché de símbolos (ms)        |
| `MCP_AST_CACHE_SIZE`    | `25`           | Cantos ASTs manter analizados                  |
| `MCP_AST_CACHE_TTL`     | `60000`        | Tempo de vida da caché de AST (ms)             |
| `MCP_MAX_CONCURRENT_RG` | `8`            | Máximo de procesos ripgrep executándose á vez  |
| `MCP_RG_TIMEOUT_MS`     | `30000`        | Rematar ripgrep se tarda máis deste tempo (ms) |

#### Depuración

| Variable                  | Predeterminado | Descrición                                            |
| ------------------------- | -------------- | ----------------------------------------------------- |
| `MCP_STRUCTURED_LOGS`     | `false`        | Rexistros JSON para cada chamada de ferramenta e erro |
| `LOG_ROOTS_EVENTS`        | `false`        | Rexistrar eventos do protocolo roots                  |
| `DEBUG_MCP` / `MCP_DEBUG` | `false`        | Modo depuración con estado do selector de ferramenta  |

#### Avanzado

| Variable            | Predeterminado | Descrición                                       |
| ------------------- | -------------- | ------------------------------------------------ |
| `MCP_CONFIG_FILE`   |                | Ficheiro de config JSON (combinado con env vars) |
| `MCP_TEMPLATES_DIR` |                | Directorio de modelos personalizados             |

A configuración resólvese en **tempo de chamada** (non en tempo de importación) mediante funcións getter. Os cambios en env vars e no ficheiro de config teñen efecto inmediato sen reiniciar.

---

## Ferramentas (50)

### Ler e Escribir

| Ferramenta            | Descrición                                                                     |
| --------------------- | ------------------------------------------------------------------------------ |
| `read_text_file`      | Ler calquera ficheiro. Usa `head`/`tail` para ler só o que necesitas           |
| `read_media_file`     | Ler imaxes e ficheiros de audio como base64                                    |
| `read_multiple_files` | Ler vários ficheiros á vez — sen esperas                                       |
| `write_file`          | Crear ou sobrescribir un ficheiro. Atómico — non deixa ficheiros rotos         |
| `edit_file`           | Facer edicións dirixidas por liña. `dryRun` primeiro para previsualizar o diff |
| `delete_file`         | Eliminar un ficheiro (desfacible)                                              |
| `delete_path`         | Eliminar calquera ficheiro ou directorio — detecta o tipo automaticamente      |

### Directorios

| Ferramenta                          | Descrición                                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| `create_directory`                  | Crear directorios — inclúe pais, sen preocupacións             |
| `list_directory`                    | Listar contidos con etiquetas `[FILE]`/`[DIR]`                 |
| `list_directory_with_sizes`         | Listar con tamaños — descubre o que ocupa espazo               |
| `directory_tree`                    | Árbore completa recursiva. Filtra con `exclude`, `maxDepth`    |
| `move_file`                         | Mover ou renomear — atómico, sen estados parciais              |
| `delete_directory`                  | Eliminar un directorio. `recursive=true` para non baleiro      |
| `get_file_info`                     | Metadatos do ficheiro: tamaño, datas, permisos                 |
| `list_allowed_directories`          | Comprobar que directorios pode tocar a IA                      |
| `watch_directory` / `stop_watching` | Recibir notificacións cando os ficheiros cambian en tempo real |

### Busca (ripgrep)

| Ferramenta             | Descrición                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `search_files`         | Atopar ficheiros por nome — rápido                                      |
| `find_by_glob`         | Atopar con patróns glob (`**/*.ts`, `src/**/*`)                         |
| `search_content`       | Buscar dentro de ficheiros con regex (PCRE2)                            |
| `count_matches`        | Cantas veces aparece este patrón?                                       |
| `diff_files`           | Comparar dous ficheiros lado a lado                                     |
| `bulk_rename`          | Renomear varios ficheiros á vez cun patrón. `dryRun` para previsualizar |
| `get_project_patterns` | Ler patróns de codificación de AGENTS.md                                |

Todas as ferramentas de busca soportan: filtro `fileType`, `excludePatterns`, `ignoreCase`, `maxResults`, `context`.

### Comprensión de Código (Tree-sitter — 17 linguaxes)

TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift

| Ferramenta               | Descrición                                                     |
| ------------------------ | -------------------------------------------------------------- |
| `get_symbols_overview`   | Listar símbolos de nivel superior nun ficheiro                 |
| `find_symbol`            | Atopar símbolo por patrón (`MyClass/myMethod`)                 |
| `find_symbol_references` | Onde se usa este símbolo na base de código?                    |
| `find_unused_symbols`    | Atopar código morto que ninguén chama                          |
| `find_deprecated_usages` | Atopar chamadas a símbolos `@deprecated` que deberías arranxar |
| `find_imports`           | Que importa este ficheiro?                                     |
| `find_dependents`        | Quen depende deste ficheiro?                                   |
| `find_related_tests`     | Onde están as probas para este ficheiro?                       |
| `find_unused_imports`    | Limpar importacións que non fan nada                           |
| `find_string_literals`   | Atopar valores de cadea que coinciden cun patrón               |
| `get_callers`            | Quen chama a esta función?                                     |
| `get_callees`            | Que chama esta función?                                        |
| `get_file_stats`         | Liñas, símbolos, conta de importacións/exportacións            |
| `get_file_summary`       | Resumo do ficheiro lexible por humanos                         |

### Edición de Código (baseada en AST)

| Ferramenta                                     | Descrición                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `replace_symbol_body`                          | Trocar a implementación, manter a sinatura — sen risco de grep                  |
| `insert_before_symbol` / `insert_after_symbol` | Engadir código xusto onde está o símbolo, non por número de liña                |
| `rename_symbol`                                | Renomear en todas as partes onde se usa. `dryRun` para previsualizar primeiro   |
| `extract_method`                               | Extraer liñas a unha nova función — variables libres detectadas automaticamente |
| `inline_variable`                              | Substituír unha variable polo seu valor onde se usa                             |
| `introduce_parameter`                          | Converter unha expresión nun parámetro de función                               |

### Desfacer

| Ferramenta    | Descrición                                                                        |
| ------------- | --------------------------------------------------------------------------------- |
| `undo`        | Desfacer a última edición. Ou as últimas N edicións. Un clic e desaparece         |
| `undo_peek`   | Previsualizar que restauraría o desfacer — comproba antes de confirmar            |
| `undo_all`    | Restablecer todo ao estado anterior ao inicio da sesión                           |
| `undo_status` | Comprobar a profundidade da pila de desfacer e o estado da garda de obsolescencia |

Garda de obsolescencia (ON por defecto): Se editaches un ficheiro fóra da sesión de IA, a edición da IA rexeitarase en vez de sobrescribir silenciosamente o teu traballo. Configura a persistencia mediante `MCP_UNDO_PERSIST_DIR`.

### Observabilidade

| Ferramenta         | Descrición                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_server_stats` | Comprobar a saúde do servidor — tempo de funcionamento, rendemento de ferramentas (p50/p95), profundidade de desfacer, configuración dunha ollada |

---

## Arquitectura

```
src/
├── index.ts               # Entrada do servidor, protocolo roots, apagado
├── constants.ts           # SSOT: valores predeterminados de config, mensaxes de erro, SupportedLanguage
├── config/                # Resolución de config en tempo de execución (env > ficheiro > predeterminados)
├── validation/            # Normalización de rutas, resolución de symlinks, comprobación de roots
├── search/                # Contedor de ripgrep (PCRE2, límite de bytes, grupo concurrente)
├── semantic/              # Análise tree-sitter + configs/ (17 linguaxes)
├── tools/                 # 8 módulos orquestradores, 50 implementacións de ferramentas
├── undo/                  # Pila de desfacer, garda de obsolescencia, refactorizacións compostas
├── intelligence/          # Motor de recomendación de ferramentas por intención
├── operations/            # Diff, renomeado masivo, patróns de proxecto
├── schemas/               # Esquemas de validación Zod
├── file-operations/       # Utilidades de lectura/escritura/vixilancia
├── types/                 # Augmentos do SDK MCP
├── errors/                # BaseError + formateadores
└── utils/                 # Logger, métricas, limitador de taxa, circuit breaker,
                            # concurrencia, reintento, fs-utils, api-version
```

### Decisións Clave

- **Config que non se conxela ao iniciar** — as funcións getter resolen as env vars en tempo de chamada. Cambia unha variable, sen necesidade de reiniciar
- **Os symlinks non enganan ao sandbox** — `cachedRealpath` resolve cada ruta antes de comprobala. Caché LRU (TTL de 5s) mantén a velocidade
- **A IA non sobrescribirá os teus cambios silenciosamente** — a garda de obsolescencia rexeita edicións en ficheiros modificados fóra da sesión. `MCP_STALENESS_GUARD=0` para desactivar
- **As edicións son atómicas ou non son nada** — patrón de ficheiro temporal + renomeado. O teu ficheiro cambia completamente ou permanece intacto
- **Os ficheiros grandes non inchan a memoria** — o desfacer para ficheiros >1MB almacena parches diff, non copias completas
- **Ripgrep non consumirá a túa RAM** — SIGTERM no limiar de OOM. Máximo 8 procesos concurrentes, timeout de 30s
- **Ningunha ferramenta pode monopolizar o servidor** — token bucket por ferramenta (60/min por defecto)
- **Primeiro AST, regex como fallback** — análise de variables libres en 17 linguaxes mediante tree-sitter. Regex só cando o AST non pode analizar

---

## Desenvolvemento

```bash
pnpm test              # Executar probas (vitest)
pnpm test:run          # Modo CI
pnpm test:coverage     # Con cobertura
pnpm run build         # Construír (swc → dist/)
pnpm run clean         # Limpar dist/
pnpm run clean && pnpm run build  # Construción limpa
pnpm run watch         # Modo vixilancia
pnpm run eslint        # Comprobación de lint (0 erros, 0 avisos)
pnpm run eslint:fix    # Lint + corrección automática
pnpm run typecheck     # Comprobación estrita de TypeScript
```

## Proxecto complementario

[**Backup Pro**](https://github.com/lordc-dev/backup-pro) — versiona cada ficheiro antes de que a IA o toque. Busca copias de seguranza, compara cambios, restaura cun clic. Integridade SHA-256, deduplicación, operacións por lotes. A pila de desfacer protexe a túa sesión actual; Backup Pro protexe entre sesións.

## Licenza

MIT — Consulta o [repositorio orixinal de MCP Servers](https://github.com/modelcontextprotocol/servers) para máis detalles.

## Créditos

- Orixinal: [Anthropic MCP Servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- MCP SDK: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
