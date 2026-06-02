# Filesystem Pro

[English](../README.md) | [Español](README.es.md) | [Català](README.ca.md) | [Galego](README.gl.md) | [Euskara](README.eu.md) | [Français](README.fr.md) | [Português](README.pt.md)

**AI kodeketa-saio guztiak berdin hasten dira: sarbidea ematen duzu, zerbait apurtzen du, eta harrapatuta geratzen zara.** Filesystem Pro-k hori konpontzen du. IA-k zure kodea irakurri, bilatu, editatu eta refaktoratu dezake benetako garatzaile-tresnekin — ripgrep-ek kodea azkar aurkitzen du, tree-sitter-ek egitura ulertzen du (regex-ek asmatu gabe), eta edizio guztiak klik batekin desegin daitezke. 50 tresna. Konfiantza zero lehenespenez. Claude, Cursor eta MCP bateragarriako edozein IA-rekin funtzionatzen du.

> **Hobetutako fork-a** [Anthropic MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)-ena — 11 → 50 tresna, ripgrep bilaketa, tree-sitter kode-ulermen, desegite osoa eta ekoizpiko erresilientzia.

_Egilea eta mantentzailea:_

[![LinkedIn](https://img.shields.io/badge/LinkedIn-albertocastrootero-0A66C2.svg?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/albertocastrootero)

---

## Zergatik Filesystem Pro?

- **IA-k ez du zure kodea aurkitzen?** — ripgrep bilaketa Node.js glob baino ~10x azkarrago. Garrantzitsua aurkitzen du, ez duena saltzen.
- **IA-k okerra editatzen du?** — tree-sitter-ek zure kode-egitura ulertzen du 17 hizkuntzatan. Edizioak ikurtzaile zuzenari jotzen dio, ez regex asmakizun bati.
- **IA-k zerbait apurtzen du eta harrapatuta geratzen zara?** — desegite-pila osoa klik-bateko atzazketarekin. Zaharkitzegitasun-zaindariak saihesten du saiotik kanpo aldatu dituzun fitxategien gain-idazketa isila.
- **IA-k zer uzi dezakeen kezkatzen zaitu?** — roots protokoloa lehenespenez Aktibatuta. Esteka sinbolikoak ebazten dira, bideak baliozkotzen dira, tarifaren mugak. Konfiantza zero kutxatik aterata.
- **50 tresna, ez 11** — jatorrizko zerbitzariak duen guztia, analisi semantiko, AST bidezko refaktorizazio, kode-ulermen eta behagarritasun gehiagorekin.

---

## Jatorrizkoaren aldean (`@modelcontextprotocol/server-filesystem`)

|                        | Jatorrizkoa                        | Filesystem Pro                                                          |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| **Tresnak**              | 11                              | 50                                                                      |
| **Arkitektura**       | Monolitikoa (2 fitxategi)            | Modularra (14 modulo)                                                    |
| **Bilaketa**             | Node.js glob                    | ripgrep (PCRE2, ~10x azkarrago)                                            |
| **Kode-ulermena** | Bat ere ez                            | Tree-sitter (17 hizkuntza), dei-hierarkia, kode hilaren detekzioa         |
| **Refaktorizazioa**        | Bat ere ez                            | 6 AST bidezko edizio-tresna (izena aldatu, erauzi, inline, etab.)                  |
| **Desegite**               | Bat era ez                            | Pila osoa + zaharkitzegitasun-zaindaria + diff bidezko konpresioa                   |
| **Behagarritasuna**      | Bat ere ez                            | Egituratutako JSON erregistroak, memoriako metrikak (p50/p95), zerbitzariaren estatistika-tresna |
| **Behaketa**           | Bat ere ez                            | chokidar direktorio-behatzailea                                              |
| **Konfigurazioa**             | CLI argumentuak soilik                   | Aldagaiak env + JSON konfigurazioa + CLI (exekuzio-garaiko ebazpena)                       |
| **Roots Protokoloa**     | CLI argumentuak + roots, errorerik ez batez | Lehenespenez Aktibatuta, mugagabeko atzeko-eroria                                    |
| **Segurtasuna**           | Oinarrizko bide-egiaztapena                | Esteka sinboliko ebazteko bideak, LRU cache, EACCES/EPERM segurua, tarifaren muga     |
| **Erresilientzia**         | Bat ere ez                            | Zirkuitu-etetea, S/I berriro saiatu atzerapenarekin, tresna bakoitzeko tarifaren muga         |

## Instalazioa

### 1. Instalatu ripgrep

| Plataforma             | Agindua                                  |
| -------------------- | ---------------------------------------- |
| **macOS**            | `brew install ripgrep`                   |
| **Debian/Ubuntu**    | `sudo apt install ripgrep`               |
| **Fedora**           | `sudo dnf install ripgrep`               |
| **Arch**             | `sudo pacman -S ripgrep`                 |
| **Windows (winget)** | `winget install BurntSushi.ripgrep.MSVC` |
| **Windows (scoop)**  | `scoop install ripgrep`                  |
| **Windows (choco)**  | `choco install ripgrep`                  |

> Bestela, deskargatu [ripgrep argitalpenetik](https://github.com/BurntSushi/ripgrep/releases).

### 2. Instalatu eta eraiki zerbitzaria

```bash
cd /path/to/filesystem-pro
pnpm install
pnpm run build
```

## Konfigurazioa

Gehitu zure MCP bezeroaren konfigurazioan:

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

Bestela, pasa baimendutako direktorioak CLI argumentu gisa (atzeko-eroria roots erabilgarri ez daudenean):

```bash
node dist/index.js /path/to/dir1 /path/to/dir2
```

### Roots Protokoloa — mantendu IA zure proiektu-direktorioan

[MCP Roots Protokoloa](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) zerbitzariari esaten dio zein direktoriotan uzi dezakeen IA-k. Lehenespenez Aktibatuta (`MCP_ROOTS_RESTRICTION=1`):

1. Abioan, zerbitzariak bezeroari lan-eremuaren roots galdetzen dio (adb. `file:///home/user/myapp`)
2. Fitxategi-eragiketa guztiak roots horietara mugatuta daude — IA-k ezin du zure proiektutik ihes egin
3. Roots saio erdian aldatzen badira, zerbitzaria automatikoki eguneratzen da
4. Zure bezeroak roots onartzen ez baditu, zerbitzariak **mugagabeko modura** jotzen du

> **OpenCode** (v1.15.x) ez du Roots Protokoloa inplementatzen — zerbitzariak erregistratzen du `[Roots] Client doesn't support roots protocol - running in unrestricted mode`. Ikus [opencode/issues](https://github.com/anomalyco/opencode/issues).

### Ingurune-aldagaiak

#### Segurtasuna

| Aldagaia                      | Lehenespena    | Deskribapena                                                                     |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `MCP_ROOTS_RESTRICTION`       | `1` (Aktibatuta)   | Mantendu IA zure proiektuaren barruan. Ezarri `0` edo `false` sarbide osoa desblokeatzeko           |
| `MCP_STALENESS_GUARD`         | `1` (Aktibatuta)   | Utzi IA beste nonbait aldatu dituzun fitxategiak gain-idaztea. `0` edo `false` desgaitzeko |
| `MCP_MAX_FILE_SIZE_BYTES`     | `52428800` | IA-k irakur dezakeen fitxategi-tamaina maximoa (50MB). Ez utzi fitxategi handiak testuingurura isurtzen     |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `2097152`  | Bilaketa-irteera maximoa (2MB). Testuingurua eztikeratzea saihesten du                           |

#### Desegite

| Aldagaia                   | Lehenespena   | Deskribapena                                                |
| -------------------------- | --------- | ---------------------------------------------------------- |
| `MCP_UNDO_PERSIST_DIR`     |           | Gorde desegite-pila diskoan berrabiarazteetan bizirauteko            |
| `MCP_UNDO_STACK_SIZE`      | `100`     | Zenbat edizio desegin daitezkeen                                |
| `MCP_UNDO_MAX_ENTRY_BYTES` | `1000000` | Desegite-sarreraren tamaina maximoa diff konpresioa heldu aurretik (1MB) |

#### Errendimendua

| Aldagaia                | Lehenespena | Deskribapena                                    |
| ----------------------- | ------- | ---------------------------------------------- |
| `MCP_CACHE_DISABLED`    | `false` | Desgaitu cache guztiak. Arazketa egiteko erabilgarria      |
| `MCP_SYMBOL_CACHE_SIZE` | `100`   | Memorian mantenduko diren ikur multzo kopurua         |
| `MCP_SYMBOL_CACHE_TTL`  | `60000` | Ikur-cachearen biziraupena (ms)                     |
| `MCP_AST_CACHE_SIZE`    | `25`    | Memorian mantenduko diren AST kopurua                   |
| `MCP_AST_CACHE_TTL`     | `60000` | AST cachearen biziraupena (ms)                        |
| `MCP_MAX_CONCURRENT_RG` | `8`     | Aldi berean exekutatu daitezkeen ripgrep prozesu maximoak          |
| `MCP_RG_TIMEOUT_MS`     | `30000` | Hil ripgrep hau baino gehiago luzatzen bada (ms) |

#### Arazketa

| Aldagaia                  | Lehenespena | Deskribapena                             |
| ------------------------- | ------- | --------------------------------------- |
| `MCP_STRUCTURED_LOGS`     | `false` | JSON erregistroak tresna-dei eta errore guztietarako |
| `LOG_ROOTS_EVENTS`        | `false` | Erregistratu roots protokolo-gertaerak               |
| `DEBUG_MCP` / `MCP_DEBUG` | `false` | Arazketa-modua tresna-hautatzailearen egoerarekin    |

#### Aurreratua

| Aldagaia            | Lehenespena | Deskribapena                             |
| ------------------- | ------- | --------------------------------------- |
| `MCP_CONFIG_FILE`   |         | JSON konfigurazio-fitxategia (env aldagaiak eta bateratu) |
| `MCP_TEMPLATES_DIR` |         | Txantiloien direktorio pertsonalizatua              |

Konfigurazioa **dei-unean** ebazten da (inportazio-unean ez) getter funtzioen bidez. Env aldagaiak eta konfigurazio-fitxategiko aldaketak berehala aplikatzen dira berrabiarazi gabe.

---

## Tresnak (50)

### Irakurri eta Idatzi

| Tresna                  | Deskribapena                                                   |
| --------------------- | ------------------------------------------------------------- |
| `read_text_file`      | Irakurri edozein fitxategi. Erabili `head`/`tail` behar duzuna soilik irakurtzeko   |
| `read_media_file`     | Irakurri irudi- eta audio-fitxategiak base64 gisa                         |
| `read_multiple_files` | Irakurri hainbat fitxategi aldi berean — itxaron gabe                       |
| `write_file`          | Sortu edo gainidatzi fitxategi bat. Atomikoa — ez du fitxategi apurturik utziko |
| `edit_file`           | Egin lerro-edizio zehatzak. `dryRun` aurrenikusi diff-a   |
| `delete_file`         | Ezabatu fitxategi bat (desegin daiteke)                                      |
| `delete_path`         | Ezabatu edozein fitxategi edo direktorio — mota automatikoki detektatzen du          |

### Direktorioak

| Tresna                                | Deskribapena                                            |
| ----------------------------------- | ------------------------------------------------------ |
| `create_directory`                  | Sortu direktorioak — gurasoak barne, arazorik gabe      |
| `list_directory`                    | Zerrendatu edukia `[FILE]`/`[DIR]` etiketekin             |
| `list_directory_with_sizes`         | Zerrendatu tamainekin — aurkitu disko-espazioa jaten duena        |
| `directory_tree`                    | Zuhaitz errekurtsibo osoa. Iragazi `exclude`, `maxDepth` erabiliz |
| `move_file`                         | Mugitu edo izenez aldatu — atomikoa, egoera partzialik ez             |
| `delete_directory`                  | Ezabatu direktorio bat. `recursive=true` hutsa ez bada     |
| `get_file_info`                     | Fitxategi-metadatuak: tamaina, datak, baimenak                |
| `list_allowed_directories`          | Egiaztatu zein direktoriotan uzi dezakeen IA-k         |
| `watch_directory` / `stop_watching` | Jakinarazi fitxategiak aldatzean denbora errealean            |

### Bilaketa (ripgrep)

| Tresna                   | Deskribapena                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `search_files`         | Aurkitu fitxategiak izenez — azkar                                    |
| `find_by_glob`         | Aurkitu glob ereduak erabiliz (`**/*.ts`, `src/**/*`)               |
| `search_content`       | Bilatu fitxategien barruan regex-ekin (PCRE2)                        |
| `count_matches`        | Zenbat aldiz agertzen da eredu hau?                      |
| `diff_files`           | Konparatu bi fitxategi aldez edo                    |
| `bulk_rename`          | Aldatu fitxategi askoren izena aldi berean eredu batekin. `dryRun` aurrenikusteko |
| `get_project_patterns` | Irakurri kode-ereduak AGENTS.md fitxategitik                           |

Bilaketa-tresna guztiek onartzen dute: `fileType` iragazkia, `excludePatterns`, `ignoreCase`, `maxResults`, `context`.

### Kode-ulermena (Tree-sitter — 17 hizkuntza)

TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift

| Tresna                     | Deskribapena                                        |
| ------------------------ | -------------------------------------------------- |
| `get_symbols_overview`   | Zerrendatu fitxategi bateko ikur maila gorenetakoak                   |
| `find_symbol`            | Aurkitu ikurra eredu bidez (`MyClass/myMethod`)        |
| `find_symbol_references` | Non erabiltzen da ikur hau kode-oinarira osoan?     |
| `find_unused_symbols`    | Aurkitu inork deitzen ez duen kode hilua                        |
| `find_deprecated_usages` | Aurkitu konpondu beharko zenituzkeen `@deprecated` ikurrei deiak |
| `find_imports`           | Zer inportatzen du fitxategi honek?                        |
| `find_dependents`        | Nork du fitxategi honen mendekotasuna?                          |
| `find_related_tests`     | Non daude fitxategi honentzako probak?                 |
| `find_unused_imports`    | Garbitu ezer egiten ez duten inportazioak                   |
| `find_string_literals`   | Aurkitu eredu batekin bat datozen kate-balioak              |
| `get_callers`            | Nork dei egiten dio funtzio honi?                           |
| `get_callees`            | Zeri dei egiten dio funtzio honek?                      |
| `get_file_stats`         | Lerroak, ikurrak, inportazio/esportazio kopurua              |
| `get_file_summary`       | Giza-irakurgarri den fitxategi-laburpena                        |

### Kode-edizioa (AST bidezkoa)

| Tresna                                           | Deskribapena                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `replace_symbol_body`                          | Trukatu inplementazioa, mantendu sinadura — arriskurik gabeko grep        |
| `insert_before_symbol` / `insert_after_symbol` | Gehitu kodea ikura dagoen lekuan, lerro-zenbakiz ez        |
| `rename_symbol`                                | Aldatu izena erabiltzen den leku guztietan. `dryRun` aurrenikusteko        |
| `extract_method`                               | Atera lerroak funtzio berri batera — aldagai askeak automatikoki detektatuak |
| `inline_variable`                              | Ordeztu aldagaia bere balioarekin erabiltzen den leku guztietan          |
| `introduce_parameter`                          | Bihurtu adierazpen bat funtzio-parametro bat                  |

### Desegin

| Tresna          | Deskribapena                                                      |
| ------------- | ---------------------------------------------------------------- |
| `undo`        | Desegin azken edizioa. Edo azken N edizioak. Klik bat eta desagertu da |
| `undo_peek`   | Aurrenikusi desegiteak zer leheneratuko lukeen — egiaztatu konpromitu aurretik        |
| `undo_all`    | Berrezarri dena saioa hasi aurretik zegoen eran   |
| `undo_status` | Egiaztatu desegite-pilaren sakonera eta zaharkitzegitasun-zaindariaren egoera                 |

Zaharkitzegitasun-zaindaria (lehenespenez Aktibatuta): IA saiotik kanpo fitxategi bat editatu baduzu, IA-ren edizioa baztertu egiten da zure lana isilpean gain-idatzi beharrean. Konfiguratu iraunkortasuna `MCP_UNDO_PERSIST_DIR` bidez.

### Behagarritasuna

| Tresna               | Deskribapena                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `get_server_stats` | Egiaztatu zerbitzariaren osasuna — martxa-denbora, tresna-errendimendua (p50/p95), desegite-sakonera, konfigurazioa begirada batean |

---

## Arkitektura

```
src/
├── index.ts               # Zerbitzariaren sarrera, roots protokoloa, itzaltzea
├── constants.ts           # SSOT: konfigurazio lehenespenak, errore-mezuak, SupportedLanguage
├── config/                # Exekuzio-garaiko konfigurazio-ebazpena (env > fitxategia > lehenespenak)
├── validation/            # Bide-normalizazioa, esteka sinbolikoen ebazpena, roots egiaztapena
├── search/                # ripgrep zorroa (PCRE2, byte-muga, aldi baterako multzoa)
├── semantic/              # Tree-sitter analisia + configs/ (17 hizkuntza)
├── tools/                 # 8 antolatzaile-modulu, 50 tresna-inplementazio
├── undo/                  # Desegite-pila, zaharkitzegitasun-zaindaria, refaktorizazio konposatuak
├── intelligence/          # Asmoa → tresna-gomendio motorea
├── operations/            # Diff, izen-aldaketa masiboa, proiektu-ereduak
├── schemas/               # Zod baliozkotze-ereduak
├── file-operations/       # Irakurri/idatzi/behaki utilitateak
├── types/                 # MCP SDK gehigarriak
├── errors/                # BaseError + formateatzaileak
└── utils/                 # Erregistratzailea, metrikak, tarifaren muga, zirkuitu-etetea,
                            # aldi berekotasuna, berriro saiatu, fs-utils, api-version
```

### Erabaki gakoak

- **Hasieran izozten ez den konfigurazioa** — getter funtzioek env aldagaiak dei-unean ebazten dituzte. Aldatu aldagai bat, berrabiarazirik gabe
- **Esteka sinbolikoek ez dutesandbox-a iruzurtuko** — `cachedRealpath`-ek bide guztiak ebazten ditu egiaztatu aurretik. LRU cache (5s TTL) azkar mantentzen du
- **IA-k ez du zure aldaketak isilpean gain-idatziko** — zaharkitzegitasun-zaindariak baztertu egiten ditu saiotik kanpo aldatutako fitxategietako edizioak. `MCP_STALENESS_GUARD=0` desgaitzeko
- **Edizioak atomikoak dira edo batere ez** — aldi baterako fitxategia + izen-aldaketaren eredua. Zure fitxategia osoki aldatzen da edo ukitu gabe geratzen da
- **Fitxategi handiek ez dute memoria puzten** — >1MBeko fitxategien desegiteak diff adabakiak gordetzen ditu, kopia osoak ez
- **Ripgrep-k ez du zure RAMa irengo** — OOM atarian SIGTERM. Gehienez 8 aldi baterako prozesu, 30s itxaronaldia
- **Tresna bakar batek ezin du zerbitzaria monopolizatu** — token ontzia tresna bakoitzeko (60/min lehenespenez)
- **AST aurretik, regex atzeko-erori gisa** — aldagai askeen analisia 17 hizkuntzatan tree-sitter bidez. Regex soilik AST-k analizatu ezin duenean

---

## Garapena

```bash
pnpm test              # Exekutatu probak (vitest)
pnpm test:run          # CI modua
pnpm test:coverage     # Estaldurarekin
pnpm run build         # Eraiki (swc → dist/)
pnpm run clean         # Garbitu dist/
pnpm run clean && pnpm run build  # Garbitu eta eraiki
pnpm run watch         # Behaketa-modua
pnpm run eslint        # lint egiaztapena (0 errore, 0 abisu)
pnpm run eslint:fix    # Lint + zuzenketa automatikoa
pnpm run typecheck     # TypeScript egiaztapen zorrotza
```

## Proiektu laguna

[**Backup Pro**](https://github.com/lordc-dev/backup-pro) — bertsionatu fitxategi bakoitza IA-k ukitu aurretik. Bilatu babeskopiak, alderatu aldaketak, lehengoratu klik batekin. SHA-256 osotasuna, deduplikazioa, batch eragiketak. Desegiteko pilak uneko saioa babesten du; Backup Pro saioen artean babesten du.

## Lizentzia

MIT — Ikusi [jatorrizko MCP Servers biltegia](https://github.com/modelcontextprotocol/servers) xehetasunetarako.

## Kredituak

- Jatorrizkoa: [Anthropic MCP Servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- MCP SDK: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)