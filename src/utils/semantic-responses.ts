/**
 * Semantic response helpers — extracted from response-helpers.ts (SSOT).
 * Responses for semantic code operations: replace/insert/rename/delete/find.
 */

import type { ToolResponse, FormattedSymbol } from "./response-helpers.js";
import { formatSymbolAsText } from "./response-helpers.js";


/**
 * Result of a semantic code operation (replace, insert, rename, delete)
 * Used to standardize response format across semantic tools
 */
export interface SemanticOperationResult {
  success: boolean;
  diff: string;
  error?: string;
  filePath?: string;
  newContent?: string;
}

/**
 * Create a response for semantic code operations (SSOT)
 * Reduces boilerplate in semantic tool handlers (replace_symbol_body, insert_*, etc.)
 * 
 * @param result - The semantic operation result
 * @returns Formatted MCP tool response with success/error messaging
 */
export function semanticOperationResponse(result: SemanticOperationResult): ToolResponse {
  const text = result.success ? result.diff : `Error: ${result.error}`;
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: {
      success: result.success,
      diff: result.diff,
      ...(result.error != null && { error: result.error }),
    },
  };
}

/**
 * Create a response for symbol extraction results (get_symbols_overview)
 * Reduces boilerplate in semantic tool handlers.
 * 
 * @param filePath - Path to the file analyzed
 * @param language - Detected language
 * @param symbols - Array of formatted symbols
 * @param totalCount - Total symbol count including nested
 * @returns Formatted MCP tool response
 */
export function symbolsOverviewResponse(
  filePath: string,
  language: string,
  symbols: FormattedSymbol[],
  totalCount: number
): ToolResponse {
  const text = symbols.map(formatSymbolAsText).join("\n") || "No symbols found";
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: {
      filePath,
      language,
      symbols,
      totalCount,
    },
  };
}

/**
 * Symbol match for find_symbol responses
 */
export interface SymbolMatch {
  namePath: string;
  kind: string;
  location: {
    startLine: number;
    endLine: number;
  };
  body?: string;
}

/**
 * Create a response for symbol search results (find_symbol)
 * Reduces boilerplate in semantic tool handlers.
 * 
 * @param matches - Array of symbol matches
 * @returns Formatted MCP tool response
 */
export function symbolMatchesResponse(matches: SymbolMatch[]): ToolResponse {
  const text = matches.map(m => {
    let line = `[${m.kind}] ${m.namePath} (lines ${m.location.startLine}-${m.location.endLine})`;
    if (m.body) {
      line += `\n\`\`\`\n${m.body}\n\`\`\``;
    }
    return line;
  }).join("\n\n") || "No symbols found matching pattern";
  
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: { matches, count: matches.length },
  };
}

/**
 * Reference for find_symbol_references responses
 */
export interface SymbolReferenceInfo {
  filePath: string;
  line: number;
  column: number;
  context?: string;
  isDefinition: boolean;
}

/**
 * Create a response for reference search results (find_symbol_references)
 * Reduces boilerplate in semantic tool handlers.
 * 
 * @param symbolName - Name of the symbol searched for
 * @param references - Array of references found
 * @param filesCount - Number of files containing references
 * @returns Formatted MCP tool response
 */
export function referencesResponse(
  symbolName: string,
  references: SymbolReferenceInfo[],
  filesCount: number
): ToolResponse {
  const text = references.map(r => 
    `${r.filePath}:${r.line}:${r.column}${r.isDefinition ? ' (definition)' : ''}\n  ${r.context ?? ''}`
  ).join("\n") || "No references found";
  
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: {
      symbolName,
      references,
      totalCount: references.length,
      filesCount,
    },
  };
}

/**
 * Create a response for rename symbol results
 * Reduces boilerplate in semantic tool handlers.
 * 
 * @param oldName - Original symbol name
 * @param newName - New symbol name
 * @param modifiedFiles - Array of modified file paths
 * @param totalReferences - Total references renamed
 * @param diffs - Map of file paths to their diffs
 * @param errors - Array of error messages
 * @returns Formatted MCP tool response
 */
export function renameResultResponse(
  oldName: string,
  newName: string,
  modifiedFiles: string[],
  totalReferences: number,
  diffs: Map<string, string>,
  errors: string[]
): ToolResponse {
  let text = `Renamed "${oldName}" to "${newName}"\n`;
  text += `Modified ${modifiedFiles.length} files, ${totalReferences} references\n\n`;
  
  for (const [file, diff] of diffs) {
    text += `--- ${file} ---\n${diff}\n`;
  }
  
  if (errors.length > 0) {
    text += `\nErrors:\n${errors.join("\n")}`;
  }
  
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: {
      oldName,
      newName,
      modifiedFiles,
      totalReferences,
      errors,
    },
  };
}
