/**
 * Response helper utilities for MCP tool handlers
 * Reduces boilerplate in tool response formatting (SSOT)
 * 
 * All tool responses should use these helpers for consistency.
 */

import type { Symbol } from "../semantic/types.js";
import { SymbolKindNames } from "../semantic/types.js";

// ============================================================================
// SYMBOL FORMATTING (SSOT for semantic tool responses)
// ============================================================================

/**
 * Formatted symbol for API responses
 * Uses 1-indexed lines for human readability
 */
export interface FormattedSymbol {
  name: string;
  namePath: string;
  kind: number;
  kindName: string;
  location: {
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
  };
  children?: FormattedSymbol[];
}

/**
 * Format a Symbol for API response (SSOT)
 * 
 * Converts 0-indexed lines to 1-indexed for human readability.
 * Recursively formats children.
 * 
 * @param symbol - The Symbol to format
 * @returns Formatted symbol with 1-indexed lines
 */
export function formatSymbolForDisplay(symbol: Symbol): FormattedSymbol {
  return {
    name: symbol.name,
    namePath: symbol.namePath,
    kind: symbol.kind,
    kindName: SymbolKindNames[symbol.kind] || "Unknown",
    location: {
      startLine: symbol.location.startLine + 1,
      endLine: symbol.location.endLine + 1,
      startColumn: symbol.location.startColumn,
      endColumn: symbol.location.endColumn,
    },
    children: symbol.children?.length > 0 
      ? symbol.children.map(formatSymbolForDisplay) 
      : undefined,
  };
}

/**
 * Format symbol for text display (single line)
 */
export function formatSymbolAsText(symbol: FormattedSymbol): string {
  return `[${symbol.kindName}] ${symbol.namePath} (line ${symbol.location.startLine})`;
}

/**
 * MCP tool response type (compatible with SDK CallToolResult)
 * Narrower than SDK type — only includes content types this server produces.
 *
 * Note: Not directly assignable to CallToolResult due to:
 * - Our `resource` type has optional `text`/`blob`; SDK requires one (discriminated union)
 * - SDK adds `annotations`, `_meta`, and `resource_link` which we don't produce
 * At runtime, all our responses satisfy the protocol. Type gap is cosmetic.
 */
export interface ToolResponse {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "audio"; data: string; mimeType: string }
    | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } }
  >;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Media type for read_media_file responses
 */
export type MediaType = "image" | "audio";

// ============================================================================
// BASIC RESPONSE HELPERS
// ============================================================================

/**
 * Create a successful text response
 * @param text - The text content to return
 * @param structured - Optional additional structured content fields
 * @returns Formatted MCP tool response with structuredContent
 */
export function textResponse(
  text: string, 
  structured?: Record<string, unknown>
): ToolResponse {
  return {
    content: [{ type: "text", text }],
    structuredContent: { content: text, ...structured },
  };
}

/**
 * Create a JSON response (stringified with formatting)
 * @param data - The data object to serialize as JSON (fields spread directly into structuredContent)
 * @param indent - Number of spaces for indentation (default: 2)
 * @returns Formatted MCP tool response with structuredContent
 */
export function jsonResponse(data: Record<string, unknown>, indent = 2): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, indent) }],
    structuredContent: data,
  };
}

// ============================================================================
// OPERATION RESPONSE HELPERS
// ============================================================================

/**
 * Create a path operation success response
 * @param action - The action performed
 * @param path - The path involved
 * @returns Formatted MCP tool response with path in structuredContent
 */
export function pathSuccessResponse(action: string, path: string): ToolResponse {
  const message = `Successfully ${action} ${path}`;
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { success: true, path, message },
  };
}

/**
 * Create a dual-path operation success response (for move, copy, etc.)
 * @param action - The action performed (e.g., "moved", "copied")
 * @param source - Source path
 * @param destination - Destination path
 * @returns Formatted MCP tool response
 */
export function dualPathSuccessResponse(
  action: string, 
  source: string, 
  destination: string
): ToolResponse {
  const message = `Successfully ${action} ${source} to ${destination}`;
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { success: true, source, destination, message },
  };
}

// ============================================================================
// SEARCH RESPONSE HELPERS
// ============================================================================

/**
 * Create a search results response
 * @param matches - Array of matching paths or strings
 * @param emptyMessage - Message to show if no matches
 * @returns Formatted MCP tool response with matches and count
 */
export function searchResultsResponse(
  matches: string[], 
  emptyMessage = "No matches found"
): ToolResponse {
  return {
    content: [{ type: "text", text: matches.length > 0 ? matches.join("\n") : emptyMessage }],
    structuredContent: { matches, count: matches.length },
  };
}

/**
 * Create a structured search results response (for content search)
 * @param results - Array of search result objects
 * @returns Formatted MCP tool response with results
 */
export function structuredSearchResponse<T>(results: T[]): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    structuredContent: { results, count: results.length },
  };
}

// ============================================================================
// MEDIA RESPONSE HELPERS
// ============================================================================

/**
 * Create a media response (image, audio, or blob)
 * @param data - Base64 encoded data
 * @param mimeType - MIME type of the media
 * @param mediaType - Type of media (image, audio, blob)
 * @returns Formatted MCP tool response with structuredContent
 */
export function mediaResponse(
  data: string,
  mimeType: string,
  mediaType: MediaType
): ToolResponse {
  return {
    content: [{ type: mediaType, data, mimeType } as ToolResponse["content"][0]],
    structuredContent: { mediaType, mimeType, size: data.length },
  };
}

/**
 * MIME type mappings for common media files
 */
export const MEDIA_MIME_TYPES: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".weba": "audio/webm",
};

/**
 * Get media type from MIME type
 */
export function getMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith("audio/")) return "audio";
  return "image"; // Default to image for all binary content
}

// ============================================================================
// WATCHER RESPONSE HELPERS
// ============================================================================

/**
 * Create a watcher started response
 * @param watcherId - The watcher ID
 * @param path - The watched path
 * @returns Formatted MCP tool response
 */
export function watcherStartedResponse(watcherId: string, path: string): ToolResponse {
  const message = `Started watching ${path}\nWatcher ID: ${watcherId}`;
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { watcherId, path, message },
  };
}

/**
 * Create a watcher stopped response
 * @param watcherId - The watcher ID that was stopped
 * @returns Formatted MCP tool response
 */
export function watcherStoppedResponse(watcherId: string): ToolResponse {
  const message = `Successfully stopped watching (ID: ${watcherId})`;
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { success: true, watcherId, message },
  };
}

// ============================================================================

/**
 * Create an edit_file-compatible error response.
 * Returns structuredContent matching edit_file's outputSchema (diff, identical, applied, warnings)
 * so the MCP SDK doesn't reject the response on outputSchema validation.
 */
export function editErrorResponse(message: string): ToolResponse {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { diff: "", identical: true, applied: false, warnings: [message] },
    isError: true,
  };
}

/**
 * Create an edit_file-compatible diff response.
 * Returns structuredContent matching edit_file's outputSchema.
 */
export function editDiffResponse(diff: string, applied: boolean, ambiguous: boolean): ToolResponse {
  const identical = diff.trim() === "";
  const warnings: string[] = [];
  if (ambiguous) {
    warnings.push("Ambiguous match: oldText appears multiple times. Only the first occurrence was replaced. Provide more context to disambiguate.");
  }
  let text: string;
  if (identical) {
    text = "Files are identical";
  } else if (ambiguous) {
    text = diff + "\n\u26A0 Ambiguous match: oldText appears multiple times. Only the first occurrence was replaced.";
  } else {
    text = diff;
  }
  return {
    content: [{ type: "text", text }],
    structuredContent: { diff, identical, applied, warnings },
  };
}

// DIFF RESPONSE HELPERS
// ============================================================================

/**
 * Create a diff response
 * @param diff - The diff content
 * @param applied - Whether changes were applied (for edit operations)
 * @returns Formatted MCP tool response
 */
export function diffResponse(diff: string, applied?: boolean): ToolResponse {
  const identical = diff.trim() === "";
  return {
    content: [{ type: "text", text: identical ? "Files are identical" : diff }],
    structuredContent: { 
      diff, 
      identical,
      ...(applied !== undefined && { applied }),
    },
  };
}

// ============================================================================
// INFO/METADATA RESPONSE HELPERS
// ============================================================================

/**
 * Create a key-value info response
 * @param info - Object with info key-value pairs
 * @returns Formatted MCP tool response
 */
export function infoResponse(info: Record<string, unknown>): ToolResponse {
  const text = Object.entries(info)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return {
    content: [{ type: "text", text }],
    structuredContent: info,
  };
}

/**
 * Create a message-only response (for informational messages)
 * @param message - The message to display
 * @param extra - Optional additional structured content
 * @returns Formatted MCP tool response
 */
export function messageResponse(
  message: string, 
  extra?: Record<string, unknown>
): ToolResponse {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { message, ...extra },
  };
}

/**
 * Create an error response with isError flag
 * @param message - The error message to display
 * @param extra - Optional additional structured content fields
 * @returns Formatted MCP tool response with isError: true
 */
export function errorResponse(
  message: string,
  extra?: Record<string, unknown>
): ToolResponse {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { success: false, message, ...extra },
    isError: true,
  };
}

// ============================================================================
// SEMANTIC OPERATION RESPONSE HELPERS
// ============================================================================

// Re-export semantic responses (SSOT preserved — moved to semantic-responses.ts)
export {
  semanticOperationResponse,
  symbolsOverviewResponse,
  symbolMatchesResponse,
  referencesResponse,
  renameResultResponse,
} from "./semantic-responses.js";
export type { SemanticOperationResult, SymbolMatch, SymbolReferenceInfo } from "./semantic-responses.js";
