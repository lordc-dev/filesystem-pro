/**
 * Shared Types for Tool Registration
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolFactories as ToolFactoriesType } from "../utils/tool-factory.js";

export type ToolFactories = ToolFactoriesType;

/**
 * Context passed to tool registration functions
 */
export interface ToolContext {
  server: McpServer;
  factories: ToolFactories;
}

/**
 * Tool registration function type
 */
export type ToolRegistrar = (context: ToolContext) => void;
