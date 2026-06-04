/**
 * Tool Registration Factory - SSOT for MCP tool registration patterns
 *
 * Provides factory functions to reduce boilerplate when registering
 * MCP tools with common annotation patterns.
 *
 * @example
 * ```typescript
 * const { readOnly, destructive, idempotent } = setupToolFactories(server);
 *
 * // Register a read-only tool with less boilerplate
 * readOnly("read_file", {
 *   title: "Read File",
 *   description: "Read a file",
 *   inputSchema: { path: z.string() },
 *   outputSchema: { content: z.string() },
 * }, async ({ path }) => readFile(path));
 * ```
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { logger, runWithRequestId } from "./logger.js";
import { rateLimiter } from "./rate-limiter.js";
import { incrementCounter, observeHistogram } from "./metrics.js";
import { errorResponse } from "./response-helpers.js";
import crypto from "crypto";

/**
 * Infer operation type from tool name for metrics labeling.
 * Maps tool name prefixes to operation categories.
 */
function inferOperationType(toolName: string): string {
  if (toolName.startsWith('semantic_') || toolName.startsWith('analysis_')) return 'semantic';
  if (toolName.startsWith('search_') || toolName.startsWith('search-')) return 'search';
  if (toolName.startsWith('directory_') || toolName.startsWith('directory-')) return 'directory';
  if (toolName.startsWith('file_') || toolName.startsWith('file-')) return 'file';
  if (toolName.startsWith('undo_') || toolName.startsWith('undo-')) return 'undo';
  if (toolName.startsWith('read_') || toolName.startsWith('read-')) return 'read';
  if (toolName.startsWith('write_') || toolName.startsWith('write-')) return 'write';
  if (toolName.startsWith('edit_') || toolName.startsWith('edit-')) return 'edit';
  if (toolName.startsWith('get_')) return 'query';
  if (toolName.startsWith('find_')) return 'search';
  return 'other';
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool annotations for MCP tools
 */
export interface ToolAnnotations {
  /** Hint that the tool only reads data and doesn't modify state */
  readOnlyHint?: boolean;
  /** Hint that the tool performs destructive/irreversible operations */
  destructiveHint?: boolean;
  /** Hint that calling the tool multiple times with same args has same effect */
  idempotentHint?: boolean;
  /** Hint that the tool may take a long time to complete */
  longRunningHint?: boolean;
}

/**
 * Tool configuration without handler
 */
export interface ToolConfig<
  TInput extends Record<string, z.ZodTypeAny>,
  TOutput extends Record<string, z.ZodTypeAny>
> {
  /** Human-readable title for the tool */
  title: string;
  /** Description of what the tool does */
  description: string;
  /** Zod schema for input parameters */
  inputSchema: TInput;
  /** Zod schema for output (structured content) */
  outputSchema: TOutput;
  /** Optional annotations (will be merged with factory defaults) */
  annotations?: ToolAnnotations;
}

/**
 * Content types supported by MCP tools
 */
export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

/**
 * Tool handler function type
 */
export type ToolHandler<TInput> = (
  args: TInput
) => Promise<{
  content: Array<ToolContent>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

/**
 * Factory function type for creating tools
 */
export type ToolFactory = <
  TInput extends Record<string, z.ZodTypeAny>,
  TOutput extends Record<string, z.ZodTypeAny>
>(
  name: string,
  config: ToolConfig<TInput, TOutput>,
  handler: ToolHandler<z.infer<z.ZodObject<TInput>>>
) => void;

// ============================================================================
// WRAPPER LOGIC (extracted for type safety)
// ============================================================================

/**
 * Create a metrics + validation wrapper around a tool handler.
 * Extracted from the factory to avoid generic instantiation issues.
 */
function createWrappedHandler(
  name: string,
  config: { outputSchema: Record<string, z.ZodTypeAny> },
  handler: (args: unknown) => Promise<{ content: Array<ToolContent>; structuredContent?: Record<string, unknown>; isError?: boolean }>
): (args: unknown) => Promise<{ content: Array<ToolContent>; structuredContent?: Record<string, unknown>; isError?: boolean }> {
  const opType = inferOperationType(name);
  const declaredKeys = Object.keys(config.outputSchema);

  return async (args: unknown) => {
    const requestId = `tool-${name}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    return runWithRequestId(requestId, async () => {
    const rateResult = rateLimiter.check(name);
    if (!rateResult.allowed) {
      incrementCounter("rate_limited", { tool: name, scope: "tool" });
      return errorResponse(`Rate limit exceeded for tool ${name}. Retry after ${rateResult.retryAfterMs}ms.`);
    }

    const startTime = performance.now();
    incrementCounter("tool_invocations", { tool: name, status: "total", operation_type: opType });
    let result: { content: Array<ToolContent>; structuredContent?: Record<string, unknown>; isError?: boolean };
    try {
      result = await handler(args);
    } catch (err: unknown) {
      const durationMs = performance.now() - startTime;
      observeHistogram("tool_duration_ms", durationMs, { tool: name, status: "error", operation_type: opType });
      incrementCounter("tool_errors", { tool: name, operation_type: opType });
      incrementCounter("tool_invocations", { tool: name, status: "error", operation_type: opType });
      throw err;
    }
    const durationMs = performance.now() - startTime;
    observeHistogram("tool_duration_ms", durationMs, { tool: name, status: result.isError ? "error" : "ok", operation_type: opType });
    if (result.isError) {
      incrementCounter("tool_errors", { tool: name, operation_type: opType });
      incrementCounter("tool_invocations", { tool: name, status: "error", operation_type: opType });
    } else {
      incrementCounter("tool_successes", { tool: name, operation_type: opType });
      incrementCounter("tool_invocations", { tool: name, status: "ok", operation_type: opType });
    }

    if (
      result &&
      typeof result === "object" &&
      "structuredContent" in result &&
      result.structuredContent &&
      declaredKeys.length > 0
    ) {
      const sc = result.structuredContent;
      const actualKeys = Object.keys(sc);
      const extraKeys = actualKeys.filter((k) => !declaredKeys.includes(k));
      const missingKeys = declaredKeys.filter((k) => !actualKeys.includes(k));

      if (extraKeys.length > 0) {
        logger.error(
          `[outputSchema] Tool "${name}" returned structuredContent with extra keys not in outputSchema: ${extraKeys.join(", ")}. ` +
          `Declared: [${declaredKeys.join(", ")}]. Actual: [${actualKeys.join(", ")}]. ` +
          `Removing extra keys from structuredContent.`
        );
        for (const key of extraKeys) {
          delete (sc as Record<string, unknown>)[key];
        }
      }

      if (missingKeys.length > 0) {
        logger.warn(
          `[outputSchema] Tool "${name}" structuredContent is missing keys declared in outputSchema: ${missingKeys.join(", ")}. ` +
          `Declared: [${declaredKeys.join(", ")}]. Actual: [${actualKeys.join(", ")}]. ` +
          `Filling missing keys with null.`
        );
        for (const key of missingKeys) {
          (sc as Record<string, unknown>)[key] = null;
        }
      }
    }
    return result;
    });
  };
}

// ============================================================================
// FACTORY IMPLEMENTATION
// ============================================================================

/**
 * Create a tool factory with default annotations.
 *
 * Uses a single generic instantiation that preserves full type inference
 * at call sites. The handler receives properly typed arguments via
 * z.infer<z.ZodObject<TInput>>, and the factory enforces ToolConfig
 * constraints at compile time.
 */
function createToolFactory(
  server: McpServer,
  defaultAnnotations: ToolAnnotations,
  _isDestructive = false,
): ToolFactory {
  return (<
    TInput extends Record<string, z.ZodTypeAny>,
    TOutput extends Record<string, z.ZodTypeAny>
  >(
    name: string,
    config: ToolConfig<TInput, TOutput>,
    handler: ToolHandler<z.infer<z.ZodObject<TInput>>>
  ): void => {
    const wrappedHandler = createWrappedHandler(
      name,
      { outputSchema: config.outputSchema as Record<string, z.ZodTypeAny> },
      handler as (args: unknown) => Promise<{ content: Array<ToolContent>; structuredContent?: Record<string, unknown>; isError?: boolean }>
    );

    server.registerTool(
      name,
      {
        title: config.title,
        description: config.description,
        inputSchema: config.inputSchema,
        outputSchema: config.outputSchema,
        annotations: {
          ...defaultAnnotations,
          ...config.annotations,
        },
      },
      wrappedHandler as Parameters<typeof server.registerTool>[2]);
  }) as ToolFactory;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Tool factories for common patterns
 */
export interface ToolFactories {
  /** Factory for read-only tools (readOnlyHint: true) */
  readOnly: ToolFactory;
  /** Factory for destructive tools (destructiveHint: true) */
  destructive: ToolFactory;
  /** Factory for idempotent write tools (idempotentHint: true) */
  idempotent: ToolFactory;
  /** Factory for tools with no special hints */
  standard: ToolFactory;
}

/**
 * Setup tool factories for an MCP server
 *
 * Creates factory functions for common tool patterns to reduce boilerplate
 * in tool registration.
 *
 * @param server - MCP server instance
 * @returns Object with factory functions for different tool types
 *
 * @example
 * ```typescript
 * const server = new McpServer({ name: "my-server", version: "1.0.0" });
 * const { readOnly, destructive, idempotent } = setupToolFactories(server);
 *
 * // Read-only tool
 * readOnly("list_files", {
 *   title: "List Files",
 *   description: "List directory contents",
 *   inputSchema: { path: z.string() },
 *   outputSchema: { files: z.array(z.string()) },
 * }, async ({ path }) => listFiles(path));
 *
 * // Destructive tool
 * destructive("delete_file", {
 *   title: "Delete File",
 *   description: "Delete a file permanently",
 *   inputSchema: { path: z.string() },
 *   outputSchema: { success: z.boolean() },
 * }, async ({ path }) => deleteFile(path));
 * ```
 */
export function setupToolFactories(server: McpServer): ToolFactories {
  return {
    readOnly: createToolFactory(server, { readOnlyHint: true }),
    destructive: createToolFactory(server, {
      readOnlyHint: false,
      destructiveHint: true
    }),
    idempotent: createToolFactory(server, {
      readOnlyHint: false,
      idempotentHint: true
    }),
    standard: createToolFactory(server, {}),
  };
}

/**
 * Common annotation presets for manual use
 */
export const ANNOTATION_PRESETS = {
  /** Read-only operation */
  READ_ONLY: { readOnlyHint: true } as ToolAnnotations,
  /** Destructive/irreversible operation */
  DESTRUCTIVE: { readOnlyHint: false, destructiveHint: true } as ToolAnnotations,
  /** Idempotent write operation */
  IDEMPOTENT: { readOnlyHint: false, idempotentHint: true } as ToolAnnotations,
  /** Long-running operation */
  LONG_RUNNING: { longRunningHint: true } as ToolAnnotations,
} as const;