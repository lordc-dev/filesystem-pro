import { ERROR_MESSAGES } from "../constants.js";
import { createUnifiedDiff } from "../operations/diff-operations.js";
import { escapeRegex as escapeRegExp } from "../utils/text-utils.js";
import {
  findSymbol,
  getLanguageFromPath,
  treeSitterManager,
  type SupportedLanguage,
} from "../semantic/index.js";
import { undoManager } from "./undo-manager.js";
import { stalenessGuard } from "./staleness-guard.js";
import { atomicWrite } from "../utils/fs-utils.js";
import type { Node as SyntaxNode } from "web-tree-sitter";

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
}

const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default",
  "break", "continue", "return", "throw", "try", "catch", "finally",
  "class", "interface", "enum", "struct", "type", "namespace", "module",
  "import", "export", "from", "as", "is", "in", "of", "new", "this",
  "super", "self", "null", "undefined", "true", "false", "void", "var",
  "let", "const", "val", "fun", "function", "def", "async", "await",
  "yield", "static", "public", "private", "protected", "internal",
  "override", "abstract", "final", "sealed", "open", "data", "object",
  "companion", "suspend", "inline", "when", "it", "also", "apply",
  "with", "run", "let", "takeIf", "takeUnless",
]);

const STDLIB_TYPES = new Set([
  "String", "Int", "Long", "Double", "Float", "Boolean", "Byte", "Short",
  "Char", "Unit", "Nothing", "Any", "Array", "List", "Set", "Map",
  "Sequence", "Iterable", "Collection", "MutableList", "MutableSet",
  "MutableMap", "MutableCollection", "Range", "IntRange", "LongRange",
  "println", "print", "readLine", "require", "check", "error",
  "compareTo", "equals", "hashCode", "toString",
  "sumOf", "mapOf", "listOf", "setOf", "mapNotNull", "filterNotNull",
  "arrayOf", "intArrayOf", "longArrayOf", "doubleArrayOf",
  "toInt", "toLong", "toDouble", "toFloat", "toBoolean", "toString",
  "size", "length", "indices", "lastIndex", "first", "last", "count",
  "isEmpty", "isNotEmpty", "contains", "indexOf", "lastIndexOf",
]);

const AST_SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  "typescript", "javascript", "tsx", "jsx", "python", "kotlin",
];

const WRAPPER_TEMPLATES: Record<string, (code: string) => string> = {
  typescript: (code: string) => `function __extract_wrapper__() {\n${code}\n}`,
  javascript: (code: string) => `function __extract_wrapper__() {\n${code}\n}`,
  tsx: (code: string) => `function __extract_wrapper__() {\n${code}\n}`,
  jsx: (code: string) => `function __extract_wrapper__() {\n${code}\n}`,
  python: (code: string) => {
    const indented = code.split("\n").map((l: string) => "    " + l).join("\n");
    return `def __extract_wrapper__():\n${indented}`;
  },
  kotlin: (code: string) => `fun __extract_wrapper__() {\n${code}\n}`,
};

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

  const firstExtractedLine = extractedLines[0] || "";
  const extractedIndentMatch = firstExtractedLine.match(/^(\s*)/);
  const extractedBaseIndent = extractedIndentMatch ? extractedIndentMatch[1] : "";
  const extractedBaseIndentLen = extractedBaseIndent.length;
  const strippedExtractedLines = extractedLines.map((l) =>
    l.length >= extractedBaseIndentLen && l.substring(0, extractedBaseIndentLen) === extractedBaseIndent
      ? l.substring(extractedBaseIndentLen)
      : l.trimStart()
  );

  const TS_JS_LANGUAGES: readonly SupportedLanguage[] = ["typescript", "javascript", "tsx", "jsx"];
  let freeVariableTypes: Map<string, string> = new Map();
  if (language === "kotlin" && parentSymbol) {
    freeVariableTypes = await inferKotlinFreeVariableTypes(content, language, strippedExtractedLines, parentSymbol);
  } else if (TS_JS_LANGUAGES.includes(language)) {
    freeVariableTypes = await inferTSJSFreeVariableTypes(content, language, strippedExtractedLines, parentSymbol);
  }

  const analysis = await analyzeExtraction(
    strippedExtractedLines,
    startLine,
    newMethodName,
    language,
    freeVariableTypes,
  );

  let insertionPoint = lines.length;
  let insertInsideClass = false;
  let classIndent = "";
  if (parentSymbol) {
    const lookupResult = await findSymbol({ content, language }, parentSymbol);
    if (lookupResult) {
      const sym = lookupResult.symbol;
      if (language === "kotlin") {
        const classEndLine = sym.location.endLine;
        let closingBraceLine = classEndLine;
        for (let i = classEndLine; i >= sym.location.startLine; i--) {
          if (lines[i].trimEnd() === "}") {
            closingBraceLine = i;
            break;
          }
        }
        insertionPoint = closingBraceLine;
        insertInsideClass = true;
        for (let i = sym.location.startLine + 1; i < closingBraceLine; i++) {
          const ln = lines[i];
          if (ln.trim().length > 0 && ln.trim() !== "}") {
            classIndent = ln.match(/^(\s*)/)?.[1] ?? "    ";
            break;
          }
        }
      } else {
        insertionPoint = sym.location.endLine + 1;
      }
    }
  }

  const functionDef = buildFunctionDefinition(
    newMethodName,
    analysis.freeVariables,
    analysis.extractedCode,
    language,
    insertInsideClass ? classIndent : undefined,
    freeVariableTypes,
  );

  const callSite = extractedBaseIndent + buildCallSite(newMethodName, analysis.freeVariables);

  const newLines = [...lines];
  newLines.splice(startLine, endLine - startLine, callSite);
  const removed = endLine - startLine;
  const added = callSite.split('\n').length;
  const adjustedInsertion =
    insertionPoint > startLine
      ? insertionPoint - removed + added
      : insertionPoint;
  newLines.splice(adjustedInsertion, 0, ...functionDef.split("\n"));

  const newContent = newLines.join("\n");
  const diff = createUnifiedDiff(content, newContent, filePath, {});

  if (!dryRun) {
    await undoManager.record(filePath, `extract_method: ${newMethodName}`);
    await atomicWrite(filePath, newContent);
  }

  return {
    success: true,
    diff,
    modifiedFiles: dryRun ? [] : [filePath],
    errors: [],
    description: `Extracted lines ${startLine1}-${endLine1} into ${newMethodName}()`,
  };
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
  const callSite = buildCallSite(newMethodName, freeVars);

  return {
    extractedCode,
    freeVariables: freeVars,
    signature,
    callSite,
    startLine,
    endLine: startLine + extractedLines.length,
  };
}

async function findFreeVariables(extractedLines: string[], language?: SupportedLanguage): Promise<string[]> {
  if (language && AST_SUPPORTED_LANGUAGES.includes(language)) {
    try {
      await treeSitterManager.initialize();
      const astResult = await findFreeVariablesAST(extractedLines, language);
      if (astResult.length > 0) return astResult;
    } catch {
      // fall through to regex
    }
  }
  return findFreeVariablesRegex(extractedLines);
}

async function findFreeVariablesAST(extractedLines: string[], language: SupportedLanguage): Promise<string[]> {
  const code = extractedLines.join("\n");
  const wrapperFn = WRAPPER_TEMPLATES[language];
  if (!wrapperFn) return findFreeVariablesRegex(extractedLines);

  const wrappedCode = wrapperFn(code);
  const tree = await treeSitterManager.parse(wrappedCode, language);
  const root = tree.rootNode;

  const identifiers = new Set<string>();
  const definedWithin = new Set<string>();
  const propertyAccesses = new Set<string>();

  function walk(node: SyntaxNode): void {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      processNode(child);
      walk(child);
    }
  }

  function processNode(node: SyntaxNode): void {
    const type = node.type;

    if (type === "member_expression" || type === "property_identifier") {
      if (node.parent?.type === "member_expression" && node === node.parent.child(2)) {
        propertyAccesses.add(node.text);
        return;
      }
    }

    if (type === "string" || type === "string_literal" || type === "template_string" ||
        type === "comment" || type === "regex" || type === "regex_pattern" ||
        type === "string_content" || type === "interpolation") {
      return;
    }

    if (type === "variable_declarator" || type === "function_declaration" ||
        type === "lexical_declaration" || type === "variable_declaration") {
      const nameNode = node.child(0);
      if (nameNode) definedWithin.add(nameNode.text);
    }

    if (type === "formal_parameters" || type === "parameters" || type === "parameter") {
      collectParamNames(node, definedWithin);
    }

    if (type === "for_statement" || type === "for_in_statement") {
      const firstChild = node.child(1);
      if (firstChild) {
        const nameNode = firstChild.child(0);
        if (nameNode) definedWithin.add(nameNode.text);
      }
    }

    if (type === "lambda_literal" || type === "lambda_expression") {
      const params = node.child(0);
      if (params) {
        for (let i = 0; i < params.childCount; i++) {
          const p = params.child(i);
          if (p && /^[a-zA-Z_]/.test(p.text)) definedWithin.add(p.text);
        }
      }
    }

    if (type === "catch_clause" || type === "catch") {
      for (let i = 0; i < node.childCount; i++) {
        const ch = node.child(i);
        if (ch && (ch.type === "identifier" || ch.type === "simple_identifier")) {
          definedWithin.add(ch.text);
        }
      }
    }

    if (type === "identifier" || type === "identifier_name" || type === "simple_identifier") {
      const text = node.text;
      if (!KEYWORDS.has(text) && !STDLIB_TYPES.has(text) && !definedWithin.has(text) && !propertyAccesses.has(text)) {
        identifiers.add(text);
      }
    }
  }

  function collectParamNames(node: SyntaxNode, names: Set<string>): void {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      if (child.type === "identifier" || child.type === "simple_identifier" || child.type === "parameter") {
        if (/^[a-zA-Z_]/.test(child.text)) names.add(child.text);
      }
      collectParamNames(child, names);
    }
  }

  walk(root);
  tree.delete();

  return [...identifiers].filter(
    (id) => !KEYWORDS.has(id) && !STDLIB_TYPES.has(id) && !definedWithin.has(id) && !propertyAccesses.has(id),
  );
}

function findFreeVariablesRegex(extractedLines: string[]): string[] {
  const code = extractedLines.join("\n");
  const identifiers = new Set<string>();
  const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = identifierPattern.exec(code)) !== null) {
    identifiers.add(match[1]);
  }

  const identifiersAfterDot = new Set<string>();
  const dotAccessPattern = /\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  while ((match = dotAccessPattern.exec(code)) !== null) {
    identifiersAfterDot.add(match[1]);
  }

  const lambdaParams = new Set<string>();
  const lambdaParamPattern = /\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+->/g;
  while ((match = lambdaParamPattern.exec(code)) !== null) {
    lambdaParams.add(match[1]);
  }

  const definedWithin = new Set<string>();
  const defPattern = /(?:var|let|const|val|fun|function|def)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((match = defPattern.exec(code)) !== null) {
    definedWithin.add(match[1]);
  }

  const destructuringPattern = /(?:var|let|const|val)\s+\(([^)]+)\)/g;
  while ((match = destructuringPattern.exec(code)) !== null) {
    const names = match[1].split(",").map((s) => s.trim().split("=")[0].trim().split(":")[0].trim()).filter((s) => /^[a-zA-Z_]/.test(s));
    names.forEach((n) => definedWithin.add(n));
  }

  const arrayDestructuringPattern = /(?:var|let|const|val)\s+\[([^\]]+)\]/g;
  while ((match = arrayDestructuringPattern.exec(code)) !== null) {
    const names = match[1].split(",").map((s) => s.trim().split("=")[0].trim().split(":")[0].trim()).filter((s) => /^[a-zA-Z_]/.test(s));
    names.forEach((n) => definedWithin.add(n));
  }

  return [...identifiers].filter(
    (id) => !KEYWORDS.has(id) && !STDLIB_TYPES.has(id) && !definedWithin.has(id) && !identifiersAfterDot.has(id) && !lambdaParams.has(id),
  );
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

function buildCallSite(methodName: string, params: string[]): string {
  const argList = params.join(", ");
  return `${methodName}(${argList})`;
}

function buildFunctionDefinition(
  methodName: string,
  params: string[],
  body: string,
  language: SupportedLanguage,
  classIndent?: string,
  freeVariableTypes?: Map<string, string>,
): string {
  const paramList = params.join(", ");
  const indent = (line: string, spaces: number) => " ".repeat(spaces) + line;
  const baseIndent = classIndent ?? "";

  switch (language) {
    case "python": {
      const pydef = `\ndef ${methodName}(${paramList}):\n${body.split("\n").map((l) => indent(l, 4)).join("\n")}\n`;
      return baseIndent ? pydef.split("\n").map((l) => l ? baseIndent + l : l).join("\n") : pydef;
    }
    case "java": {
      const javaParams = params.map((p) => `Object ${p}`).join(", ");
      return `\n${baseIndent}public void ${methodName}(${javaParams}) {\n${body.split("\n").map((l) => indent(l, 4 + baseIndent.length)).join("\n")}\n${baseIndent}}\n`;
    }
    case "kotlin": {
      const kotlinParams = freeVariableTypes && freeVariableTypes.size > 0
        ? params.map((p) => { const type = freeVariableTypes.get(p); return type ? `${p}: ${type}` : `${p}: Any`; }).join(", ")
        : params.map((p) => `${p}: Any`).join(", ");
      const indentedBody = body.split("\n").map((l) => baseIndent + indent(l, 4)).join("\n");
      return `\n${baseIndent}fun ${methodName}(${kotlinParams}) {\n${indentedBody}\n${baseIndent}}`;
    }
    case "typescript":
    case "tsx":
      if (freeVariableTypes && freeVariableTypes.size > 0) {
        const tsParams = params.map((p) => {
          const type = freeVariableTypes.get(p);
          return type ? `${p}: ${type}` : p;
        }).join(", ");
        return `\n${baseIndent}function ${methodName}(${tsParams}) {\n${body.split("\n").map((l) => indent(l, 2)).join("\n")}\n${baseIndent}}`;
      }
      return `\n${baseIndent}function ${methodName}(${paramList}) {\n${body.split("\n").map((l) => indent(l, 2)).join("\n")}\n${baseIndent}}`;
    case "javascript":
    case "jsx":
      return `\n${baseIndent}function ${methodName}(${paramList}) {\n${body.split("\n").map((l) => indent(l, 2)).join("\n")}\n${baseIndent}}`;
    case "go":
      return `\n${baseIndent}func ${methodName}(${params.map((p) => `${p} unknown`).join(", ")}) {\n${body.split("\n").map((l) => indent(l, 1)).join("\n")}\n${baseIndent}}`;
    case "rust":
      return `\n${baseIndent}fn ${methodName}(${params.map((p) => `${p}: unknown`).join(", ")}) {\n${body.split("\n").map((l) => indent(l, 4)).join("\n")}\n${baseIndent}}`;
    default:
      return `\n${baseIndent}void ${methodName}(${params.map((p) => `auto ${p}`).join(", ")}) {\n${body.split("\n").map((l) => indent(l, 4)).join("\n")}\n${baseIndent}}`;
  }
}

async function inferKotlinFreeVariableTypes(
  content: string,
  language: SupportedLanguage,
  extractedLines: string[],
  parentSymbol: string,
): Promise<Map<string, string>> {
  const types = new Map<string, string>();
  const freeVars = await findFreeVariables(extractedLines, language);
  if (freeVars.length === 0) return types;

  try {
    await treeSitterManager.initialize();
    const tree = await treeSitterManager.parse(content, language);
    const root = tree.rootNode;

    function collectTypedParams(node: SyntaxNode): void {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        const childType = child.type;

        if (childType === "class_declaration" || childType === "object_declaration") {
          const primaryConstructor = child.children.filter((c): c is SyntaxNode => c !== null).find((c) => c.type === "primary_constructor");
          if (primaryConstructor) {
            extractParamsFromNode(primaryConstructor, types, freeVars);
          }
        }

        if (childType === "function_declaration") {
          const funcName = child.childForFieldName("name")?.text;
          const shortName = parentSymbol.includes('/') ? parentSymbol.split('/').pop()! : parentSymbol;
          if (funcName === shortName) {
            const params = child.childForFieldName("parameters");
            if (params) {
              extractParamsFromNode(params, types, freeVars);
            }
          }
        }

        if (childType === "property_declaration" || childType === "variable_declaration") {
          const nameNode = child.childForFieldName("name");
          const typeNode = child.childForFieldName("type");
          if (nameNode && typeNode && freeVars.includes(nameNode.text)) {
            types.set(nameNode.text, typeNode.text.trim());
          }
        }

        collectTypedParams(child);
      }
    }

    function extractParamsFromNode(node: SyntaxNode, types: Map<string, string>, freeVars: string[]): void {
      for (let i = 0; i < node.childCount; i++) {
        const param = node.child(i);
        if (!param) continue;
        if (param.type === "parameter" || param.type === "simple_identifier") {
          const nameNode = param.childForFieldName("name") ?? param.child(0);
          const typeNode = param.childForFieldName("type") ?? param.child(2);
          if (nameNode && freeVars.includes(nameNode.text)) {
            if (typeNode) {
              types.set(nameNode.text, typeNode.text.trim());
            } else {
              types.set(nameNode.text, "Any");
            }
          }
        }
      }
    }

    collectTypedParams(root);
    tree.delete();
  } catch {
    fallbackKotlinTypeInference(content, freeVars, types, parentSymbol);
  }

  for (const varName of freeVars) {
    if (types.has(varName)) continue;
    const valMatch = content.match(new RegExp(`(?:val|var)\\s+${escapeRegExp(varName)}\\s*:\\s*([A-Z][\\w.<>, ?]+)`));
    if (valMatch) {
      types.set(varName, valMatch[1].trim());
    }
  }

  return types;
}

function fallbackKotlinTypeInference(
  content: string,
  freeVars: string[],
  types: Map<string, string>,
  parentSymbol: string,
): void {
  const constructorPattern = /class\s+\w+\s*\(([^)]+)\)/;
  const constructorMatch = content.match(constructorPattern);
  if (constructorMatch) {
    const paramsStr = constructorMatch[1];
    const paramPattern = /(\w+)\s*:\s*([A-Z][\w.<>, ?]+)/g;
    let m: RegExpExecArray | null;
    while ((m = paramPattern.exec(paramsStr)) !== null) {
      const paramName = m[1];
      const paramType = m[2].trim().replace(/\s*=.*/, "").trim().replace(/,+$/, "");
      if (freeVars.includes(paramName)) {
        types.set(paramName, paramType);
      }
    }
  }

  const methodShortName = parentSymbol.includes('/') ? parentSymbol.split('/').pop()! : parentSymbol;
  const methodMatch = content.match(new RegExp(`fun\\s+${escapeRegExp(methodShortName)}\\s*\\(([^)]+)\\)`));
  if (methodMatch) {
    const paramsStr = methodMatch[1];
    const paramPattern = /(\w+)\s*:\s*([A-Z][\w.<>, ?]+)/g;
    let m: RegExpExecArray | null;
    while ((m = paramPattern.exec(paramsStr)) !== null) {
      const paramName = m[1];
      const paramType = m[2].trim().replace(/\s*=.*/, "").trim().replace(/,+$/, "");
      if (freeVars.includes(paramName)) {
        types.set(paramName, paramType);
      }
    }
  }
}
async function inferTSJSFreeVariableTypes(
  content: string,
  language: SupportedLanguage,
  extractedLines: string[],
  _parentSymbol?: string,
): Promise<Map<string, string>> {
  const types = new Map<string, string>();
  const freeVars = await findFreeVariables(extractedLines, language);
  if (freeVars.length === 0) return types;

  try {
    await treeSitterManager.initialize();
    const tree = await treeSitterManager.parse(content, language);
    const root = tree.rootNode;

    function collectTypedDeclarations(node: SyntaxNode): void {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;

        if (child.type === "lexical_declaration" || child.type === "variable_declaration") {
          for (let j = 0; j < child.childCount; j++) {
            const declarator = child.child(j);
            if (declarator?.type !== "variable_declarator") continue;
            const nameNode = declarator.childForFieldName("name") ?? declarator.child(0);
            const typeAnnotation = declarator.descendantsOfType("type_annotation");
            if (nameNode && freeVars.includes(nameNode.text) && typeAnnotation.length > 0) {
              types.set(nameNode.text, typeAnnotation[0]!.text.replace(/^:\s*/, ""));
            }
          }
        }

        if (child.type === "function_declaration" || child.type === "method_definition") {
          const params = child.childForFieldName("parameters");
          if (params) {
            for (let k = 0; k < params.childCount; k++) {
              const param = params.child(k);
              if (!param) continue;
              if (param.type === "required_parameter" || param.type === "optional_parameter" || param.type === "rest_parameter" || param.type === "assignment_pattern") {
                const paramName = param.childForFieldName("name") ?? param.child(0);
                const paramType = param.childForFieldName("type");
                if (paramName && freeVars.includes(paramName.text) && paramType) {
                  types.set(paramName.text, paramType.text.replace(/^:\s*/, ""));
                }
              }
            }
          }
        }

        if (child.type === "for_of_statement" || child.type === "for_in_statement") {
          const left = child.childForFieldName("left");
          if (left) {
            const typeAnn = left.descendantsOfType("type_annotation");
            if (typeAnn.length > 0) {
              const nameNode = left.childForFieldName("name") ?? left.child(0);
              if (nameNode && freeVars.includes(nameNode.text)) {
                types.set(nameNode.text, typeAnn[0]!.text.replace(/^:\s*/, ""));
              }
            }
          }
        }

        collectTypedDeclarations(child);
      }
    }

    collectTypedDeclarations(root);
    tree.delete();
  } catch {
    inferTSJSTypesRegex(content, freeVars, types);
  }

  if (types.size < freeVars.length) {
    inferTSJSTypesRegex(content, freeVars, types);
  }

  return types;
}

function inferTSJSTypesRegex(content: string, freeVars: string[], types: Map<string, string>): void {
  for (const varName of freeVars) {
    if (types.has(varName)) continue;
    const pattern = new RegExp(`(?:const|let|var)\\s+${escapeRegExp(varName)}\\s*:\\s*([A-Za-z_$][\\w<>\\[\\] {},|]*)(?:\\s*[=,;\\n)]|\\s*$)`);
    const match = content.match(pattern);
    if (match) {
      types.set(varName, match[1].trim());
    }
  }
}
