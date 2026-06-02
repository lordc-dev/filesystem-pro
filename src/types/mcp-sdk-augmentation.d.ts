/**
 * Type Augmentation for MCP SDK Internal API
 *
 * This module provides type safety for accessing internal MCP SDK properties
 * that are not part of the public API. These are used for:
 * - Roots Protocol: listRoots, setNotificationHandler
 *
 * Note: These are internal APIs and may change between SDK versions.
 * Monitor SDK releases when upgrading @modelcontextprotocol/sdk.
 */

import { ZodSchema } from "zod";

/**
 * Internal Server interface for MCP SDK
 * Provides access to low-level server methods not exposed in public types
 */
export interface McpInternalServer {
  /**
   * Request the list of roots from the client
   * Part of the MCP Roots Protocol
   */
  listRoots(): Promise<{ roots: Array<{ uri: string; name?: string }> } | null>;

  /**
   * Set a notification handler for a specific schema
   * Used to listen for roots list changes and other notifications
   */
  setNotificationHandler<T>(schema: ZodSchema<T>, handler: (params: T) => Promise<void>): void;
}

/**
 * Extended McpServer interface with internal server access
 */
export interface McpServerWithInternals {
  /**
   * @internal Internal server instance for advanced operations
   * This is not part of the public API and may change between SDK versions
   */
  readonly server?: McpInternalServer;
}

declare module "@modelcontextprotocol/sdk/server/mcp.js" {
  interface McpServer extends McpServerWithInternals {}
}
