/**
 * Free-variable analysis and type inference for extract-method.
 *
 * Split from extract-method.ts to keep concerns separated:
 * - extract-method.ts: orchestration, insertion, builders
 * - this module: finding free variables (AST + regex fallback) and
 *   inferring their parameter types (Kotlin + TS/JS)
 */

import { escapeRegex as escapeRegExp } from "../utils/text-utils.js";
import { treeSitterManager, type SupportedLanguage } from "../semantic/index.js";
import type { Node as SyntaxNode } from "web-tree-sitter";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const GLOBAL_IDENTIFIERS = new Set([
  "console", "Math", "JSON", "Object", "Array", "String", "Number",
  "Boolean", "Date", "RegExp", "Error", "TypeError", "Promise", "Symbol",
  "Map", "Set", "WeakMap", "WeakSet", "Proxy", "Reflect", "BigInt",
  "globalThis", "window", "document", "navigator", "localStorage",
  "sessionStorage", "fetch", "setTimeout", "setInterval", "clearTimeout",
  "clearInterval", "queueMicrotask", "structuredClone", "alert", "require",
  "module", "exports", "process", "Buffer", "__dirname", "__filename",
  "Intl", "URL", "URLSearchParams", "AbortController", "TextEncoder",
  "TextDecoder", "crypto", "performance", "atob", "btoa",
  "print", "println", "System", "Runtime",
]);

const AST_SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  "typescript", "javascript", "tsx", "jsx", "python", "kotlin", "lua",
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
  lua: (code: string) => `function __extract_wrapper__()\n${code}\nend`,
};

// ---------------------------------------------------------------------------
// Free-variable analysis
// ---------------------------------------------------------------------------

export async function findFreeVariables(extractedLines: string[], language?: SupportedLanguage): Promise<string[]> {
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
      if (text === "__extract_wrapper__") return;
      if (!KEYWORDS.has(text) && !STDLIB_TYPES.has(text) && !GLOBAL_IDENTIFIERS.has(text) && !definedWithin.has(text) && !propertyAccesses.has(text)) {
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
    (id) => id !== "__extract_wrapper__" && !KEYWORDS.has(id) && !STDLIB_TYPES.has(id) && !GLOBAL_IDENTIFIERS.has(id) && !definedWithin.has(id) && !propertyAccesses.has(id),
  );
}

function stripStringsAndComments(code: string): string {
  // ponytail: single-pass scanner — handles quotes, template literals, line/block comments
  let result = "";
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === "\\") i++;
        i++;
      }
      i++;
      result += " ";
    } else if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i++;
      result += " ";
    } else if (c === "/" && code[i + 1] === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      result += " ";
    } else {
      result += c;
      i++;
    }
  }
  return result;
}

function findFreeVariablesRegex(extractedLines: string[]): string[] {
  const code = stripStringsAndComments(extractedLines.join("\n"));
  const identifiers = new Set<string>();
  const identifierPattern = /\b([a-zA-Z_]\w*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = identifierPattern.exec(code)) !== null) {
    identifiers.add(match[1]);
  }

  const identifiersAfterDot = new Set<string>();
  const dotAccessPattern = /\.([a-zA-Z_]\w*)\b/g;
  while ((match = dotAccessPattern.exec(code)) !== null) {
    identifiersAfterDot.add(match[1]);
  }

  const lambdaParams = new Set<string>();
  const lambdaParamPattern = /\{\s*([a-zA-Z_]\w*)\s+->/g;
  while ((match = lambdaParamPattern.exec(code)) !== null) {
    lambdaParams.add(match[1]);
  }

  const definedWithin = new Set<string>();
  const defPattern = /(?:var|let|const|val|fun|function|def)\s+([a-zA-Z_]\w*)/g;
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
    (id) => !KEYWORDS.has(id) && !STDLIB_TYPES.has(id) && !GLOBAL_IDENTIFIERS.has(id) && !definedWithin.has(id) && !identifiersAfterDot.has(id) && !lambdaParams.has(id),
  );
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

/**
 * Dispatch type inference by language. Returns empty map for unsupported languages.
 */
export async function inferFreeVariableTypes(
  content: string,
  language: SupportedLanguage,
  strippedLines: string[],
  parentSymbol: string | undefined,
): Promise<Map<string, string>> {
  const TS_JS_LANGUAGES: readonly SupportedLanguage[] = ["typescript", "javascript", "tsx", "jsx"];
  if (language === "kotlin" && parentSymbol) {
    return inferKotlinFreeVariableTypes(content, language, strippedLines, parentSymbol);
  }
  if (TS_JS_LANGUAGES.includes(language)) {
    return inferTSJSFreeVariableTypes(content, language, strippedLines, parentSymbol);
  }
  return new Map();
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
    const paramPattern = /(\w+)\s*:\s*([A-Z][\w.<>, ]+\??)/g;
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
    const paramPattern = /(\w+)\s*:\s*([A-Z][\w.<>, ]+\??)/g;
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
    const pattern = new RegExp(`(?:const|let|var)\\s+${escapeRegExp(varName)}\\s*:\\s*([A-Za-z_$][\\w<>\\[\\] {},|]+)(?:[=,;\\n)]|\\s*$)`);
    const match = content.match(pattern);
    if (match) {
      types.set(varName, match[1].trim());
    }
  }
}