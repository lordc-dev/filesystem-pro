import { ERROR_MESSAGES } from "../constants.js";
import { createUnifiedDiff } from "../operations/diff-operations.js";
import { escapeRegex as escapeRegExp } from "../utils/text-utils.js";
import {
  findSymbol,
  getLanguageFromPath,
  type Symbol,
  SymbolKind,
} from "../semantic/index.js";
import { undoManager } from "./undo-manager.js";
import { stalenessGuard } from "./staleness-guard.js";
import { atomicWrite } from "../utils/fs-utils.js";
import { observeHistogram, incrementCounter } from "../utils/metrics.js";
import type { RefactorResult } from "./extract-method.js";

function extractInitializer(declLine: string, equalIdx: number): string | null {
  const afterEqual = declLine.substring(equalIdx + 1).trim();
  if (!afterEqual) return null;

  const cleaned = afterEqual.endsWith(";")
    ? afterEqual.slice(0, -1).trim()
    : afterEqual;

  if (cleaned.length > 0 && cleaned.length < 200) {
    return cleaned;
  }

  return null;
}

export async function inlineVariable(
  filePath: string,
  content: string,
  options: {
    variableName: string;
    parentSymbol?: string;
    dryRun?: boolean;
  },
): Promise<RefactorResult> {
  const startTime = performance.now();
  const { variableName, parentSymbol, dryRun = false } = options;
  const language = getLanguageFromPath(filePath);

  if (!language) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [ERROR_MESSAGES.unsupportedFileType(filePath)],
      description: "Inline variable failed — unsupported file type",
    };
  }

  const staleError = await stalenessGuard.checkAndGetError(filePath);
  if (staleError) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [staleError],
      description: "Inline variable rejected — file changed externally",
    };
  }

  const namePath = parentSymbol
    ? `${parentSymbol}/${variableName}`
    : variableName;

  const initialResult = await findSymbol({ content, language }, namePath);
  const lookupResult = initialResult ?? await findSymbol({ content, language }, variableName);

  let symbol = lookupResult?.symbol;

  if (!symbol) {
  const initialLines = content.split("\n");
    const declPattern = new RegExp(`\\b(val|var)\\s+${escapeRegExp(variableName)}\\b`);
    for (let i = 0; i < initialLines.length; i++) {
      if (declPattern.test(initialLines[i])) {
        symbol = {
          name: variableName,
          kind: SymbolKind.Variable,
          location: { startLine: i, endLine: i, startColumn: 0, endColumn: initialLines[i].length, startOffset: 0, endOffset: initialLines[i].length },
          children: [],
          namePath: variableName,
        } satisfies Symbol;
        break;
      }
    }
  }

  if (!symbol) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [`Variable not found: ${namePath}`],
      description: "Inline variable failed — variable not found",
    };
  }

  const allLines = content.split("\n");
  const declLine = allLines[symbol.location.startLine];
  const equalIdx = declLine?.indexOf("=") ?? -1;
  if (equalIdx === -1) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [`Cannot inline variable without initializer: ${variableName}`],
      description: "Inline variable failed — no initializer",
    };
  }

  const initializer = extractInitializer(declLine, equalIdx);
  if (!initializer) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [`Could not extract initializer for: ${variableName}`],
      description: "Inline variable failed — could not extract initializer",
    };
  }

  const { findReferences } = await import("../semantic/reference-finder.js");
  const refResult = await findReferences(variableName, process.cwd(), filePath, symbol.location, {
    includeDefinition: true,
  });

  const refs = refResult.references.filter(
    (r) => r.filePath === filePath && r.location.startLine !== symbol.location.startLine,
  );

  let replacementsCount = 0;

  if (refs.length === 0) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [`No references found for variable '${variableName}' via AST search. Regex fallback is disabled to avoid false matches. Possible causes: (1) variable is in a private/local scope not indexed, (2) references use dynamic access patterns, (3) the file containing references was not searched. Try specifying a narrower searchPath or parentSymbol.`],
      description: "Inline variable failed — no references found via AST",
    };
  }

  refs.sort((a, b) => b.location.startOffset - a.location.startOffset);
  for (const ref of refs) {
    const refLine = ref.location.startLine;
    const refCol = ref.location.startColumn;
    const line = allLines[refLine];
    if (line) {
      const before = line.substring(0, refCol);
      const after = line.substring(refCol + variableName.length);
      allLines[refLine] = `${before}${initializer}${after}`;
      replacementsCount++;
    }
  }

  allLines.splice(symbol.location.startLine, 1);

  observeHistogram("refactor_duration_ms", performance.now() - startTime, { operation: "inline_variable" });
  incrementCounter("refactor_replacements", { operation: "inline_variable" }, replacementsCount);
  const modifiedContent = allLines.join("\n");

  const diff = createUnifiedDiff(content, modifiedContent, filePath, {});

  if (!dryRun) {
    await undoManager.record(filePath, `inline_variable: ${variableName}`);
    await atomicWrite(filePath, modifiedContent);
  }

  return {
    success: true,
    diff,
    modifiedFiles: dryRun ? [] : [filePath],
    errors: [],
    description: `Inlined variable '${variableName}' (${replacementsCount} reference${replacementsCount !== 1 ? 's' : ''} replaced)`,
  };
}