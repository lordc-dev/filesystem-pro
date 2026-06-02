import { ERROR_MESSAGES } from "../constants.js";
import { createUnifiedDiff } from "../operations/diff-operations.js";
import {
  findSymbol,
  getLanguageFromPath,
  type Symbol,
  SymbolKind,
} from "../semantic/index.js";
import { undoManager } from "./undo-manager.js";
import { stalenessGuard } from "./staleness-guard.js";
import { atomicWrite } from "../utils/fs-utils.js";
import type { SupportedLanguage } from "../semantic/index.js";
import type { RefactorResult } from "./extract-method.js";

function extractRange(
  lines: string[],
  startLine: number,
  endLine: number,
  startColumn: number,
  endColumn: number,
): string {
  if (startLine === endLine) {
    return lines[startLine].substring(startColumn, endColumn);
  }
  const parts = [lines[startLine].substring(startColumn)];
  for (let i = startLine + 1; i < endLine; i++) {
    parts.push(lines[i]);
  }
  parts.push(lines[endLine].substring(0, endColumn));
  return parts.join("\n");
}

function addParameterToSignature(
  signatureLine: string,
  paramName: string,
  defaultValue: string,
  language: SupportedLanguage,
  subsequentLines?: string[],
): string {
  let newParam: string;
  switch (language) {
    case "python":
      newParam = `${paramName}=${defaultValue}`;
      break;
    case "typescript":
    case "javascript":
    case "tsx":
    case "jsx":
      newParam = `${paramName} = ${defaultValue}`;
      break;
    case "go":
      newParam = `${paramName} unknown`;
      break;
    case "rust":
      newParam = `${paramName}: unknown`;
      break;
    case "java":
      newParam = `Object ${paramName}`;
      break;
    case "kotlin":
      newParam = `${paramName}: Any = ${defaultValue}`;
      break;
    default:
      newParam = `auto ${paramName}`;
      break;
  }

  if (language === "kotlin" && subsequentLines && subsequentLines.length > 0) {
    const allLines = [signatureLine, ...subsequentLines];
    for (let i = allLines.length - 1; i >= 0; i--) {
      const lastParen = allLines[i].lastIndexOf(")");
      if (lastParen !== -1) {
        const before = allLines[i].substring(0, lastParen);
        const after = allLines[i].substring(lastParen);
        const charBefore = before.trimEnd().at(-1);
        if (charBefore === "(" || before.trimEnd().endsWith("(")) {
          allLines[i] = `${before}${newParam}${after}`;
        } else {
          allLines[i] = `${before}, ${newParam}${after}`;
        }
        return allLines.join("\n");
      }
    }
  }

  const lastParen = signatureLine.lastIndexOf(")");
  if (lastParen === -1) return signatureLine;

  const before = signatureLine.substring(0, lastParen);
  const after = signatureLine.substring(lastParen);

  const charBefore = before[before.length - 1];
  if (charBefore === "(") {
    return `${before}${newParam}${after}`;
  } else {
    return `${before}, ${newParam}${after}`;
  }
}

export async function introduceParameter(
  filePath: string,
  content: string,
  options: {
    parameterName: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    functionSymbol?: string;
    dryRun?: boolean;
  },
): Promise<RefactorResult> {
  const {
    parameterName,
    startLine: sl1,
    endLine: el1,
    startColumn,
    endColumn,
    functionSymbol,
    dryRun = false,
  } = options;

  const language = getLanguageFromPath(filePath);
  if (!language) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [ERROR_MESSAGES.unsupportedFileType(filePath)],
      description: "Introduce parameter failed — unsupported file type",
    };
  }

  const staleError = await stalenessGuard.checkAndGetError(filePath);
  if (staleError) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [staleError],
      description: "Introduce parameter rejected — file changed externally",
    };
  }

  let fnSymbol: Symbol | null = null;
  if (functionSymbol) {
    const lookupResult = await findSymbol({ content, language }, functionSymbol);
    fnSymbol = lookupResult?.symbol ?? null;
  }

  if (!fnSymbol) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [`Function not found: ${functionSymbol ?? "(unknown)"}`],
      description: "Introduce parameter failed — function not found",
    };
  }

  const lines = content.split("\n");
  const sl0 = sl1 - 1;
  const el0 = el1 - 1;
  const expression = extractRange(lines, sl0, el0, startColumn, endColumn);

  const signatureLine = lines[fnSymbol.location.startLine];
  let signatureEndLine = fnSymbol.location.startLine;
  if (language === "kotlin") {
    const lineBeforeSymbol = signatureLine.substring(0, fnSymbol.location.startColumn);
    const funKeyword = lineBeforeSymbol.lastIndexOf("fun ");
    const classKeyword = lineBeforeSymbol.lastIndexOf("class ");
    const keywordPos = funKeyword !== -1 ? funKeyword : classKeyword;
    if (keywordPos !== -1 || fnSymbol.kind === SymbolKind.Class || fnSymbol.kind === SymbolKind.Constructor) {
      let parenDepth = 0;
      let foundOpen = false;
      for (let i = fnSymbol.location.startLine; i < lines.length; i++) {
        for (let c = 0; c < lines[i].length; c++) {
          const ch = lines[i][c];
          if (ch === '(') { parenDepth++; foundOpen = true; }
          if (ch === ')') { parenDepth--; }
          if (foundOpen && parenDepth === 0) {
            signatureEndLine = i;
            i = lines.length;
            break;
          }
        }
      }
    }
  }
  const subsequentLines = language === "kotlin" && signatureEndLine > fnSymbol.location.startLine
    ? lines.slice(fnSymbol.location.startLine + 1, signatureEndLine + 1)
    : undefined;

  const newSignatureLine = addParameterToSignature(
    signatureLine,
    parameterName,
    expression,
    language,
    subsequentLines,
  );

  const allLines = [...lines];

  const exprLine = lines[sl0];
  const isWholeValDecl = /^\s*(val|var)\s+/.test(exprLine) &&
    sl0 === el0 &&
    (() => {
      const eqIdx = exprLine.indexOf("=");
      if (eqIdx === -1) return false;
      const afterEq = exprLine.substring(eqIdx + 1);
      const rhsTrimStart = afterEq.length - afterEq.trimStart().length;
      const rhsStart = eqIdx + 1 + rhsTrimStart;
      const rhsEnd = eqIdx + 1 + afterEq.trimEnd().length;
      return startColumn === rhsStart && endColumn === rhsEnd;
    })();

  const sigStartLine = fnSymbol.location.startLine;

  if (isWholeValDecl) {
    allLines.splice(sl0, 1);
    const adjustedSigLine = sigStartLine > sl0 ? sigStartLine - 1 : sigStartLine;
    if (subsequentLines && subsequentLines.length > 0) {
      const newSigLines = newSignatureLine.split("\n");
      allLines.splice(adjustedSigLine, 1 + subsequentLines.length, ...newSigLines);
    } else {
      allLines[adjustedSigLine] = newSignatureLine;
    }
  } else {
    const beforeExpr = lines[sl0].substring(0, startColumn);
    const afterExpr = lines[el0].substring(endColumn);
    const replacementLine = `${beforeExpr}${parameterName}${afterExpr}`;

    if (sl0 === el0) {
      allLines[sl0] = replacementLine;
    } else {
      allLines.splice(sl0, el0 - sl0 + 1, replacementLine);
    }
    if (subsequentLines && subsequentLines.length > 0) {
      const newSigLines = newSignatureLine.split("\n");
      const adjustedSigLine = sigStartLine > sl0 && el0 >= sigStartLine
        ? sigStartLine - (el0 - sl0)
        : sigStartLine;
      allLines.splice(adjustedSigLine, 1 + subsequentLines.length, ...newSigLines);
    } else {
      allLines[fnSymbol.location.startLine] = newSignatureLine;
    }
  }

  const newContent = allLines.join("\n");
  const diff = createUnifiedDiff(content, newContent, filePath, {});

  if (!dryRun) {
    await undoManager.record(filePath, `introduce_parameter: ${parameterName}`);
    await atomicWrite(filePath, newContent);
  }

  return {
    success: true,
    diff,
    modifiedFiles: dryRun ? [] : [filePath],
    errors: [],
    description: `Introduced parameter '${parameterName}' with default '${expression.substring(0, 40)}${expression.length > 40 ? "..." : ""}'`,
  };
}