# Filesystem Pro

[English](../README.md) | [Español](README.es.md) | [Català](README.ca.md) | [Galego](README.gl.md) | [Euskara](README.eu.md) | [Français](README.fr.md) | [Português](README.pt.md)

**Chaque session de codage avec l'IA commence pareillement : vous donnez l'accès, elle casse quelque chose, et vous êtes bloqué.** Filesystem Pro résout ça. L'IA peut lire, chercher, éditer et refactorer votre code avec de vrais outils de développeur — ripgrep trouve le code rapidement, tree-sitter comprend la structure (pas de devinettes avec des regex), et chaque édition est annulable en un clic. 50 outils. Zéro confiance par défaut. Fonctionne avec Claude, Cursor, et toute IA compatible MCP.

> **Fork amélioré** du [serveur MCP Filesystem d'Anthropic](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — 11 → 50 outils, recherche ripgrep, compréhension du code par tree-sitter, annulation complète, et résilience de production.

_Construit et maintenu par :_

[![LinkedIn](https://img.shields.io/badge/LinkedIn-albertocastrootero-0A66C2.svg?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/albertocastrootero)

---

## Pourquoi Filesystem Pro ?

- **L'IA ne trouve pas votre code ?** — recherche ripgrep ~10x plus rapide que glob Node.js. Trouve ce qui compte, ignore le reste.
- **L'IA édite la mauvaise chose ?** — tree-sitter comprend la structure de votre code en 17 langages. Les modifications atteignent le bon symbole, pas une approximation de regex.
- **L'IA casse quelque chose et vous êtes bloqué ?** — pile d'annulation complète avec retour en arrière en un clic. Le garde-fou d'obsolescence empêche les écrasements silencieux de fichiers que vous avez modifiés en dehors de la session.
- **Vous vous inquiétez de ce que l'IA peut toucher ?** — protocole roots activé par défaut. Liens symboliques résolus, chemins validés, limité en débit. Zéro confiance dès le départ.
- **50 outils, pas 11** — tout ce que le serveur original propose, plus l'analyse sémantique, le refactoring basé sur l'AST, la compréhension du code, et l'observabilité.

---

## vs Original (`@modelcontextprotocol/server-filesystem`)

|                           | Original                           | Filesystem Pro                                                                         |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| **Outils**                | 11                                 | 50                                                                                     |
| **Architecture**          | Monolithique (2 fichiers)          | Modulaire (14 modules)                                                                 |
| **Recherche**             | glob Node.js                       | ripgrep (PCRE2, ~10x plus rapide)                                                      |
| **Compréhension du code** | Aucune                             | Tree-sitter (17 langages), hiérarchie d'appels, détection de code mort                 |
| **Refactoring**           | Aucun                              | 6 outils d'édition basés sur l'AST (renommer, extraire, inliner, etc.)                 |
| **Annulation**            | Aucune                             | Pile complète + garde-fou d'obsolescence + compression par diff                        |
| **Observabilité**         | Aucune                             | Journalisation JSON structurée, métriques en mémoire (p50/p95), outil de stats serveur |
| **Surveillance**          | Aucune                             | Surveillance de répertoire chokidar                                                    |
| **Configuration**         | Arguments CLI uniquement           | Variables d'env + config JSON + CLI (résolution à l'exécution)                         |
| **Protocole Roots**       | Args CLI + roots, erreur si absent | Activé par défaut, repli illimité                                                      |
| **Sécurité**              | Vérification basique de chemin     | Chemins résolus par symlink, cache LRU, sécurité EACCES/EPERM, limitation de débit     |
| **Résilience**            | Aucune                             | Disjoncteur, relance d'E/S avec backoff, limitation de débit par outil                 |

## Installation

### 1. Installer ripgrep

| Platforme            | Commande                                 |
| -------------------- | ---------------------------------------- |
| **macOS**            | `brew install ripgrep`                   |
| **Debian/Ubuntu**    | `sudo apt install ripgrep`               |
| **Fedora**           | `sudo dnf install ripgrep`               |
| **Arch**             | `sudo pacman -S ripgrep`                 |
| **Windows (winget)** | `winget install BurntSushi.ripgrep.MSVC` |
| **Windows (scoop)**  | `scoop install ripgrep`                  |
| **Windows (choco)**  | `choco install ripgrep`                  |

> Alternativement, téléchargez depuis les [releases de ripgrep](https://github.com/BurntSushi/ripgrep/releases).

### 2. Installer et compiler le serveur

```bash
cd /path/to/filesystem-pro
pnpm install
pnpm run build
```

## Configuration

Ajoutez à la configuration de votre client MCP :

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

Alternativement, passez les répertoires autorisés en arguments CLI (repli quand les roots ne sont pas disponibles) :

```bash
node dist/index.js /path/to/dir1 /path/to/dir2
```

### Protocole Roots — garder l'IA dans votre répertoire projet

Le [protocole MCP Roots](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) indique au serveur quels répertoires l'IA est autorisée à toucher. Activé par défaut (`MCP_ROOTS_RESTRICTION=1`) :

1. Au démarrage, le serveur demande au client les roots de l'espace de travail (ex. `file:///home/user/myapp`)
2. Chaque opération sur les fichiers est restreinte à ces roots — l'IA ne peut pas s'échapper de votre projet
3. Si les roots changent en cours de session, le serveur se met à jour automatiquement
4. Si votre client ne supporte pas les roots, le serveur bascule en **mode illimité**

> **OpenCode** (v1.15.x) n'implémente pas le protocole Roots — le serveur journalise `[Roots] Client doesn't support roots protocol - running in unrestricted mode`. Voir [opencode/issues](https://github.com/anomalyco/opencode/issues).

### Variables d'environnement

#### Sécurité

| Variable                      | Par défaut | Description                                                                            |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `MCP_ROOTS_RESTRICTION`       | `1` (ON)   | Garder l'IA dans votre projet. Mettre `0` ou `false` pour débloquer l'accès complet    |
| `MCP_STALENESS_GUARD`         | `1` (ON)   | Empêcher l'IA d'écraser les fichiers modifiés ailleurs. `0` ou `false` pour désactiver |
| `MCP_MAX_FILE_SIZE_BYTES`     | `52428800` | Taille max de fichier lisible par l'IA (50Mo). Empêche le vidage de gros fichiers      |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `2097152`  | Sortie de recherche max (2Mo). Empêche l'explosion du contexte                         |

#### Annulation

| Variable                   | Par défaut | Description                                                                |
| -------------------------- | ---------- | -------------------------------------------------------------------------- |
| `MCP_UNDO_PERSIST_DIR`     |            | Sauvegarder la pile d'annulation sur disque pour survivre aux redémarrages |
| `MCP_UNDO_STACK_SIZE`      | `100`      | Nombre d'éditions annulables                                               |
| `MCP_UNDO_MAX_ENTRY_BYTES` | `1000000`  | Taille max d'une entrée d'annulation avant compression par diff (1Mo)      |

#### Performance

| Variable                | Par défaut | Description                                      |
| ----------------------- | ---------- | ------------------------------------------------ |
| `MCP_CACHE_DISABLED`    | `false`    | Désactiver tout le cache. Utile pour le débogage |
| `MCP_SYMBOL_CACHE_SIZE` | `100`      | Nombre de jeux de symboles à garder en mémoire   |
| `MCP_SYMBOL_CACHE_TTL`  | `60000`    | Durée de vie du cache de symboles (ms)           |
| `MCP_AST_CACHE_SIZE`    | `25`       | Nombre d'AST à garder parsés                     |
| `MCP_AST_CACHE_TTL`     | `60000`    | Durée de vie du cache d'AST (ms)                 |
| `MCP_MAX_CONCURRENT_RG` | `8`        | Nombre max de processus ripgrep simultanés       |
| `MCP_RG_TIMEOUT_MS`     | `30000`    | Tuer ripgrep s'il dépasse ce délai (ms)          |

#### Débogage

| Variable                  | Par défaut | Description                                              |
| ------------------------- | ---------- | -------------------------------------------------------- |
| `MCP_STRUCTURED_LOGS`     | `false`    | Journaux JSON pour chaque appel d'outil et chaque erreur |
| `LOG_ROOTS_EVENTS`        | `false`    | Journaliser les événements du protocole roots            |
| `DEBUG_MCP` / `MCP_DEBUG` | `false`    | Mode débogage avec statut du sélecteur d'outils          |

#### Avancé

| Variable            | Par défaut | Description                                                |
| ------------------- | ---------- | ---------------------------------------------------------- |
| `MCP_CONFIG_FILE`   |            | Fichier de config JSON (fusionné avec les variables d'env) |
| `MCP_TEMPLATES_DIR` |            | Répertoire de modèles personnalisés                        |

La configuration est résolue **à l'appel** (pas à l'import) via des fonctions d'accès. Les modifications de variables d'env et du fichier de config prennent effet immédiatement sans redémarrage.

---

## Outils (50)

### Lecture et écriture

| Outil                 | Description                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- |
| `read_text_file`      | Lire n'importe quel fichier. Utiliser `head`/`tail` pour lire uniquement le nécessaire |
| `read_media_file`     | Lire des images et fichiers audio en base64                                            |
| `read_multiple_files` | Lire plusieurs fichiers d'un coup — sans attendre                                      |
| `write_file`          | Créer ou écraser un fichier. Atomique — ne laisse pas de fichiers cassés               |
| `edit_file`           | Éditions ciblées par ligne. `dryRun` d'abord pour prévisualiser le diff                |
| `delete_file`         | Supprimer un fichier (annulable)                                                       |
| `delete_path`         | Supprimer tout fichier ou répertoire — détecte automatiquement le type                 |

### Répertoires

| Outil                               | Description                                                         |
| ----------------------------------- | ------------------------------------------------------------------- |
| `create_directory`                  | Créer des répertoires — parents inclus, sans souci                  |
| `list_directory`                    | Lister le contenu avec étiquettes `[FILE]`/`[DIR]`                  |
| `list_directory_with_sizes`         | Lister avec tailles — trouver ce qui consomme l'espace disque       |
| `directory_tree`                    | Arborescence récursive complète. Filtrer avec `exclude`, `maxDepth` |
| `move_file`                         | Déplacer ou renommer — atomique, pas d'états partiels               |
| `delete_directory`                  | Supprimer un répertoire. `recursive=true` pour les non-vides        |
| `get_file_info`                     | Métadonnées du fichier : taille, dates, permissions                 |
| `list_allowed_directories`          | Vérifier quels répertoires l'IA est autorisée à toucher             |
| `watch_directory` / `stop_watching` | Être notifié quand les fichiers changent en temps réel              |

### Recherche (ripgrep)

| Outil                  | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `search_files`         | Trouver des fichiers par nom — rapide                                            |
| `find_by_glob`         | Trouver avec des motifs glob (`**/*.ts`, `src/**/*`)                             |
| `search_content`       | Chercher dans les fichiers avec des regex (PCRE2)                                |
| `count_matches`        | Combien de fois ce motif apparaît-il ?                                           |
| `diff_files`           | Comparer deux fichiers côte à côte                                               |
| `bulk_rename`          | Renommer plusieurs fichiers d'un coup avec un motif. `dryRun` pour prévisualiser |
| `get_project_patterns` | Lire les motifs de codage depuis AGENTS.md                                       |

Tous les outils de recherche supportent : filtre `fileType`, `excludePatterns`, `ignoreCase`, `maxResults`, `context`.

### Compréhension du code (Tree-sitter — 17 langages)

TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift

| Outil                    | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `get_symbols_overview`   | Lister les symboles de premier niveau dans un fichier    |
| `find_symbol`            | Trouver un symbole par motif (`MyClass/myMethod`)        |
| `find_symbol_references` | Où ce symbole est-il utilisé dans le codebase ?          |
| `find_unused_symbols`    | Trouver le code mort que personne n'appelle              |
| `find_deprecated_usages` | Trouver les appels aux symboles `@deprecated` à corriger |
| `find_imports`           | Qu'est-ce que ce fichier importe ?                       |
| `find_dependents`        | Qui dépend de ce fichier ?                               |
| `find_related_tests`     | Où sont les tests pour ce fichier ?                      |
| `find_unused_imports`    | Nettoyer les imports inutiles                            |
| `find_string_literals`   | Trouver les valeurs de chaîne correspondant à un motif   |
| `get_callers`            | Qui appelle cette fonction ?                             |
| `get_callees`            | Que fait cette fonction appeler ?                        |
| `get_file_stats`         | Lignes, symboles, compteur imports/exports               |
| `get_file_summary`       | Résumé de fichier lisible par l'humain                   |

### Édition de code (basée sur l'AST)

| Outil                                          | Description                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `replace_symbol_body`                          | Remplacer l'implémentation, garder la signature — pas de risque grep             |
| `insert_before_symbol` / `insert_after_symbol` | Ajouter du code exactement où le symbole se trouve, pas par numéro de ligne      |
| `rename_symbol`                                | Renommer partout où c'est utilisé. `dryRun` pour prévisualiser d'abord           |
| `extract_method`                               | Extraire des lignes dans une nouvelle fonction — variables libres auto-détectées |
| `inline_variable`                              | Remplacer une variable par sa valeur partout où elle est utilisée                |
| `introduce_parameter`                          | Transformer une expression en paramètre de fonction                              |

### Annulation

| Outil         | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| `undo`        | Annuler la dernière édition. Ou les N dernières. Un clic et c'est parti              |
| `undo_peek`   | Prévisualiser ce que l'annulation restaurerait — vérifier avant de valider           |
| `undo_all`    | Tout remettre comme avant le début de la session                                     |
| `undo_status` | Vérifier la profondeur de la pile d'annulation et l'état du garde-fou d'obsolescence |

Garde-fou d'obsolescence (activé par défaut) : si vous avez modifié un fichier en dehors de la session IA, l'édition de l'IA est rejetée au lieu d'écraser silencieusement votre travail. Configurer la persistance via `MCP_UNDO_PERSIST_DIR`.

### Observabilité

| Outil              | Description                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `get_server_stats` | Vérifier la santé du serveur — uptime, performance des outils (p50/p95), profondeur d'annulation, config en un coup d'œil |

---

## Architecture

```
src/
├── index.ts               # Point d'entrée du serveur, protocole roots, arrêt
├── constants.ts           # SSOT : défauts de config, messages d'erreur, SupportedLanguage
├── config/                # Résolution de config à l'exécution (env > fichier > défauts)
├── validation/            # Normalisation des chemins, résolution des symlinks, vérification des roots
├── search/                # Wrapper ripgrep (PCRE2, limite d'octets, pool concurrent)
├── semantic/              # Analyse tree-sitter + configs/ (17 langages)
├── tools/                 # 8 modules orchestrateurs, 50 implémentations d'outils
├── undo/                  # Pile d'annulation, garde-fou d'obsolescence, refactors composites
├── intelligence/          # Moteur de recommandation intention → outil
├── operations/            # Diff, renommage en masse, motifs de projet
├── schemas/               # Schémas de validation Zod
├── file-operations/       # Utilitaires de lecture/écriture/surveillance
├── types/                 # Augmentations du SDK MCP
├── errors/                # BaseError + formateurs
└── utils/                 # Logger, métriques, limiteur de débit, disjoncteur,
                            # concurrence, relance, fs-utils, api-version
```

### Décisions clés

- **Une config qui ne gèle pas au démarrage** — les fonctions d'accès résolvent les variables d'env à l'appel. Changer une variable, pas de redémarrage nécessaire
- **Les symlinks ne tromperont pas le bac à sable** — `cachedRealpath` résout chaque chemin avant de le vérifier. Cache LRU (TTL 5s) pour rester rapide
- **L'IA n'écrasera pas silencieusement vos modifications** — le garde-fou d'obsolescence rejette les éditions sur les fichiers modifiés en dehors de la session. `MCP_STALENESS_GUARD=0` pour désactiver
- **Les éditions sont atomiques ou pas du tout** — motif fichier temporaire + renommage. Votre fichier change complètement ou reste intact
- **Les gros fichiers ne gonflent pas la mémoire** — l'annulation pour les fichiers >1Mo stocke des patches de diff, pas des copies complètes
- **Ripgrep ne dévorera pas votre RAM** — SIGTEM au seuil OOM. Max 8 processus simultanés, délai de 30s
- **Aucun outil ne peut monopoliser le serveur** — seau de jetons par outil (60/min par défaut)
- **AST d'abord, regex en repli** — analyse des variables libres en 17 langages via tree-sitter. Regex uniquement quand l'AST ne peut pas parser

---

## Développement

```bash
pnpm test              # Lancer les tests (vitest)
pnpm test:run          # Mode CI
pnpm test:coverage     # Avec couverture
pnpm run build         # Compiler (swc → dist/)
pnpm run clean         # Nettoyer dist/
pnpm run clean && pnpm run build  # Compilation propre
pnpm run watch         # Mode surveillance
pnpm run eslint        # Vérification lint (0 erreurs, 0 avertissements)
pnpm run eslint:fix    # Lint + corrections automatiques
pnpm run typecheck     # Vérification stricte TypeScript
```

## Projet complémentaire

[**Backup Pro**](https://github.com/lordc-dev/backup-pro) — versionnez chaque fichier avant que l'IA y touche. Recherchez les sauvegardes, comparez les changements, restaurez en un clic. Intégrité SHA-256, déduplication, opérations par lot. La pile d'annulation protège votre session actuelle ; Backup Pro protège entre les sessions.

## Licence

MIT — Consultez le [dépôt original MCP Servers](https://github.com/modelcontextprotocol/servers) pour plus de détails.

## Crédits

- Original : [Anthropic MCP Servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- MCP SDK : [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
