/**
 * Import Analyzer Module
 * 
 * Parses and analyzes import statements from source files using Tree-sitter AST.
 * Supports TypeScript, JavaScript, and Python import statements.
 * 
 * @example
 * ```typescript
 * import { extractImports } from './import-analyzer';
 * 
 * const imports = await extractImports(content, 'typescript');
 * // Returns: [{ source: './utils', specifiers: ['foo', 'bar'], ... }]
 * ```
 */

import type { Parser, Language, Tree, Node as SyntaxNode } from "web-tree-sitter";
import path from "path";
import { treeSitterManager } from "./tree-sitter-manager.js";
import type { SupportedLanguage } from "./types.js";
import { searchContent, globSearch } from "../search/index.js";
import { escapeRegex } from "../utils/text-utils.js";
import { extractTSJSImports } from "./ts-import-analyzer.js";
import { extractPythonImports } from "./python-import-analyzer.js";
import { extractKotlinImports } from "./kotlin-import-analyzer.js";
import { readValidatedFile } from "../file-operations/read-utils.js";
import { DEFAULT_EXCLUDE_DIRS } from "../constants.js";

// Re-export types from import-types for backward compatibility
export type {
  ImportInfo,
  ImportSpecifier,
  ImportExtractionResult,
  DependentFile,
  RelatedTestFile,
  UnusedImport,
} from "./import-types.js";

import type {
  ImportInfo,
  ImportExtractionResult,
  DependentFile,
  RelatedTestFile,
  UnusedImport,
} from "./import-types.js";

/**
 * Extract all imports from source code
 * 
 * @param content - Source code content
 * @param language - Programming language
 * @returns ImportExtractionResult with all imports and summary
 */
export async function extractImports(
  content: string,
  language: SupportedLanguage
): Promise<ImportExtractionResult> {
  const tree = await treeSitterManager.parse(content, language);

  let imports: ImportInfo[];

  switch (language) {
    case "typescript":
    case "javascript":
    case "tsx":
    case "jsx":
      imports = extractTSJSImports(tree, content);
      break;

    case "python":
      imports = extractPythonImports(tree, content);
      break;

    case "kotlin":
      imports = extractKotlinImports(tree, content);
      break;

    default:
      // For other languages, return empty (can be extended)
      imports = [];
  }

  // Calculate summary
  const summary = {
    default: imports.filter(i => i.isDefault).length,
    named: imports.filter(i => !i.isDefault && !i.isNamespace && !i.isSideEffect).length,
    namespace: imports.filter(i => i.isNamespace).length,
    sideEffect: imports.filter(i => i.isSideEffect).length,
    typeOnly: imports.filter(i => i.isTypeOnly).length,
  };

  return {
    imports,
    count: imports.length,
    summary,
  };
}

/**
 * Get all import sources (module specifiers) from a file
 * 
 * @param content - Source code content
 * @param language - Programming language
 * @returns Array of unique module specifiers
 */
export async function getImportSources(
  content: string,
  language: SupportedLanguage
): Promise<string[]> {
  const result = await extractImports(content, language);
  const sources = new Set(result.imports.map(i => i.source));
  return Array.from(sources);
}

/**
 * Check if a file imports a specific module
 * 
 * @param content - Source code content
 * @param language - Programming language
 * @param moduleName - Module name to check (supports partial matching)
 * @returns True if the module is imported
 */
export async function hasImport(
  content: string,
  language: SupportedLanguage,
  moduleName: string
): Promise<boolean> {
  const result = await extractImports(content, language);
  return result.imports.some(i =>
    i.source === moduleName ||
    i.source.startsWith(moduleName + "/") ||
    i.source.endsWith("/" + moduleName)
  );
}

/**
 * Find all imports from a specific source module
 * 
 * @param content - Source code content
 * @param language - Programming language
 * @param source - Source module to find
 * @returns Import info for matching imports
 */
export async function findImportsFrom(
  content: string,
  language: SupportedLanguage,
  source: string
): Promise<ImportInfo[]> {
  const result = await extractImports(content, language);
  return result.imports.filter(i => i.source === source);
}

/**
 * Find all files that import a given file (reverse dependency lookup)
 * 
 * Uses ripgrep for fast searching across the codebase.
 * 
 * @param targetFilePath - Path to the file to find dependents for
 * @param searchPath - Directory to search in
 * @param options - Search options
 * @returns Array of files that import the target file
 */
export async function findDependents(
  targetFilePath: string,
  searchPath: string,
  options: {
    fileTypes?: string[];
    excludePatterns?: readonly string[];
  } = {}
): Promise<DependentFile[]> {
  const ext = path.extname(targetFilePath);
  const basenameNoExt = path.basename(targetFilePath, ext);
  const excludeList = [
    ...(options.excludePatterns ?? []),
    ...DEFAULT_EXCLUDE_DIRS,
  ];

  // For Kotlin, try to infer the fully qualified class name from the file
  // and search for it in import statements.
  // Kotlin imports look like: import com.bigotitech.alea.content.AudioStateTransitionService
  if (ext === ".kt") {
    try {
      const { content } = await readValidatedFile(targetFilePath);
      const packageName = extractKotlinPackage(content);
      const className = basenameNoExt;

      if (packageName) {
        const fqn = `${packageName}.${className}`;
        const escapedFqn = escapeRegex(fqn);
        const pattern = `import\\s+${escapedFqn}\\b`;

        const results = await searchContent(searchPath, pattern, {
          fileType: "kt",
          excludePatterns: excludeList,
          ignoreCase: false,
        });

        const dependents: DependentFile[] = [];
        const seenFiles = new Set<string>();

        for (const result of results) {
          if (path.resolve(result.file) === path.resolve(targetFilePath)) continue;
          if (seenFiles.has(result.file)) continue;
          seenFiles.add(result.file);

          dependents.push({
            filePath: result.file,
            line: result.line,
            importStatement: result.content.trim(),
          });
        }

        return dependents;
      }
    } catch {
      // Fall through to basename matching if file read fails
    }

    // Fallback: search by class name in Kotlin import statements
    const escapedName = escapeRegex(basenameNoExt);
    const pattern = `import\\s+[^;]*\\b${escapedName}\\b`;

    const results = await searchContent(searchPath, pattern, {
      fileType: "kt",
      excludePatterns: excludeList,
      ignoreCase: false,
    });

    const dependents: DependentFile[] = [];
    const seenFiles = new Set<string>();

    for (const result of results) {
      if (path.resolve(result.file) === path.resolve(targetFilePath)) continue;
      if (seenFiles.has(result.file)) continue;
      seenFiles.add(result.file);

      dependents.push({
        filePath: result.file,
        line: result.line,
        importStatement: result.content.trim(),
      });
    }

    return dependents;
  }

  // Default: basename matching for TS/JS/Python/etc.
  const escapedName = escapeRegex(basenameNoExt);
  const pattern = `(from|import|require)\\s*\\(?['"][^'"]*${escapedName}['"]|import\\s+[^;]*${escapedName}`;

  const results = await searchContent(searchPath, pattern, {
    fileType: options.fileTypes?.join(","),
    excludePatterns: excludeList,
    ignoreCase: false,
  });

  const dependents: DependentFile[] = [];
  const seenFiles = new Set<string>();

  for (const result of results) {
    if (path.resolve(result.file) === path.resolve(targetFilePath)) continue;
    if (seenFiles.has(result.file)) continue;
    seenFiles.add(result.file);

    dependents.push({
      filePath: result.file,
      line: result.line,
      importStatement: result.content.trim(),
    });
  }

  return dependents;
}
/**
 * Extract the package name from Kotlin source code.
 * Looks for `package com.example.thing` at the top of the file.
 */
function extractKotlinPackage(content: string): string | null {
  const match = /^package\s+([a-zA-Z_][\w.]*)\s*$/m.exec(content);
  return match ? match[1] : null;
}

/**
 * Count files that depend on a target file
 * 
 * @param targetFilePath - Path to analyze
 * @param searchPath - Directory to search for dependents
 * @returns Count of files that depend on the target
 */
export async function countDependents(
  targetFilePath: string,
  searchPath: string
): Promise<number> {
  const dependents = await findDependents(targetFilePath, searchPath);
  return dependents.length;
}

/**
 * Find test files related to a source file using naming conventions
 * 
 * Supports common test file patterns:
 * - TypeScript/JavaScript: *.test.ts, *.spec.ts, __tests__/*.ts
 * - Python: *_test.py, test_*.py
 * 
 * @param sourceFilePath - Path to the source file
 * @param searchPath - Directory to search for test files
 * @returns Array of related test files
 */
export async function findRelatedTests(
  sourceFilePath: string,
  searchPath: string
): Promise<RelatedTestFile[]> {
  const ext = path.extname(sourceFilePath);
  const basename = path.basename(sourceFilePath, ext);

  // Build glob patterns based on file extension
  const patterns: Array<{ pattern: string; type: string }> = [];

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    // JavaScript/TypeScript test patterns
    patterns.push(
      { pattern: `**/${basename}.test${ext}`, type: 'test' },
      { pattern: `**/${basename}.spec${ext}`, type: 'spec' },
      { pattern: `**/${basename}.test.ts`, type: 'test' },
      { pattern: `**/${basename}.spec.ts`, type: 'spec' },
      { pattern: `**/__tests__/${basename}${ext}`, type: '__tests__' },
      { pattern: `**/__tests__/${basename}.test${ext}`, type: '__tests__' },
      { pattern: `**/__tests__/${basename}.spec${ext}`, type: '__tests__' },
    );
  } else if (ext === '.kt') {
    patterns.push(
      { pattern: `**/${basename}Test.kt`, type: 'test' },
      { pattern: `**/${basename}Spec.kt`, type: 'spec' },
      { pattern: `**/test/${basename}Test.kt`, type: 'test' },
      { pattern: `**/src/test/**/${basename}Test.kt`, type: 'test' },
      { pattern: `**/src/test/**/${basename}Test.class.kt`, type: 'test' },
      { pattern: `**/src/test/**/${basename}.kt`, type: 'test-same-name' },
    );
  } else if (ext === '.py') {
    // Python test patterns
    patterns.push(
      { pattern: `**/${basename}_test.py`, type: 'pytest' },
      { pattern: `**/test_${basename}.py`, type: 'pytest' },
      { pattern: `**/tests/${basename}_test.py`, type: 'pytest' },
      { pattern: `**/tests/test_${basename}.py`, type: 'pytest' },
    );
  }

  if (patterns.length === 0) {
    return [];
  }

  const globResults = await Promise.all(
    patterns.map(async ({ pattern, type }) => {
      try {
        const matches = await globSearch(pattern, {
          cwd: searchPath,
          ignore: DEFAULT_EXCLUDE_DIRS,
          onlyFiles: true,
          absolute: true,
        });
        return matches.map(m => ({ filePath: m, patternType: type }));
      } catch {
        return [];
      }
    })
  );

  const results: RelatedTestFile[] = [];
  const seenFiles = new Set<string>();
  for (const file of globResults.flat()) {
    if (!seenFiles.has(file.filePath)) {
      seenFiles.add(file.filePath);
      results.push(file);
    }
  }
  return results;
}

/**
 * Find imports that are declared but never used in the file
 * 
 * Uses Tree-sitter AST to find identifier usages, excluding the import lines.
 * 
 * @param content - Source code content
 * @param language - Programming language
 * @returns Array of unused imports with details
 */
export async function findUnusedImports(
  content: string,
  language: SupportedLanguage
): Promise<UnusedImport[]> {
  // First, extract all imports
  const importResult = await extractImports(content, language);

  if (importResult.imports.length === 0) {
    return [];
  }

  // Parse the file to find all identifier usages
  const tree = await treeSitterManager.parse(content, language);
  if (!tree) {
    return [];
  }

  // Collect all identifier names used in the file (excluding import statements)
  const usedIdentifiers = new Set<string>();

  function collectIdentifiers(node: SyntaxNode): void {
    // Skip import statements
    const nodeType = node.type;
    if (
      nodeType === 'import_statement' ||
      nodeType === 'import_declaration' ||
      nodeType === 'import_from_statement' ||
      nodeType === 'import' ||
      nodeType === 'import_header' ||
      nodeType === 'import_list'
    ) {
      return;
    }

    // Collect identifier names
    if (
      nodeType === 'identifier' ||
      nodeType === 'property_identifier' ||
      nodeType === 'type_identifier' ||
      nodeType === 'shorthand_property_identifier' ||
      nodeType === 'simple_identifier'
    ) {
      usedIdentifiers.add(node.text);
    }

    // Recurse into children
    for (const child of node.children) {
      if (child) collectIdentifiers(child);
    }
  }

  collectIdentifiers(tree.rootNode);

  // Check each import for unused specifiers
  const unusedImports: UnusedImport[] = [];

  for (const imp of importResult.imports) {
    // Skip side-effect imports (they're used for their side effects)
    if (imp.isSideEffect) {
      continue;
    }

    const unusedSpecifiers: string[] = [];

    // Check default import
    if (imp.isDefault) {
      const defaultSpec = imp.specifiers.find(s => s.name === 'default');
      const localName = defaultSpec?.alias ?? imp.specifiers[0]?.name;
      if (localName && !usedIdentifiers.has(localName)) {
        unusedSpecifiers.push(localName);
      }
    }

    // Check namespace import
    if (imp.isNamespace) {
      const nsSpec = imp.specifiers.find(s => s.name === '*');
      const localName = nsSpec?.alias;
      if (localName && !usedIdentifiers.has(localName)) {
        unusedSpecifiers.push(localName);
      }
    }

    // Check named specifiers
    for (const spec of imp.specifiers) {
      if (spec.name === 'default' || spec.name === '*') {
        continue; // Already handled above
      }

      // Use alias if present, otherwise use original name
      const localName = spec.alias ?? spec.name;
      if (!usedIdentifiers.has(localName)) {
        unusedSpecifiers.push(localName);
      }
    }

    if (unusedSpecifiers.length > 0) {
      const totalSpecifiers = imp.specifiers.length;
      const isFullyUnused = unusedSpecifiers.length >= totalSpecifiers;

      unusedImports.push({
        import: imp,
        unusedSpecifiers,
        isFullyUnused,
      });
    }
  }

  return unusedImports;
}
