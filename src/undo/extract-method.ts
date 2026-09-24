import { ERROR_MESSAGES } from "../constants.js";
import { createUnifiedDiff } from "../operations/diff-operations.js";
import {
  findSymbol,
  getLanguageFromPath,
  type SupportedLanguage,
} from "../semantic/index.js";
import { undoManager } from "./undo-manager.js";
import { stalenessGuard } from "./staleness-guard.js";
import { atomicWrite } from "../utils/fs-utils.js";
import { findFreeVariables, inferFreeVariableTypes } from "./extract-method-analysis.js";

export interface RefactorResult {
  success: boolean;
  diff: string;
  modifiedFiles: string[];
  errors: string[];
  description: string;
}

interface ExtractionAnalysis {
  extractedCode: string;
  freeVariables: string[];
  signature: string;
  callSite: string;
  startLine: number;
  endLine: number;
  returnedVariables: string[];
}

export function checkMultilineStringBoundary(
  lines: string[],
  startLine: number,
  endLine: number,
  language: SupportedLanguage,
): string | null {
  const delimiters: Array<{ open: RegExp; close: RegExp }> = [];
  switch (language) {
    case "kotlin":
      delimiters.push({ open: /"""/g, close: /"""/g });
      break;
    case "python":
      delimiters.push(
        { open: /"""/g, close: /"""/g },
        { open: /'''/g, close: /'''/g },
      );
      break;
    case "typescript":
    case "javascript":
    case "tsx":
    case "jsx":
      delimiters.push({ open: /`/g, close: /`/g });
      break;
    case "lua":
      delimiters.push({ open: /\[\[/g, close: /\]\]/g });
      break;
    default:
      return null;
  }

  const fullText = lines.join("\n");
  for (const delim of delimiters) {
    let searchOffset = 0;
    while (searchOffset < fullText.length) {
      delim.open.lastIndex = searchOffset;
      const openMatch = delim.open.exec(fullText);
      if (!openMatch) break;

      const openEnd = openMatch.index + openMatch[0].length;

      delim.close.lastIndex = openEnd;
      const closeMatch = delim.close.exec(fullText);
      if (!closeMatch) break;

      const stringStartOffset = openMatch.index;
      const stringEndOffset = closeMatch.index + closeMatch[0].length;

      let stringStartLine = 0;
      let stringEndLine = 0;
      let pos = 0;
      for (let i = 0; i < lines.length; i++) {
        if (pos + lines[i].length >= stringStartOffset && stringStartLine === 0) {
          stringStartLine = i;
        }
        if (pos + lines[i].length >= stringEndOffset) {
          stringEndLine = i;
          break;
        }
        pos += lines[i].length + 1;
      }

      if (stringEndLine > stringStartLine) {
        const selectionStart = startLine;
        const selectionEnd = endLine - 1;

        const noOverlap = selectionEnd < stringStartLine || selectionStart > stringEndLine;
        const fullContainment = stringStartLine >= selectionStart && stringEndLine <= selectionEnd;

        if (!noOverlap && !fullContainment) {
          return `Selection (lines ${startLine + 1}-${endLine}) partially overlaps a multi-line string literal (lines ${stringStartLine + 1}-${stringEndLine + 1}). Expand the selection to include the entire string, or select within the string only.`;
        }
      }

      searchOffset = stringEndOffset;
    }
  }

  return null;
}

function stripExtractedIndentation(lines: string[]): { strippedLines: string[]; baseIndent: string } {
  const firstLine = lines[0] || "";
  const indentMatch = firstLine.match(/^(\s*)/);
  const baseIndent = indentMatch ? indentMatch[1] : "";
  const indentLen = baseIndent.length;
  const strippedLines = lines.map((l) =>
    l.length >= indentLen && l.substring(0, indentLen) === baseIndent
      ? l.substring(indentLen)
      : l.trimStart(),
  );
  return { strippedLines, baseIndent };
}

interface InsertionInfo {
  point: number;
  insideClass: boolean;
  classIndent: string;
}

async function findInsertionPoint(
  lines: string[],
  parentSymbol: string | undefined,
  language: SupportedLanguage,
  content: string,
): Promise<InsertionInfo> {
  if (!parentSymbol) return { point: lines.length, insideClass: false, classIndent: "" };

  const lookupResult = await findSymbol({ content, language }, parentSymbol);
  if (!lookupResult) return { point: lines.length, insideClass: false, classIndent: "" };

  const sym = lookupResult.symbol;
  if (language === "kotlin") {
    const classEndLine = sym.location.endLine;
    let closingBraceLine = classEndLine;
    for (let i = classEndLine; i >= sym.location.startLine; i--) {
      if (lines[i].trimEnd() === "}") { closingBraceLine = i; break; }
    }
    let classIndent = "";
    for (let i = sym.location.startLine + 1; i < closingBraceLine; i++) {
      const ln = lines[i];
      if (ln.trim().length > 0 && ln.trim() !== "}") {
        classIndent = ln.match(/^(\s*)/)?.[1] ?? "    ";
        break;
      }
    }
    return { point: closingBraceLine, insideClass: true, classIndent };
  }

  return { point: sym.location.endLine + 1, insideClass: false, classIndent: "" };
}

function assembleExtractedContent(
  lines: string[],
  startLine: number,
  endLine: number,
  callSite: string,
  functionDef: string,
  insertionPoint: number,
): string {
  const newLines = [...lines];
  newLines.splice(startLine, endLine - startLine, callSite);
  const removed = endLine - startLine;
  const added = callSite.split("\n").length;
  const adjustedInsertion = insertionPoint > startLine
    ? insertionPoint - removed + added
    : insertionPoint;
  newLines.splice(adjustedInsertion, 0, ...functionDef.split("\n"));
  // collapse double blank line between call site block and inserted function
  const out: string[] = [];
  for (const l of newLines) {
    if (l === "" && out.length > 0 && out[out.length - 1] === "") continue;
    out.push(l);
  }
  return out.join("\n");
}

export async function extractMethod(
  filePath: string,
  content: string,
  options: {
    newMethodName: string;
    startLine: number;
    endLine: number;
    parentSymbol?: string;
    dryRun?: boolean;
  },
): Promise<RefactorResult> {
  const {
    newMethodName,
    startLine: startLine1,
    endLine: endLine1,
    parentSymbol,
    dryRun = false,
  } = options;

  const startLine = startLine1 - 1;
  const endLine = endLine1;

  const language = getLanguageFromPath(filePath);
  if (!language) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [ERROR_MESSAGES.unsupportedFileType(filePath)],
      description: "Extract method failed — unsupported file type",
    };
  }

  const staleError = await stalenessGuard.checkAndGetError(filePath);
  if (staleError) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [staleError],
      description: "Extract method rejected — file changed externally",
    };
  }

  const lines = content.split("\n");
  if (startLine < 0 || endLine > lines.length || startLine >= endLine) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [`Invalid line range: ${startLine1}-${endLine1}`],
      description: "Extract method failed — invalid line range",
    };
  }

  const stringBoundaryError = checkMultilineStringBoundary(lines, startLine, endLine, language);
  if (stringBoundaryError) {
    return {
      success: false,
      diff: "",
      modifiedFiles: [],
      errors: [stringBoundaryError],
      description: "Extract method failed — selection cuts through string literal",
    };
  }

  const extractedLines = lines.slice(startLine, endLine);
  const { strippedLines, baseIndent } = stripExtractedIndentation(extractedLines);

  const freeVariableTypes = await inferFreeVariableTypes(content, language, strippedLines, parentSymbol);

  const analysis = await analyzeExtraction(
    strippedLines, startLine, newMethodName, language, freeVariableTypes,
  );

  const returnedVariables = findReturnedVariables(strippedLines, lines, endLine, language);

  const insertion = await findInsertionPoint(lines, parentSymbol, language, content);

  const functionDef = buildFunctionDefinition(
    newMethodName, analysis.freeVariables, analysis.extractedCode, language,
    insertion.insideClass ? insertion.classIndent : undefined, freeVariableTypes,
    returnedVariables,
  );

  const callSite = baseIndent + buildCallSite(newMethodName, analysis.freeVariables, returnedVariables);
  const newContent = assembleExtractedContent(lines, startLine, endLine, callSite, functionDef, insertion.point);
  const diff = createUnifiedDiff(content, newContent, filePath, {});

  if (!dryRun) {
    await undoManager.record(filePath, `extract_method: ${newMethodName}`);
    await atomicWrite(filePath, newContent);
  }

  return {
    success: true, diff,
    modifiedFiles: dryRun ? [] : [filePath],
    errors: [],
    description: `Extracted lines ${startLine1}-${endLine1} into ${newMethodName}()` + (returnedVariables.length > 0 ? ` — returns ${returnedVariables.join(", ")}` : ""),
  };
}

/**
 * Variables declared inside the extracted block but used after it must be
 * returned from the new function and reassigned at the call site.
 * ponytail: regex-based — good enough for const/let/var/val declarations.
 */
function findReturnedVariables(
  strippedLines: string[],
  allLines: string[],
  endLine: number,
  _language: SupportedLanguage,
): string[] {
  const declared: string[] = [];
  const declPattern = /(?:const|let|var|val)\s+([a-zA-Z_]\w*)\s*=/;
  for (const line of strippedLines) {
    const m = line.match(declPattern);
    if (m) declared.push(m[1]!);
  }
  if (declared.length === 0) return [];

  const after = allLines.slice(endLine).join("\n");
  return declared.filter((name) =>
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(after),
  );
}

async function analyzeExtraction(
  extractedLines: string[],
  startLine: number,
  newMethodName: string,
  language: SupportedLanguage,
  freeVariableTypes?: Map<string, string>,
): Promise<ExtractionAnalysis> {
  const extractedCode = extractedLines.join("\n");
  const freeVars = await findFreeVariables(extractedLines, language);
  const signature = buildSignature(newMethodName, freeVars, language, freeVariableTypes);
  const callSite = buildCallSite(newMethodName, freeVars, []);

  return {
    extractedCode,
    freeVariables: freeVars,
    signature,
    callSite,
    startLine,
    endLine: startLine + extractedLines.length,
    returnedVariables: [],
  };
}

function buildSignature(methodName: string, params: string[], language?: SupportedLanguage, freeVariableTypes?: Map<string, string>): string {
  const TS_JS: readonly SupportedLanguage[] = ["typescript", "javascript", "tsx", "jsx"];
  if (language === "kotlin" && freeVariableTypes && freeVariableTypes.size > 0) {
    const paramList = params.map((p) => {
      const type = freeVariableTypes.get(p);
      return type ? `${p}: ${type}` : `${p}: Any`;
    }).join(", ");
    return `${methodName}(${paramList})`;
  }
  if (TS_JS.includes(language as SupportedLanguage ?? "" as SupportedLanguage) && freeVariableTypes && freeVariableTypes.size > 0) {
    const paramList = params.map((p) => {
      const type = freeVariableTypes.get(p);
      return type ? `${p}: ${type}` : p;
    }).join(", ");
    return `${methodName}(${paramList})`;
  }
  const paramList = params.join(", ");
  return `${methodName}(${paramList})`;
}

function buildCallSite(methodName: string, params: string[], returnedVariables: string[]): string {
  const argList = params.join(", ");
  const call = `${methodName}(${argList})`;
  if (returnedVariables.length === 0) return `${call};`;
  if (returnedVariables.length === 1) return `const ${returnedVariables[0]} = ${call};`;
  return `const [${returnedVariables.join(", ")}] = ${call};`;
}

function buildFunctionDefinition(
  methodName: string,
  params: string[],
  body: string,
  language: SupportedLanguage,
  classIndent?: string,
  freeVariableTypes?: Map<string, string>,
  returnedVariables?: string[],
): string {
  const baseIndent = classIndent ?? "";
  const indent = (line: string, spaces: number) => " ".repeat(spaces) + line;
  const indentedBody = (depth: number) => body.split("\n").map((l) => indent(l, depth)).join("\n");
  const indentedBodyWithBase = (depth: number) => body.split("\n").map((l) => baseIndent + indent(l, depth)).join("\n");

  const rets = returnedVariables ?? [];
  const returnStmt = rets.length === 0
    ? ""
    : rets.length === 1
      ? `return ${rets[0]};`
      : `return [${rets.join(", ")}];`;
  const tsReturn = returnStmt ? `\n${baseIndent}  ${returnStmt}` : "";

  const typedParams = (fallback: string) =>
    freeVariableTypes && freeVariableTypes.size > 0
      ? params.map((p) => { const t = freeVariableTypes.get(p); return t ? p + ": " + t : p + ": " + fallback; }).join(", ")
      : params.map((p) => p + ": " + fallback).join(", ");

  // ponytail: table over switch — adding a language is one entry, not a case
  const builders: Record<string, () => string> = {
    python: () => {
      const pydef = `\ndef ${methodName}(${params.join(", ")}):\n${indentedBody(4)}\n`;
      return baseIndent ? pydef.split("\n").map((l) => l ? baseIndent + l : l).join("\n") : pydef;
    },
    java: () => `\n${baseIndent}public void ${methodName}(${params.map((p) => "Object " + p).join(", ")}) {\n${indentedBodyWithBase(4 + baseIndent.length)}\n${baseIndent}}\n`,
    kotlin: () => `\n${baseIndent}fun ${methodName}(${typedParams("Any")}) {\n${body.split("\n").map((l) => baseIndent + indent(l, 4)).join("\n")}\n${baseIndent}}`,
    typescript: () => `\n${baseIndent}function ${methodName}(${freeVariableTypes && freeVariableTypes.size > 0 ? typedParams("").replace(/: $/, "") : params.join(", ")}) {\n${indentedBody(2)}${tsReturn}\n${baseIndent}}`,
    tsx: () => `\n${baseIndent}function ${methodName}(${freeVariableTypes && freeVariableTypes.size > 0 ? typedParams("").replace(/: $/, "") : params.join(", ")}) {\n${indentedBody(2)}${tsReturn}\n${baseIndent}}`,
    javascript: () => `\n${baseIndent}function ${methodName}(${params.join(", ")}) {\n${indentedBody(2)}${tsReturn}\n${baseIndent}}`,
    jsx: () => `\n${baseIndent}function ${methodName}(${params.join(", ")}) {\n${indentedBody(2)}${tsReturn}\n${baseIndent}}`,
    lua: () => `\n${baseIndent}function ${methodName}(${params.join(", ")})\n${indentedBody(2)}\n${baseIndent}end`,
    go: () => `\n${baseIndent}func ${methodName}(${params.map((p) => p + " unknown").join(", ")}) {\n${indentedBody(1)}\n${baseIndent}}`,
    rust: () => `\n${baseIndent}fn ${methodName}(${params.map((p) => p + ": unknown").join(", ")}) {\n${indentedBody(4)}\n${baseIndent}}`,
  };

  const build = builders[language];
  if (build) return build();
  const defaultParams = params.map((p) => "auto " + p).join(", ");
  return `\n${baseIndent}void ${methodName}(${defaultParams}) {\n${indentedBody(4)}\n${baseIndent}}`;
}