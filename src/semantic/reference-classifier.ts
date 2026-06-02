/**
 * Reference Type Classifier
 *
 * Classifies AST nodes to determine the type of reference (call, import, type, etc.)
 * Extracted from reference-finder.ts for maintainability and testability.
 *
 * @module reference-classifier
 */

import type { Node as SyntaxNode } from "web-tree-sitter";
import type { ReferenceType } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Kotlin type-related node types */
const KOTLIN_TYPE_NODES = new Set([
  "type_identifier", "user_type", "type_projection", "type_constraint",
  "nullable_type", "function_type", "type_argument_list", "type_parameters",
]);

/** TypeScript type annotation node types */
const TS_TYPE_NODES = new Set([
  "type_annotation", "type_identifier", "generic_type", "type_arguments", "type_parameter",
  "array_type", "tuple_type", "union_type", "intersection_type", "parenthesized_type",
  "object_type", "function_type", "constructor_type", "conditional_type", "indexed_access_type",
  "mapped_type", "literal_type", "typeof_type", "keyof_type", "infer_type", "predefined_type",
  "readonly_type", "template_literal_type", "type_alias_declaration", "interface_declaration",
  "required_parameter", "optional_parameter", "rest_pattern",
]);

/** Python type context node types */
const PYTHON_TYPE_CONTEXTS = new Set([
  "typed_parameter", "typed_default_parameter", "function_definition", "type",
]);

// ============================================================================
// Individual Classifiers
// ============================================================================

/** Classify call expressions (function/method calls) */
function classifyCall(parent: SyntaxNode, current: SyntaxNode | null): ReferenceType | null {
  const parentType = parent.type;
  const currentType = current?.type ?? "";

  if (parentType !== "call_expression" && parentType !== "call") {
    return null;
  }

  // Check if symbol is the function being called
  const firstChild = parent.firstChild;
  if (firstChild && current && (firstChild === current || firstChild.equals(current))) {
    return "call";
  }

  // Check if inside arguments
  const args = parent.childForFieldName("arguments");
  if (args && current && current.startIndex >= args.startIndex && current.endIndex <= args.endIndex) {
    return "argument";
  }

  // Python: check if inside attribute (e.g., git.Repo())
  if (currentType === "identifier") {
    const funcNode = parent.childForFieldName("function");
    if (funcNode && current && current.startIndex >= funcNode.startIndex && current.endIndex <= funcNode.endIndex) {
      return "call";
    }
  }

  // Kotlin: call_expression uses simple_identifier or navigation_suffix
  if (currentType === "simple_identifier" || currentType === "identifier") {
    return "call";
  }

  // Default to call if we're the function name
  if (currentType === "identifier" || currentType === "property_identifier") {
    return "call";
  }

  return null;
}

/** Classify import statements */
function classifyImport(parent: SyntaxNode): ReferenceType | null {
  const parentType = parent.type;

  // JS/TS imports
  if (parentType === "import_statement" || parentType === "import_specifier" || parentType === "import_clause") {
    return "import";
  }

  // Python imports
  if (parentType === "import_from_statement" || parentType === "aliased_import" || parentType === "dotted_name") {
    let checkParent: SyntaxNode | null = parent;
    while (checkParent) {
      if (checkParent.type === "import_from_statement" || checkParent.type === "import_statement") {
        return "import";
      }
      checkParent = checkParent.parent;
    }
  }

  // Kotlin imports
  if (parentType === "import_header" || parentType === "import_list") {
    return "import";
  }

  // Generic import check
  if (parentType.includes("import") && !parentType.includes("export")) {
    return "import";
  }

  return null;
}

/** Classify export statements */
function classifyExport(parent: SyntaxNode): ReferenceType | null {
  const parentType = parent.type;
  if (parentType === "export_statement" || parentType === "export_specifier" || parentType.includes("export")) {
    return "export";
  }
  return null;
}

/** Classify Kotlin type annotations */
function classifyKotlinType(parent: SyntaxNode): ReferenceType | null {
  if (KOTLIN_TYPE_NODES.has(parent.type)) {
    return "type";
  }
  return null;
}

/** Classify TypeScript type annotations */
function classifyTSType(parent: SyntaxNode): ReferenceType | null {
  if (TS_TYPE_NODES.has(parent.type)) {
    return "type";
  }
  return null;
}

/** Classify Python type annotations */
function classifyPythonType(parent: SyntaxNode): ReferenceType | null {
  const parentType = parent.type;

  // Check for Python type contexts
  if (parentType === "type" || parentType === "typed_parameter" || parentType === "typed_default_parameter") {
    return "type";
  }

  // Subscript for generic types: List[int], Dict[str, int]
  if (parentType === "subscript") {
    let checkParent: SyntaxNode | null = parent;
    while (checkParent) {
      if (PYTHON_TYPE_CONTEXTS.has(checkParent.type)) {
        return "type";
      }
      if (checkParent.type === "subscript" && checkParent.parent?.type === "type") {
        return "type";
      }
      checkParent = checkParent.parent;
    }
  }

  // Binary operator for union types: str | None (Python 3.10+)
  if (parentType === "binary_operator" && parent.childForFieldName("operator")?.text === "|") {
    let checkParent: SyntaxNode | null = parent;
    while (checkParent) {
      if (PYTHON_TYPE_CONTEXTS.has(checkParent.type)) {
        return "type";
      }
      checkParent = checkParent.parent;
    }
  }

  return null;
}

/** Classify property access */
function classifyProperty(parent: SyntaxNode, current: SyntaxNode | null): ReferenceType | null {
  const parentType = parent.type;

  // JS/TS member expression
  if (parentType === "member_expression" || parentType === "property_access_expression") {
    const prop = parent.childForFieldName("property");
    if (prop && current && prop.equals(current)) {
      return "property";
    }
  }

  // Kotlin member access (navigation_suffix: foo.bar)
  if (parentType === "navigation_suffix" || parentType === "postfix_expression") {
    const selector = parent.childForFieldName("selector");
    if (selector && current && selector.equals(current)) {
      return "property";
    }
  }

  // Python attribute access
  if (parentType === "attribute") {
    const attr = parent.childForFieldName("attribute");
    if (attr && current && attr.equals(current)) {
      return "property";
    }
    // Handle comparison/pattern matching contexts
    const grandparent = parent.parent;
    if (grandparent) {
      const gpType = grandparent.type;
      if (gpType === "comparison_operator" || gpType === "case_pattern" || gpType === "case_clause") {
        return "argument";
      }
    }
  }

  return null;
}

/** Classify assignments */
function classifyAssignment(parent: SyntaxNode, current: SyntaxNode | null): ReferenceType | null {
  const parentType = parent.type;

  if (parentType === "assignment_expression" || parentType === "variable_declarator") {
    return "assignment";
  }

  // Python assignment
  if (parentType === "assignment") {
    const left = parent.childForFieldName("left");
    if (left && current && left.equals(current)) {
      return "assignment";
    }
  }

  return null;
}

/** Classify class inheritance and implements */
function classifyInheritance(parent: SyntaxNode): ReferenceType | null {
  const parentType = parent.type;

  // Kotlin delegation/specifier
  if (parentType === "delegation_specifier" || parentType === "constructor_delegation_call" || parentType === "type_constraint") {
    return "extends";
  }

  if (parentType === "extends_clause" || parentType === "class_heritage") {
    return "extends";
  }

  if (parentType === "implements_clause") {
    return "implements";
  }

  // Python class inheritance
  if (parentType === "argument_list" && parent.parent?.type === "class_definition") {
    return "extends";
  }

  return null;
}

/** Classify decorators */
function classifyDecorator(parent: SyntaxNode, current: SyntaxNode | null): ReferenceType | null {
  const parentType = parent.type;

  if (parentType === "decorator") {
    return "decorator";
  }

  // Python decorated definition
  if (parentType === "decorated_definition") {
    const decorators = parent.children.filter((c): c is SyntaxNode => c !== null && c.type === "decorator");
    for (const dec of decorators) {
      if (current && current.startIndex >= dec.startIndex && current.endIndex <= dec.endIndex) {
        return "decorator";
      }
    }
  }

  return null;
}

/** Classify declarations (function, class, variable) */
function classifyDeclaration(parent: SyntaxNode, current: SyntaxNode | null): ReferenceType | null {
  const parentType = parent.type;

  // JS/TS declarations
  if (["function_declaration", "class_declaration", "variable_declaration", "lexical_declaration"].includes(parentType)) {
    const name = parent.childForFieldName("name");
    if (name && current && name.equals(current)) {
      return "declaration";
    }
  }

  // Python declarations
  if (["function_definition", "async_function_definition", "class_definition"].includes(parentType)) {
    const name = parent.childForFieldName("name");
    if (name && current && name.equals(current)) {
      return "declaration";
    }
    // Python return type annotation
    const returnType = parent.childForFieldName("return_type");
    if (returnType && current && current.startIndex >= returnType.startIndex && current.endIndex <= returnType.endIndex) {
      return "type";
    }
  }

  return null;
}

/** Classify pattern matching (Python 3.10+) */
function classifyPatternMatch(parent: SyntaxNode): ReferenceType | null {
  const parentType = parent.type;

  if (["case_clause", "case_pattern", "match_statement", "class_pattern"].includes(parentType)) {
    let checkParent: SyntaxNode | null = parent;
    while (checkParent) {
      if (checkParent.type === "match_statement" || checkParent.type === "case_clause") {
        return "argument";
      }
      checkParent = checkParent.parent;
    }
  }

  return null;
}

/** Classify arguments and other contexts */
function classifyOther(parent: SyntaxNode): ReferenceType | null {
  const parentType = parent.type;

  // Constructor call
  if (parentType === "new_expression") {
    return "new";
  }

  // Return statement
  if (parentType === "return_statement") {
    return "return";
  }

  // Comparison operator
  if (parentType === "comparison_operator") {
    return "argument";
  }

  // JSX elements
  if (["jsx_element", "jsx_self_closing_element", "jsx_opening_element"].includes(parentType)) {
    return "jsx";
  }

  // Arguments (but not class inheritance which is handled separately)
  if (parentType === "arguments" || parentType === "argument_list") {
    if (parent.parent?.type !== "class_definition") {
      return "argument";
    }
  }

  return null;
}

/**
 * Try all classifiers at a single AST level
 * Returns the reference type or null to continue walking up the tree
 */
function classifyAtLevel(parent: SyntaxNode, current: SyntaxNode | null): ReferenceType | null {
  // Order matters: more specific checks first
  return (
    classifyCall(parent, current) ??
    classifyImport(parent) ??
    classifyExport(parent) ??
    classifyKotlinType(parent) ??
    classifyTSType(parent) ??
    classifyPythonType(parent) ??
    classifyProperty(parent, current) ??
    classifyAssignment(parent, current) ??
    classifyInheritance(parent) ??
    classifyDecorator(parent, current) ??
    classifyDeclaration(parent, current) ??
    classifyPatternMatch(parent) ??
    classifyOther(parent)
  );
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Classify the type of reference based on AST context
 *
 * Walks up the AST tree from the given node, applying classifiers at each level
 * until a match is found.
 *
 * @param node - The AST node to classify
 * @returns The classified reference type
 */
export function classifyReferenceType(node: SyntaxNode): ReferenceType {
  // Walk up the tree, trying classifiers at each level
  let current: SyntaxNode | null = node;
  let parent: SyntaxNode | null = node.parent;

  while (parent) {
    const result = classifyAtLevel(parent, current);
    if (result !== null) {
      return result;
    }
    current = parent;
    parent = parent.parent;
  }

  return "unknown";
}
