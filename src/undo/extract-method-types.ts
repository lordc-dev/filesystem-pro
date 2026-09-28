/**
 * Type inference for extract-method free variables — extracted from
 * extract-method-analysis.ts (SSOT). Kotlin + TS/JS inference.
 */

import { escapeRegex as escapeRegExp } from "../utils/text-utils.js";
import { treeSitterManager, type SupportedLanguage } from "../semantic/index.js";
import type { Node as SyntaxNode } from "web-tree-sitter";
import { findFreeVariables } from "./extract-method-analysis.js";

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
