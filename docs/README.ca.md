# Filesystem Pro

[English](../README.md) | [Español](README.es.md) | [Català](README.ca.md) | [Galego](README.gl.md) | [Euskara](README.eu.md) | [Français](README.fr.md) | [Português](README.pt.md)

**Cada sessió de codificació amb IA comença igual: li dones accés, es trenca alguna cosa, i et quedes atrapat.** Filesystem Pro ho soluciona. La IA pot llegir, cercar, editar i refactoritzar el teu codi amb eines reals de desenvolupador — ripgrep troba codi ràpidament, tree-sitter entén l'estructura (sense endevinar amb regex), i cada edició es pot desfer amb un clic. 50 eines. Confiança zero per defecte. Funciona amb Claude, Cursor i qualsevol IA compatible amb MCP.

> **Fork millorat** de l'[Anthropic MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — 11 → 50 eines, cerca amb ripgrep, comprensió de codi amb tree-sitter, desfer complet i resiliència de producció.

_Construït i mantingut per:_

[![LinkedIn](https://img.shields.io/badge/LinkedIn-albertocastrootero-0A66C2.svg?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/albertocastrootero)

---

## Per què Filesystem Pro?

- **La IA no troba el teu codi?** — la cerca amb ripgrep és ~10x més ràpida que Node.js glob. Troba el que importa, salta el que no.
- **La IA edita el que no toca?** — tree-sitter entén l'estructura del teu codi en 17 llenguatges. Les edicions toquen el símbol correcte, no una suposició de regex.
- **La IA trenca alguna cosa i et quedes atrapat?** — pila de desfer completa amb reversió en un clic. La protecció contra obsolescència evita sobreescriptures silencioses de fitxers que has canviat fora de la sessió.
- **Et preocupes del que la IA pot tocar?** — protocol d'arrels activat per defecte. Enllaços simbòlics resolts, camins validats, amb límit de taxa. Confiança zero immediatament.
- **50 eines, no 11** — tot el que té el servidor original, més anàlisi semàntica, refacció basada en AST, comprensió de codi i observabilitat.

---

## vs Original (`@modelcontextprotocol/server-filesystem`)

|                        | Original                                  | Filesystem Pro                                                                               |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Eines**              | 11                                        | 50                                                                                           |
| **Arquitectura**       | Monolítica (2 fitxers)                    | Modular (14 mòduls)                                                                          |
| **Cerca**              | Node.js glob                              | ripgrep (PCRE2, ~10x més ràpid)                                                              |
| **Comprensió de codi** | Cap                                       | Tree-sitter (17 llenguatges), jerarquia de crides, detecció de codi mort                     |
| **Refacció**           | Cap                                       | 6 eines d'edició basades en AST (renombrar, extreure, inline, etc.)                          |
| **Desfer**             | Cap                                       | Pila completa + protecció contra obsolescència + compressió basada en diff                   |
| **Observabilitat**     | Cap                                       | Registre JSON estructurat, mètriques en memòria (p50/p95), eina d'estadístiques              |
| **Vigilància**         | Cap                                       | Vigilant de directoris amb chokidar                                                          |
| **Configuració**       | Només args de CLI                         | Variables d'entorn + config JSON + CLI (resolució en temps d'execució)                       |
| **Protocol d'arrels**  | Args de CLI + arrels, error si no n'hi ha | Activat per defecte, fallback sense restriccions                                             |
| **Seguretat**          | Comprovació bàsica de camins              | Camins amb enllaços simbòlics resolts, memòria cau LRU, protegit EACCES/EPERM, límit de taxa |
| **Resiliència**        | Cap                                       | Interruptor de circuit, reintent d'E/S amb backoff, límit de taxa per eina                   |

## Instal·lació

### 1. Instal·la ripgrep

| Plataforma           | Ordre                                    |
| -------------------- | ---------------------------------------- |
| **macOS**            | `brew install ripgrep`                   |
| **Debian/Ubuntu**    | `sudo apt install ripgrep`               |
| **Fedora**           | `sudo dnf install ripgrep`               |
| **Arch**             | `sudo pacman -S ripgrep`                 |
| **Windows (winget)** | `winget install BurntSushi.ripgrep.MSVC` |
| **Windows (scoop)**  | `scoop install ripgrep`                  |
| **Windows (choco)**  | `choco install ripgrep`                  |

> Alternativament, descarrega'l des de [ripgrep releases](https://github.com/BurntSushi/ripgrep/releases).

### 2. Instal·la i compila el servidor

```bash
cd /path/to/filesystem-pro
pnpm install
pnpm run build
```

## Configuració

Afegeix a la configuració del teu client MCP:

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

Alternativament, passa els directoris permesos com a args de CLI (fallback quan les arrels no estan disponibles):

```bash
node dist/index.js /path/to/dir1 /path/to/dir2
```

### Protocol d'arrels — manté la IA al directori del teu projecte

El [MCP Roots Protocol](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) indica al servidor quins directoris la IA pot tocar. Activat per defecte (`MCP_ROOTS_RESTRICTION=1`):

1. A l'inici, el servidor demana al teu client les arrels de l'espai de treball (p.ex. `file:///home/user/myapp`)
2. Cada operació de fitxers queda restringida a aquestes arrels — la IA no pot escapar del teu projecte
3. Si les arrels canvien durant la sessió, el servidor s'actualitza automàticament
4. Si el teu client no suporta el protocol d'arrels, el servidor canvia a **mode sense restriccions**

> **OpenCode** (v1.15.x) no implementa el Protocol d'Arrels — el servidor registra `[Roots] Client doesn't support roots protocol - running in unrestricted mode`. Vegeu [opencode/issues](https://github.com/anomalyco/opencode/issues).

### Variables d'entorn

#### Seguretat

| Variable                      | Per defecte | Descripció                                                                                |
| ----------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `MCP_ROOTS_RESTRICTION`       | `1` (ON)    | Manté la IA dins del projecte. Estableix `0` o `false` per accés complet                  |
| `MCP_STALENESS_GUARD`         | `1` (ON)    | Impedeix que la IA sobreescriu fitxers canviats externament. `0` o `false` per desactivar |
| `MCP_MAX_FILE_SIZE_BYTES`     | `52428800`  | Mida màxima de fitxer que la IA pot llegir (50MB). Evita que bolqui fitxers enormes       |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `2097152`   | Sortida màxima de cerca (2MB). Evita que el context exploti                               |

#### Desfer

| Variable                   | Per defecte | Descripció                                                            |
| -------------------------- | ----------- | --------------------------------------------------------------------- |
| `MCP_UNDO_PERSIST_DIR`     |             | Desa la pila de desfer a disc perquè sobrevisqui els reinicis         |
| `MCP_UNDO_STACK_SIZE`      | `100`       | Quantes edicions pots desfer                                          |
| `MCP_UNDO_MAX_ENTRY_BYTES` | `1000000`   | Mida màxima d'entrada de desfer abans de la compressió amb diff (1MB) |

#### Rendiment

| Variable                | Per defecte | Descripció                                             |
| ----------------------- | ----------- | ------------------------------------------------------ |
| `MCP_CACHE_DISABLED`    | `false`     | Desactiva tota la memòria cau. Útil per depurar        |
| `MCP_SYMBOL_CACHE_SIZE` | `100`       | Quants conjunts de símbols mantenir en memòria         |
| `MCP_SYMBOL_CACHE_TTL`  | `60000`     | Temps de vida de la memòria cau de símbols (ms)        |
| `MCP_AST_CACHE_SIZE`    | `25`        | Quants AST mantenir analitzats                         |
| `MCP_AST_CACHE_TTL`     | `60000`     | Temps de vida de la memòria cau d'AST (ms)             |
| `MCP_MAX_CONCURRENT_RG` | `8`         | Màxim de processos ripgrep executant-se simultàniament |
| `MCP_RG_TIMEOUT_MS`     | `30000`     | Mata ripgrep si triga més d'això (ms)                  |

#### Depuració

| Variable                  | Per defecte | Descripció                                       |
| ------------------------- | ----------- | ------------------------------------------------ |
| `MCP_STRUCTURED_LOGS`     | `false`     | Registres JSON per cada crida d'eina i error     |
| `LOG_ROOTS_EVENTS`        | `false`     | Registra esdeveniments del protocol d'arrels     |
| `DEBUG_MCP` / `MCP_DEBUG` | `false`     | Mode de depuració amb estat del selector d'eines |

#### Avançat

| Variable            | Per defecte | Descripció                                               |
| ------------------- | ----------- | -------------------------------------------------------- |
| `MCP_CONFIG_FILE`   |             | Fitxer de configuració JSON (fusionat amb vars d'entorn) |
| `MCP_TEMPLATES_DIR` |             | Directori de plantilles personalitzades                  |

La configuració es resol en **moment de crida** (no d'importació) mitjançant funcions accessores. Els canvis en variables d'entorn i fitxer de configuració tenen efecte immediat sense reinici.

---

## Eines (50)

### Lectura i escriptura

| Eina                  | Descripció                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `read_text_file`      | Llegeix qualsevol fitxer. Usa `head`/`tail` per llegir només el necessari |
| `read_media_file`     | Llegeix imatges i fitxers d'àudio com a base64                            |
| `read_multiple_files` | Llegeix diversos fitxers alhora — sense esperes                           |
| `write_file`          | Crea o sobreescriu un fitxer. Atòmic — no deixa fitxers trencats          |
| `edit_file`           | Edicions dirigides per línia. `dryRun` primer per previsualitzar el diff  |
| `delete_file`         | Elimina un fitxer (es pot desfer)                                         |
| `delete_path`         | Elimina qualsevol fitxer o directori — detecta automàticament el tipus    |

### Directoris

| Eina                                | Descripció                                               |
| ----------------------------------- | -------------------------------------------------------- |
| `create_directory`                  | Crea directoris — pares inclosos, sense preocupacions    |
| `list_directory`                    | Llista contingut amb etiquetes `[FILE]`/`[DIR]`          |
| `list_directory_with_sizes`         | Llista amb mides — troba què ocupa espai al disc         |
| `directory_tree`                    | Arbre recursiu complet. Filtra amb `exclude`, `maxDepth` |
| `move_file`                         | Mou o reanomena — atòmic, sense estats parcials          |
| `delete_directory`                  | Elimina un directori. `recursive=true` per als no buits  |
| `get_file_info`                     | Metadades del fitxer: mida, dates, permisos              |
| `list_allowed_directories`          | Comprova quins directoris la IA pot tocar                |
| `watch_directory` / `stop_watching` | Notificacions en temps real quan els fitxers canvien     |

### Cerca (ripgrep)

| Eina                   | Descripció                                                               |
| ---------------------- | ------------------------------------------------------------------------ |
| `search_files`         | Troba fitxers per nom — ràpid                                            |
| `find_by_glob`         | Troba amb patrons glob (`**/*.ts`, `src/**/*`)                           |
| `search_content`       | Cerca dins dels fitxers amb regex (PCRE2)                                |
| `count_matches`        | Quantes vegades apareix aquest patró?                                    |
| `diff_files`           | Compara dos fitxers costat a costat                                      |
| `bulk_rename`          | Reanomena molts fitxers alhora amb un patró. `dryRun` per previsualitzar |
| `get_project_patterns` | Llegeix patrons de codificació de l'AGENTS.md                            |

Totes les eines de cerca suporten: filtre `fileType`, `excludePatterns`, `ignoreCase`, `maxResults`, `context`.

### Comprensió de codi (Tree-sitter — 17 llenguatges)

TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift

| Eina                     | Descripció                                                  |
| ------------------------ | ----------------------------------------------------------- |
| `get_symbols_overview`   | Llista els símbols de primer nivell d'un fitxer             |
| `find_symbol`            | Troba símbol per patró (`MyClass/myMethod`)                 |
| `find_symbol_references` | On s'usa aquest símbol a la base de codi?                   |
| `find_unused_symbols`    | Troba codi mort que ningú crida                             |
| `find_deprecated_usages` | Troba crides a símbols `@deprecated` que hauries d'arreglar |
| `find_imports`           | Què importa aquest fitxer?                                  |
| `find_dependents`        | Qui depèn d'aquest fitxer?                                  |
| `find_related_tests`     | On són els tests d'aquest fitxer?                           |
| `find_unused_imports`    | Neteja les importacions que no fan res                      |
| `find_string_literals`   | Troba valors de cadena que coincideixen amb un patró        |
| `get_callers`            | Qui crida aquesta funció?                                   |
| `get_callees`            | Què crida aquesta funció?                                   |
| `get_file_stats`         | Línies, símbols, recompte d'importacions/exportacions       |
| `get_file_summary`       | Resum del fitxer en format llegible                         |

### Edició de codi (basada en AST)

| Eina                                           | Descripció                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `replace_symbol_body`                          | Intercanvia la implementació, manté la signatura — sense risc de grep         |
| `insert_before_symbol` / `insert_after_symbol` | Afegeix codi just on és el símbol, no per número de línia                     |
| `rename_symbol`                                | Reanomena arreu on s'usa. `dryRun` per previsualitzar primer                  |
| `extract_method`                               | Extreu línies a una nova funció — variables lliures detectades automàticament |
| `inline_variable`                              | Substitueix una variable pel seu valor arreu on s'usa                         |
| `introduce_parameter`                          | Converteix una expressió en un paràmetre de funció                            |

### Desfer

| Eina          | Descripció                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------- |
| `undo`        | Desfà l'última edició. O les últimes N edicions. Un clic i desapareix                       |
| `undo_peek`   | Previsualitza què restauraria la desfer — comprova abans de confirmar                       |
| `undo_all`    | Restableix tot a com estava abans que comencés la sessió                                    |
| `undo_status` | Comprova la profunditat de la pila de desfer i l'estat de la protecció contra obsolescència |

Protecció contra obsolescència (activada per defecte): si has editat un fitxer fora de la sessió d'IA, l'edició de l'IA es rebutja en lloc de sobreescriure silenciosament el teu treball. Configura la persistència mitjançant `MCP_UNDO_PERSIST_DIR`.

### Observabilitat

| Eina               | Descripció                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `get_server_stats` | Comprova la salut del servidor — temps d'activitat, rendiment d'eines (p50/p95), profunditat de desfer, configuració d'un cop d'ull |

---

## Arquitectura

```
src/
├── index.ts               # Entrada del servidor, protocol d'arrels, apagada
├── constants.ts           # SSOT: valors predeterminats de config, missatges d'error, SupportedLanguage
├── config/                # Resolució de configuració en temps d'execució (env > fitxer > predeterminats)
├── validation/            # Normalització de camins, resolució d'enllaços simbòlics, comprovació d'arrels
├── search/                # Embolcall de ripgrep (PCRE2, límit de bytes, pool concurrent)
├── semantic/              # Anàlisi Tree-sitter + configs/ (17 llenguatges)
├── tools/                 # 8 mòduls orquestradors, 50 implementacions d'eines
├── undo/                  # Pila de desfer, protecció contra obsolescència, refaccions compostes
├── intelligence/          # Motor d'intenció → recomanació d'eines
├── operations/            # Diff, reanomenament massiu, patrons del projecte
├── schemas/               # Esquemes de validació Zod
├── file-operations/       # Utilitats de lectura/escriptura/vigilància
├── types/                 # Augmentacions del SDK MCP
├── errors/                # BaseError + formatejadors
└── utils/                 # Registrador, mètriques, limitador de taxa, interruptor de circuit,
                            # concurrència, reintents, fs-utils, api-version
```

### Decisions clau

- **Configuració que no es congela a l'inici** — les funcions accessores resolen les variables d'entorn en moment de crida. Canvia una variable, no cal reinici
- **Els enllaços simbòlics no enganyaran la sandbox** — `cachedRealpath` resol cada camí abans de comprovar-lo. Memòria cau LRU (TTL 5s) ho manté ràpid
- **La IA no sobreescriurà silenciosament els teus canvis** — la protecció contra obsolescència rebutja edicions en fitxers modificats fora de la sessió. `MCP_STALENESS_GUARD=0` per desactivar
- **Les edicions són atòmiques o no són res** — patró de fitxer temporal + reanomenament. El teu fitxer o canvia completament o es queda intacte
- **Els fitxers grans no inflen la memòria** — el desfer per a fitxers >1MB emmagatzema pedaços diff, no còpies completes
- **ripgrep no es menjarà la teva RAM** — SIGTERM al llindar OOM. Màxim 8 processos concurrents, timeout de 30s
- **Cap eina pot monopolitzar el servidor** — cub de tokens per eina (60/min per defecte)
- **AST primer, regex com fallback** — anàlisi de variables lliures en 17 llenguatges via tree-sitter. Regex només quan AST no pot analitzar

---

## Desenvolupament

```bash
pnpm test              # Executa els tests (vitest)
pnpm test:run          # Mode CI
pnpm test:coverage     # Amb cobertura
pnpm run build         # Compila (swc → dist/)
pnpm run clean         # Neteja dist/
pnpm run clean && pnpm run build  # Neteja i compila
pnpm run watch         # Mode vigilància
pnpm run eslint        # Comprovació de lint (0 errors, 0 avisos)
pnpm run eslint:fix    # Lint + correcció automàtica
pnpm run typecheck     # Comprovació estricta de TypeScript
```

## Projecte complementari

[**Backup Pro**](https://github.com/lordc-dev/backup-pro) — versiona cada fitxer abans que la IA el toqui. Cerca còpies de seguretat, compara canvis, restaura amb un clic. Integritat SHA-256, deduplicació, operacions per lots. La pila de desfer protegeix la sessió actual; Backup Pro protegeix entre sessions.

## Llicència

MIT — Consulta el [repositori original de MCP Servers](https://github.com/modelcontextprotocol/servers) per a més detalls.

## Crèdits

- Original: [Anthropic MCP Servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- MCP SDK: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
