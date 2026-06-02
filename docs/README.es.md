# Filesystem Pro

[English](../README.md) | [Español](README.es.md) | [Català](README.ca.md) | [Galego](README.gl.md) | [Euskara](README.eu.md) | [Français](README.fr.md) | [Português](README.pt.md)

**Toda sesión de programación con IA empieza igual: le das acceso, rompe algo, y te quedas atascado.** Filestream Pro soluciona eso. La IA puede leer, buscar, editar y refactorizar tu código con herramientas reales de desarrollo — ripgrep encuentra código rápido, tree-sitter entiende la estructura (sin adivinar con regex), y cada edición es deshacible con un clic. 50 herramientas. Cero confianza por defecto. Funciona con Claude, Cursor y cualquier IA compatible con MCP.

> **Fork mejorado** del [Anthropic MCP Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) — 11 → 50 herramientas, búsqueda con ripgrep, comprensión de código con tree-sitter, deshacer completo y resiliencia de producción.

_Construido y mantenido por:_

[![LinkedIn](https://img.shields.io/badge/LinkedIn-albertocastrootero-0A66C2.svg?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/albertocastrootero)

---

## ¿Por qué Filesystem Pro?

- **¿La IA no encuentra tu código?** — búsqueda con ripgrep ~10x más rápida que Node.js glob. Encuentra lo que importa, ignora lo que no.
- **¿La IA edita lo que no debe?** — tree-sitter entiende la estructura de tu código en 17 lenguajes. Las ediciones aciertan el símbolo correcto, no una suposición de regex.
- **¿La IA rompe algo y te quedas atascado?** — pila de deshacer completa con rollback en un clic. El guardián de obsolescencia evita sobreescrituras silenciosas de archivos que cambiaste fuera de la sesión.
- **¿Te preocupa lo que la IA puede tocar?** — protocolo de roots activado por defecto. Symlinks resueltos, rutas validadas, limitado por tasa. Cero confianza desde el inicio.
- **50 herramientas, no 11** — todo lo que tiene el servidor original, más análisis semántico, refactoring basado en AST, comprensión de código y observabilidad.

---

## vs Original (`@modelcontextprotocol/server-filesystem`)

|                           | Original                          | Filesystem Pro                                                                                     |
| ------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Herramientas**          | 11                                | 50                                                                                                 |
| **Arquitectura**          | Monolítica (2 archivos)           | Modular (14 módulos)                                                                               |
| **Búsqueda**              | Node.js glob                      | ripgrep (PCRE2, ~10x más rápido)                                                                   |
| **Comprensión de código** | Ninguna                           | Tree-sitter (17 lenguajes), jerarquía de llamadas, detección de código muerto                      |
| **Refactoring**           | Ninguno                           | 6 herramientas de edición basadas en AST (renombrar, extraer, inlinear, etc.)                      |
| **Deshacer**              | Ninguno                           | Pila completa + guardián de obsolescencia + compresión basada en diff                              |
| **Observabilidad**        | Ninguna                           | Logging JSON estructurado, métricas en memoria (p50/p95), herramienta de estadísticas del servidor |
| **Vigilancia**            | Ninguna                           | Vigilante de directorios con chokidar                                                              |
| **Configuración**         | Solo argumentos CLI               | Variables de entorno + config JSON + CLI (resolución en tiempo de ejecución)                       |
| **Protocolo Roots**       | Args CLI + roots, error si no hay | Activado por defecto, fallback sin restricciones                                                   |
| **Seguridad**             | Verificación básica de rutas      | Rutas con symlinks resueltos, caché LRU, seguro contra EACCES/EPERM, limitación de tasa            |
| **Resiliencia**           | Ninguna                           | Circuit breaker, reintento de I/O con backoff, limitación de tasa por herramienta                  |

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

### 2. Instalar y compilar el servidor

```bash
cd /ruta/a/filesystem-pro
pnpm install
pnpm run build
```

## Configuración

Añade a la configuración de tu cliente MCP:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["/ruta/a/filesystem-pro/dist/index.js"],
      "env": {
        "MCP_ROOTS_RESTRICTION": "1"
      }
    }
  }
}
```

Alternativamente, pasa directorios permitidos como argumentos CLI (fallback cuando roots no está disponible):

```bash
node dist/index.js /ruta/a/dir1 /ruta/a/dir2
```

### Protocolo Roots — mantén la IA en el directorio de tu proyecto

El [MCP Roots Protocol](https://modelcontextprotocol.io/specification/2025-06-18/client/roots) indica al servidor qué directorios puede tocar la IA. Activado por defecto (`MCP_ROOTS_RESTRICTION=1`):

1. Al iniciar, el servidor solicita al cliente las roots del espacio de trabajo (ej. `file:///home/user/myapp`)
2. Cada operación de archivo se restringe a esas roots — la IA no puede escapar de tu proyecto
3. Si las roots cambian durante la sesión, el servidor se actualiza automáticamente
4. Si tu cliente no soporta roots, el servidor recurre a **modo sin restricciones**

> **OpenCode** (v1.15.x) no implementa el Protocolo Roots — el servidor muestra `[Roots] Client doesn't support roots protocol - running in unrestricted mode`. Ver [opencode/issues](https://github.com/anomalyco/opencode/issues).

### Variables de entorno

#### Seguridad

| Variable                      | Predeterminado | Descripción                                                                                           |
| ----------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `MCP_ROOTS_RESTRICTION`       | `1` (ON)       | Mantén la IA dentro de tu proyecto. Pon `0` o `false` para acceso total                               |
| `MCP_STALENESS_GUARD`         | `1` (ON)       | Evita que la IA sobreescriba archivos que cambiaste en otro sitio. `0` o `false` para desactivar      |
| `MCP_MAX_FILE_SIZE_BYTES`     | `52428800`     | Tamaño máximo de archivo que la IA puede leer (50MB). Evita que vacíe archivos enormes en el contexto |
| `MCP_MAX_SEARCH_OUTPUT_BYTES` | `2097152`      | Salida máxima de búsqueda (2MB). Evita que el contexto explote                                        |

#### Deshacer

| Variable                   | Predeterminado | Descripción                                                         |
| -------------------------- | -------------- | ------------------------------------------------------------------- |
| `MCP_UNDO_PERSIST_DIR`     |                | Guarda la pila de deshacer en disco para que sobreviva a reinicios  |
| `MCP_UNDO_STACK_SIZE`      | `100`          | Cuántas ediciones puedes deshacer                                   |
| `MCP_UNDO_MAX_ENTRY_BYTES` | `1000000`      | Tamaño máximo de entrada de deshacer antes de compresión diff (1MB) |

#### Rendimiento

| Variable                | Predeterminado | Descripción                                       |
| ----------------------- | -------------- | ------------------------------------------------- |
| `MCP_CACHE_DISABLED`    | `false`        | Desactiva toda la caché. Útil para depuración     |
| `MCP_SYMBOL_CACHE_SIZE` | `100`          | Cuántos conjuntos de símbolos mantener en memoria |
| `MCP_SYMBOL_CACHE_TTL`  | `60000`        | Tiempo de vida de la caché de símbolos (ms)       |
| `MCP_AST_CACHE_SIZE`    | `25`           | Cuántos ASTs mantener parseados                   |
| `MCP_AST_CACHE_TTL`     | `60000`        | Tiempo de vida de la caché AST (ms)               |
| `MCP_MAX_CONCURRENT_RG` | `8`            | Máximo de procesos ripgrep ejecutándose a la vez  |
| `MCP_RG_TIMEOUT_MS`     | `30000`        | Elimina ripgrep si tarda más de esto (ms)         |

#### Depuración

| Variable                  | Predeterminado | Descripción                                        |
| ------------------------- | -------------- | -------------------------------------------------- |
| `MCP_STRUCTURED_LOGS`     | `false`        | Logs JSON para cada llamada de herramienta y error |
| `LOG_ROOTS_EVENTS`        | `false`        | Loguea eventos del protocolo roots                 |
| `DEBUG_MCP` / `MCP_DEBUG` | `false`        | Modo debug con estado del selector de herramientas |

#### Avanzado

| Variable            | Predeterminado | Descripción                                                 |
| ------------------- | -------------- | ----------------------------------------------------------- |
| `MCP_CONFIG_FILE`   |                | Archivo de config JSON (se mergea con variables de entorno) |
| `MCP_TEMPLATES_DIR` |                | Directorio de plantillas personalizadas                     |

La configuración se resuelve en **tiempo de llamada** (no en tiempo de importación) mediante funciones getter. Los cambios en variables de entorno y archivo de config tienen efecto inmediato sin reinicio.

---

## Herramientas (50)

### Lectura y escritura

| Herramienta           | Descripción                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `read_text_file`      | Lee cualquier archivo. Usa `head`/`tail` para leer solo lo que necesitas         |
| `read_media_file`     | Lee imágenes y archivos de audio como base64                                     |
| `read_multiple_files` | Lee varios archivos a la vez — sin esperas                                       |
| `write_file`          | Crea o sobreescribe un archivo. Atómico — no deja archivos rotos                 |
| `edit_file`           | Haz ediciones de líneas específicas. `dryRun` primero para previsualizar el diff |
| `delete_file`         | Borra un archivo (deshacible)                                                    |
| `delete_path`         | Borra cualquier archivo o directorio — detecta el tipo automáticamente           |

### Directorios

| Herramienta                         | Descripción                                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| `create_directory`                  | Crea directorios — incluye padres, sin preocupaciones            |
| `list_directory`                    | Lista contenido con etiquetas `[FILE]`/`[DIR]`                   |
| `list_directory_with_sizes`         | Lista con tamaños — encuentra lo que come espacio en disco       |
| `directory_tree`                    | Árbol recursivo completo. Filtra con `exclude`, `maxDepth`       |
| `move_file`                         | Mueve o renombra — atómico, sin estados parciales                |
| `delete_directory`                  | Borra un directorio. `recursive=true` para no vacíos             |
| `get_file_info`                     | Metadatos del archivo: tamaño, fechas, permisos                  |
| `list_allowed_directories`          | comprueba qué directorios puede tocar la IA                      |
| `watch_directory` / `stop_watching` | Recibe notificaciones cuando los archivos cambian en tiempo real |

### Búsqueda (ripgrep)

| Herramienta            | Descripción                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| `search_files`         | Encuentra archivos por nombre — rápido                                       |
| `find_by_glob`         | Encuentra con patrones glob (`**/*.ts`, `src/**/*`)                          |
| `search_content`       | Busca dentro de archivos con regex (PCRE2)                                   |
| `count_matches`        | ¿Cuántas veces aparece este patrón?                                          |
| `diff_files`           | Compara dos archivos lado a lado                                             |
| `bulk_rename`          | Renombra muchos archivos a la vez con un patrón. `dryRun` para previsualizar |
| `get_project_patterns` | Lee patrones de código de AGENTS.md                                          |

Todas las herramientas de búsqueda soportan: filtro `fileType`, `excludePatterns`, `ignoreCase`, `maxResults`, `context`.

### Comprensión de código (Tree-sitter — 17 lenguajes)

TypeScript, TSX, JavaScript, JSX, Python, Kotlin, Go, Rust, Java, C, C++, Bash, C#, Ruby, PHP, HTML, CSS, Scala, Swift

| Herramienta              | Descripción                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `get_symbols_overview`   | Lista símbolos de nivel superior en un archivo                    |
| `find_symbol`            | Encuentra símbolo por patrón (`MyClass/myMethod`)                 |
| `find_symbol_references` | ¿Dónde se usa este símbolo en el codebase?                        |
| `find_unused_symbols`    | Encuentra código muerto que nadie llama                           |
| `find_deprecated_usages` | Encuentra llamadas a símbolos `@deprecated` que deberías corregir |
| `find_imports`           | ¿Qué importa este archivo?                                        |
| `find_dependents`        | ¿Quién depende de este archivo?                                   |
| `find_related_tests`     | ¿Dónde están los tests de este archivo?                           |
| `find_unused_imports`    | Limpia imports que no hacen nada                                  |
| `find_string_literals`   | Encuentra valores de string que coinciden con un patrón           |
| `get_callers`            | ¿Quién llama a esta función?                                      |
| `get_callees`            | ¿Qué llama esta función?                                          |
| `get_file_stats`         | Líneas, símbolos, conteo de imports/exports                       |
| `get_file_summary`       | Resumen legible del archivo                                       |

### Edición de código (basada en AST)

| Herramienta                                    | Descripción                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `replace_symbol_body`                          | Cambia la implementación, mantiene la firma — sin riesgo de grep               |
| `insert_before_symbol` / `insert_after_symbol` | Añade código justo donde está el símbolo, no por número de línea               |
| `rename_symbol`                                | Renombra en todos los sitios donde se usa. `dryRun` para previsualizar primero |
| `extract_method`                               | Extrae líneas a una nueva función — variables libres autodetectadas            |
| `inline_variable`                              | Reemplaza una variable con su valor dondequiera que se use                     |
| `introduce_parameter`                          | Convierte una expresión en un parámetro de función                             |

### Deshacer

| Herramienta   | Descripción                                                                               |
| ------------- | ----------------------------------------------------------------------------------------- |
| `undo`        | Deshace la última edición. O las últimas N ediciones. Un clic y desaparece                |
| `undo_peek`   | Previsualiza qué restauraría el deshacer — comprueba antes de confirmar                   |
| `undo_all`    | Resetea todo a como estaba antes de que empezara la sesión                                |
| `undo_status` | Comprueba la profundidad de la pila de deshacer y el estado del guardián de obsolescencia |

Guardián de obsolescencia (activado por defecto): Si editaste un archivo fuera de la sesión de IA, la edición de la IA se rechaza en vez de sobreescribir silenciosamente tu trabajo. Configura la persistencia vía `MCP_UNDO_PERSIST_DIR`.

### Observabilidad

| Herramienta        | Descripción                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `get_server_stats` | Comprueba la salud del servidor — uptime, rendimiento de herramientas (p50/p95), profundidad de deshacer, configuración de un vistazo |

---

## Arquitectura

```
src/
├── index.ts               # Entrada del servidor, protocolo roots, apagado
├── constants.ts           # SSOT: valores por defecto de config, mensajes de error, SupportedLanguage
├── config/                # Resolución de config en tiempo de ejecución (env > archivo > por defecto)
├── validation/            # Normalización de rutas, resolución de symlinks, comprobación de roots
├── search/                # Wrapper de ripgrep (PCRE2, límite de bytes, pool concurrente)
├── semantic/              # Análisis Tree-sitter + configs/ (17 lenguajes)
├── tools/                 # 8 módulos orquestadores, 50 implementaciones de herramientas
├── undo/                  # Pila de deshacer, guardián de obsolescencia, refactors compuestos
├── intelligence/          # Motor de intención → recomendación de herramienta
├── operations/            # Diff, renombrado masivo, patrones de proyecto
├── schemas/               # Esquemas de validación Zod
├── file-operations/       # Utilidades de lectura/escritura/vigilancia
├── types/                 # Augmentaciones del SDK MCP
├── errors/                # BaseError + formateadores
└── utils/                 # Logger, métricas, limitador de tasa, circuit breaker,
                            # concurrencia, reintento, fs-utils, api-version
```

### Decisiones clave

- **Configuración que no se congela al inicio** — las funciones getter resuelven variables de entorno en tiempo de llamada. Cambia una variable, no hace falta reiniciar
- **Los symlinks no engañarán al sandbox** — `cachedRealpath` resuelve cada ruta antes de comprobar. Caché LRU (TTL 5s) lo mantiene rápido
- **La IA no sobreescribirá silenciosamente tus cambios** — el guardián de obsolescencia rechaza ediciones en archivos modificados fuera de la sesión. `MCP_STALENESS_GUARD=0` para desactivar
- **Las ediciones son atómicas o no son** — patrón de archivo temporal + renombrado. Tu archivo cambia completamente o se queda intacto
- **Los archivos grandes no hinchan la memoria** — el deshacer para archivos >1MB almacena parches diff, no copias completas
- **Ripgrep no se comerá tu RAM** — SIGTERM en umbral de OOM. Máximo 8 procesos concurrentes, timeout de 30s
- **Ninguna herramienta puede acaparar el servidor** — cubo de tokens por herramienta (60/min por defecto)
- **AST primero, regex como fallback** — análisis de variables libres en 17 lenguajes vía tree-sitter. Regex solo cuando el AST no puede parsear

---

## Desarrollo

```bash
pnpm test              # Ejecutar tests (vitest)
pnpm test:run          # Modo CI
pnpm test:coverage     # Con cobertura
pnpm run build         # Compilar (swc → dist/)
pnpm run clean         # Limpiar dist/
pnpm run clean && pnpm run build  # Compilación limpia
pnpm run watch         # Modo watch
pnpm run eslint        # Comprobación de lint (0 errores, 0 warnings)
pnpm run eslint:fix    # Lint + auto-fix
pnpm run typecheck     # Comprobación estricta de TypeScript
```

## Proyecto complementario

[**Backup Pro**](https://github.com/lordc-dev/backup-pro) — versiona cada archivo antes de que la IA lo toque. Busca backups, compara cambios, restaura con un clic. Integridad SHA-256, deduplicación, operaciones por lotes. La pila de deshacer protege tu sesión actual; Backup Pro protege entre sesiones.

## Licencia

MIT — Consulta el [repositorio original de MCP Servers](https://github.com/modelcontextprotocol/servers) para más detalles.

## Créditos

- Original: [Anthropic MCP Servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- MCP SDK: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
