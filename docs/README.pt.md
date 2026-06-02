# Filesystem Pro

[English](../README.md) | [Español](README.es.md) | [Català](README.ca.md) | [Galego](README.gl.md) | [Euskara](README.eu.md) | [Français](README.fr.md) | [Português](README.pt.md)

**Toda a sessão de programação com IA começa da mesma forma: dás acesso, ela parte alguma coisa, e ficas preso.** O Filesystem Pro resolve isso. A IA consegue ler, pesquisar, editar e refatorar o teu código com ferramentas de verdade — o ripgrep encontra código rápido, o tree-sitter entende a estrutura (sem adivinhar com regex), e cada edição é reversível com um clique. 50 ferramentas. Zero confiança por padrão. Funciona com Claude, Cursor e qualquer IA compatível com MCP.

> **Fork melhorado** do [Anthropic MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — 11 → 50 ferramentas, pesquisa ripgrep, compreensão de código tree-sitter, undo completo e resiliência de produção.

_Construído e mantido por:_

[![LinkedIn](https://img.shields.io/badge/LinkedIn-albertocastrootero-0A66C2.svg?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/albertocastrootero)

---

## Porque Filesystem Pro?

- **A IA não encontra o teu código?** — pesquisa ripgrep ~10x mais rápida que Node.js glob. Encontra o que importa, ignora o que não importa.
- **A IA edita a coisa errada?** — o tree-sitter percebe a estrutura do teu código em 17 linguagens. As edições acertam no símbolo certo, não numa estimativa de regex.
- **A IA parte algo e ficas preso?** — pilha de undo completa com reversão num clique. O staleness guard impede sobrescritas silenciosas de ficheiros que alteraste fora da sessão.
- **Preocupado com o que a IA pode tocar?** — roots protocol ATIVO por padrão. Symlinks resolvidos, caminhos validados, com limite de taxa. Zero confiança logo de saída.
- **50 ferramentas, não 11** — tudo o que o servidor original tem, mais análise semântica, refatoração baseada em AST, compreensão de código e observabilidade.

---

## vs Original (`@modelcontextprotocol/server-filesystem`)

|                           | Original                         | Filesystem Pro                                                                    |
| ------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| **Ferramentas**           | 11                               | 50                                                                                |
| **Arquitetura**           | Monolítica (2 ficheiros)         | Modular (14 módulos)                                                              |
| **Pesquisa**              | Node.js glob                     | ripgrep (PCRE2, ~10x mais rápido)                                                 |
| **Compreensão de código** | Nenhuma                          | Tree-sitter (17 linguagens), hierarquia de chamadas, deteção de código morto      |
| **Refatoração**           | Nenhuma                          | 6 ferramentas de edição AST (renomear, extrair, inline, etc.)                     |
| **Undo**                  | Nenhuma                          | Pilha completa + staleness guard + compressão baseada em diff                     |
| **Observabilidade**       | Nenhuma                          | Logs JSON estruturados, métricas em memória (p50/p95), ferramenta de estatísticas |
| **Monitorização**         | Nenhuma                          | Watcher de diretórios chokidar                                                    |
| **Configuração**          | Apenas argumentos CLI            | Variáveis de ambiente + config JSON + CLI (resolução em runtime)                  |
| **Roots Protocol**        | Args CLI + roots, erro se nenhum | ATIVO por padrão, fallback sem restrições                                         |
| **Segurança**             | Verificação básica de caminho    | Caminhos com symlinks resolvidos, cache LRU, seguro EACCES/EPERM, limite de taxa  |
| **Resiliência**           | Nenhuma                          | Circuit breaker, retry de I/O com backoff, limite de taxa por ferramenta          |

## Instalação

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

> Em alternativa, transfere a partir de [ripgrep releases](https://github.com/BurntSushi/ripgrep/releases).

### 2. Instalar e compilar o servidor

```bash
cd /path/to/filesystem-pro
pnpm install
pnpm run build
```

## Configuração

Adiciona à configuração do teu cliente MCP:

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

Em alternativa, passa os diretórios permitidos como argumentos CLI (fallback quando os roots não estão disponíveis):

```bash
node dist/index.js /path/to/dir1 /path/to/dir2
```

### Roots Protocol — mantém a IA no diretório do teu projeto

O [MCP Roots Protocol](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) diz ao servidor quais os diretórios que a IA tem permissão para tocar. ATIVO por padrão (`MCP_ROOTS_RESTRICTION=1`):

1. Ao iniciar, o servidor pergunta ao teu cliente pelas roots do espaço de trabalho (ex. `file:///home/user/myapp`)
2. Cada operação de ficheiro é restringida a essas roots — a IA não consegue escapar do teu projeto
3. Se as roots mudarem a meio da sessão, o servidor atualiza automaticamente
4. Se o teu cliente não suportar roots, o servidor recorre ao **modo sem restrições**

> O **OpenCode** (v1.15.x) não implementa o Roots Protocol — o servidor regista `[Roots] Client doesn't support roots protocol - running in unrestricted mode`. Consulta [opencode/issues](https://github.com/anomalyco/opencode/issues).

### Variáveis de Ambiente

#### Segurança

| Variável                      | Predefinição | Descrição                                                                                             |
| ----------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `MCP_ROOTS_RESTRICTION`       | `1` (ATIVO)  | Mantém a IA dentro do teu projeto. Define `0` ou `false` para desbloquear acesso total                |
| `MCP_STALENESS_GUARD`         | `1` (ATIVO)  | Impede a IA de sobrescrever ficheiros que alteraste noutro lado. `0` ou `false` para desativar        |
| `MCP_MAX_FILE_SIZE_BYTES`     | `52428800`   | Tamanho máximo de ficheiro que a IA pode ler (50MB). Não deixa despejar ficheiros enormes no contexto |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `2097152`    | Tamanho máximo de saída de pesquisa (2MB). Evita que o contexto exploda                               |

#### Undo

| Variável                   | Predefinição | Descrição                                                        |
| -------------------------- | ------------ | ---------------------------------------------------------------- |
| `MCP_UNDO_PERSIST_DIR`     |              | Guardar pilha de undo em disco para sobreviver a reinícios       |
| `MCP_UNDO_STACK_SIZE`      | `100`        | Quantas edições podes reverter                                   |
| `MCP_UNDO_MAX_ENTRY_BYTES` | `1000000`    | Tamanho máximo da entrada de undo antes da compressão diff (1MB) |

#### Desempenho

| Variável                | Predefinição | Descrição                                          |
| ----------------------- | ------------ | -------------------------------------------------- |
| `MCP_CACHE_DISABLED`    | `false`      | Desativar toda a cache. Útil para depuração        |
| `MCP_SYMBOL_CACHE_SIZE` | `100`        | Quantos conjuntos de símbolos manter em memória    |
| `MCP_SYMBOL_CACHE_TTL`  | `60000`      | Tempo de vida da cache de símbolos (ms)            |
| `MCP_AST_CACHE_SIZE`    | `25`         | Quantos ASTs manter analisados                     |
| `MCP_AST_CACHE_TTL`     | `60000`      | Tempo de vida da cache de AST (ms)                 |
| `MCP_MAX_CONCURRENT_RG` | `8`          | Máximo de processos ripgrep em execução simultânea |
| `MCP_RG_TIMEOUT_MS`     | `30000`      | Terminar ripgrep se demorar mais do que isto (ms)  |

#### Depuração

| Variável                  | Predefinição | Descrição                                               |
| ------------------------- | ------------ | ------------------------------------------------------- |
| `MCP_STRUCTURED_LOGS`     | `false`      | Logs JSON para cada chamada de ferramenta e erro        |
| `LOG_ROOTS_EVENTS`        | `false`      | Registar eventos do roots protocol                      |
| `DEBUG_MCP` / `MCP_DEBUG` | `false`      | Modo de depuração com estado do selector de ferramentas |

#### Avançado

| Variável            | Predefinição | Descrição                                                     |
| ------------------- | ------------ | ------------------------------------------------------------- |
| `MCP_CONFIG_FILE`   |              | Ficheiro de config JSON (combinado com variáveis de ambiente) |
| `MCP_TEMPLATES_DIR` |              | Diretório de templates personalizados                         |

A configuração é resolvida no **momento da chamada** (não no momento da importação) através de funções getter. Alterações nas variáveis de ambiente e no ficheiro de config produzem efeito imediato sem reinício.

---

## Ferramentas (50)

### Leitura e Escrita

| Ferramenta            | Descrição                                                                    |
| --------------------- | ---------------------------------------------------------------------------- |
| `read_text_file`      | Ler qualquer ficheiro. Usa `head`/`tail` para ler apenas o que precisas      |
| `read_media_file`     | Ler imagens e ficheiros áudio como base64                                    |
| `read_multiple_files` | Ler vários ficheiros de uma vez — sem espera                                 |
| `write_file`          | Criar ou sobrescrever um ficheiro. Atómico — não deixa ficheiros partidos    |
| `edit_file`           | Fazer edições direcionadas por linha. `dryRun` primeiro para preview do diff |
| `delete_file`         | Apagar um ficheiro (reversível)                                              |
| `delete_path`         | Apagar qualquer ficheiro ou diretório — deteta automaticamente o tipo        |

### Diretórios

| Ferramenta                          | Descrição                                                    |
| ----------------------------------- | ------------------------------------------------------------ |
| `create_directory`                  | Criar diretórios — pais incluídos, sem preocupações          |
| `list_directory`                    | Listar conteúdo com etiquetas `[FILE]`/`[DIR]`               |
| `list_directory_with_sizes`         | Listar com tamanhos — descobrir o que ocupa espaço no disco  |
| `directory_tree`                    | Árvore recursiva completa. Filtrar com `exclude`, `maxDepth` |
| `move_file`                         | Mover ou renomear — atómico, sem estados parciais            |
| `delete_directory`                  | Apagar um diretório. `recursive=true` para não vazio         |
| `get_file_info`                     | Metadados do ficheiro: tamanho, datas, permissões            |
| `list_allowed_directories`          | Verificar em que diretórios a IA tem permissão para tocar    |
| `watch_directory` / `stop_watching` | Ser notificado quando os ficheiros mudam em tempo real       |

### Pesquisa (ripgrep)

| Ferramenta             | Descrição                                                                 |
| ---------------------- | ------------------------------------------------------------------------- |
| `search_files`         | Encontrar ficheiros por nome — rápido                                     |
| `find_by_glob`         | Encontrar com padrões glob (`**/*.ts`, `src/**/*`)                        |
| `search_content`       | Pesquisar dentro de ficheiros com regex (PCRE2)                           |
| `count_matches`        | Quantas vezes aparece este padrão?                                        |
| `diff_files`           | Comparar dois ficheiros lado a lado                                       |
| `bulk_rename`          | Renomear muitos ficheiros de uma vez com um padrão. `dryRun` para preview |
| `get_project_patterns` | Ler padrões de programação do AGENTS.md                                   |

Todas as ferramentas de pesquisa suportam: filtro `fileType`, `excludePatterns`, `ignoreCase`, `maxResults`, `context`.

### Compreensão de Código (Tree-sitter — 17 linguagens)

TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift

| Ferramenta               | Descrição                                                      |
| ------------------------ | -------------------------------------------------------------- |
| `get_symbols_overview`   | Listar símbolos de topo num ficheiro                           |
| `find_symbol`            | Encontrar símbolo por padrão (`MyClass/myMethod`)              |
| `find_symbol_references` | Onde é este símbolo usado na codebase?                         |
| `find_unused_symbols`    | Encontrar código morto que ninguém chama                       |
| `find_deprecated_usages` | Encontrar chamadas a símbolos `@deprecated` que deves corrigir |
| `find_imports`           | O que importa este ficheiro?                                   |
| `find_dependents`        | Quem depende deste ficheiro?                                   |
| `find_related_tests`     | Onde estão os testes para este ficheiro?                       |
| `find_unused_imports`    | Limpar imports que não fazem nada                              |
| `find_string_literals`   | Encontrar valores de string que correspondam a um padrão       |
| `get_callers`            | Quem chama esta função?                                        |
| `get_callees`            | O que é que esta função chama?                                 |
| `get_file_stats`         | Contagem de linhas, símbolos, imports/exports                  |
| `get_file_summary`       | Resumo legível do ficheiro                                     |

### Edição de Código (baseada em AST)

| Ferramenta                                     | Descrição                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `replace_symbol_body`                          | Trocar a implementação, manter a assinatura — sem risco de grep                  |
| `insert_before_symbol` / `insert_after_symbol` | Adicionar código exatamente onde o símbolo está, não por número de linha         |
| `rename_symbol`                                | Renomear em todos os sítios onde é usado. `dryRun` para preview primeiro         |
| `extract_method`                               | Extrair linhas para uma nova função — variáveis livres detetadas automaticamente |
| `inline_variable`                              | Substituir uma variável pelo seu valor onde quer que seja usada                  |
| `introduce_parameter`                          | Transformar uma expressão num parâmetro de função                                |

### Undo

| Ferramenta    | Descrição                                                                 |
| ------------- | ------------------------------------------------------------------------- |
| `undo`        | Reverter a última edição. Ou as últimas N edições. Um clique e desaparece |
| `undo_peek`   | Preview do que o undo restauraria — verificar antes de confirmar          |
| `undo_all`    | Repor tudo como era antes da sessão ter começado                          |
| `undo_status` | Verificar profundidade da pilha de undo e estado do staleness guard       |

Staleness guard (ATIVO por padrão): Se editaste um ficheiro fora da sessão de IA, a edição da IA é rejeitada em vez de sobrescrever silenciosamente o teu trabalho. Configura persistência via `MCP_UNDO_PERSIST_DIR`.

### Observabilidade

| Ferramenta         | Descrição                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `get_server_stats` | Verificar saúde do servidor — uptime, desempenho das ferramentas (p50/p95), profundidade undo, config de relance |

---

## Arquitetura

```
src/
├── index.ts               # Entrada do servidor, roots protocol, encerramento
├── constants.ts           # SSOT: predefinições de config, mensagens de erro, SupportedLanguage
├── config/                # Resolução de config em runtime (env > ficheiro > predefinições)
├── validation/            # Normalização de caminhos, resolução de symlinks, verificação de roots
├── search/                # Wrapper ripgrep (PCRE2, byte-limit, pool concorrente)
├── semantic/              # Análise Tree-sitter + configs/ (17 linguagens)
├── tools/                 # 8 módulos orquestradores, 50 implementações de ferramentas
├── undo/                  # Pilha undo, staleness guard, refators compostos
├── intelligence/          # Intenção → motor de recomendação de ferramentas
├── operations/            # Diff, bulk rename, padrões de projeto
├── schemas/               # Schemas de validação Zod
├── file-operations/       # Utilitários de leitura/escrita/watch
├── types/                 # Extensões do MCP SDK
├── errors/                # BaseError + formatadores
└── utils/                 # Logger, métricas, limitador de taxa, circuit breaker,
                            # concorrência, retry, fs-utils, api-version
```

### Decisões Principais

- **Config que não congela ao iniciar** — funções getter resolvem variáveis de env no momento da chamada. Altera uma variável, sem necessidade de reinício
- **Symlinks não enganam a sandbox** — `cachedRealpath` resolve cada caminho antes de verificar. Cache LRU (5s TTL) mantém a rapidez
- **A IA não sobrescreve silenciosamente as tuas alterações** — o staleness guard rejeita edições em ficheiros modificados fora da sessão. `MCP_STALENESS_GUARD=0` para desativar
- **As edições são atómicas ou não acontecem** — padrão ficheiro temp + rename. O teu ficheiro ou muda completamente ou fica intocado
- **Ficheiros grandes não incham a memória** — undo para ficheiros >1MB guarda patches diff, não cópias completas
- **O ripgrep não devora a tua RAM** — SIGTERM no limite de OOM. Máximo de 8 processos concorrentes, timeout de 30s
- **Nenhuma ferramenta sozinha monopoliza o servidor** — token bucket por ferramenta (60/min por padrão)
- **AST primeiro, regex como fallback** — análise de variáveis livres em 17 linguagens via tree-sitter. Regex apenas quando o AST não consegue analisar

---

## Desenvolvimento

```bash
pnpm test              # Executar testes (vitest)
pnpm test:run          # Modo CI
pnpm test:coverage     # Com cobertura
pnpm run build         # Compilar (swc → dist/)
pnpm run clean         # Limpar dist/
pnpm run clean && pnpm run build  # Compilação limpa
pnpm run watch         # Modo watch
pnpm run eslint        # Verificação de lint (0 erros, 0 avisos)
pnpm run eslint:fix    # Lint + correção automática
pnpm run typecheck     # Verificação rigorosa de TypeScript
```

## Projeto complementar

[**Backup Pro**](https://github.com/lordc-dev/backup-pro) — versione cada ficheiro antes que a IA o toque. Pesquise backups, compare mudanças, restaure com um clique. Integridade SHA-256, deduplicação, operações em lote. A pilha de desfazer protege a sessão atual; o Backup Pro protege entre sessões.

## Licença

MIT — Consulte o [repositório original de MCP Servers](https://github.com/modelcontextprotocol/servers) para mais detalhes.

## Créditos

- Original: [Anthropic MCP Servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- MCP SDK: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
