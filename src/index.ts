#!/usr/bin/env node
/**
 * Filesystem Pro — Enhanced MCP Filesystem Server
 *
 * A security-hardened filesystem server for the Model Context Protocol.
 * Features:
 * - MCP Roots Protocol for filesystem boundaries
 * - Ripgrep for optimized search operations
 * - Tree-sitter for semantic code analysis (19 languages)
 * - Full undo system with staleness guard
 * - Rate limiting, circuit breaker, audit logging
 * - SSOT patterns for consistent responses
 */


import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { createRequire } from "module";
import { logger } from "./utils/logger.js";

// Dynamic version from package.json (SSOT)
const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require("../package.json");

// ============================================================================
// CLI FLAGS (sync — runs before async init)
// ============================================================================

const CLI_FLAGS = {
  "--help": "Show this help and exit",
  "--version": "Print version and exit",
  "--show-config": "Print resolved configuration (from defaults + env + config file) and exit",
} as const;

function parseCliArgs(): { help: boolean; version: boolean; showConfig: boolean } {
  const args = process.argv.slice(2);
  const result = { help: false, version: false, showConfig: false };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--version" || arg === "-v") result.version = true;
    else if (arg === "--show-config") result.showConfig = true;
    else {
      logger.error(`Unknown flag: ${arg}`);
      logger.error(`Run with --help for available flags.`);
      process.exit(1);
    }
  }
  return result;
}

function printHelp(): void {
  const lines = [
    `Filesystem Pro v${SERVER_VERSION}`,
    "",
    "Usage: filesystem-pro [flags]",
    "",
    "Flags:",
    ...Object.entries(CLI_FLAGS).map(([flag, desc]) => `  ${flag.padEnd(18)}${desc}`),
    "",
    "All configuration via environment variables. See docs/CONFIGURATION.md.",
  ];
  for (const line of lines) {
    logger.info(line);
  }
}

function printVersion(): void {
  logger.info(SERVER_VERSION);
}

const cliArgs = parseCliArgs();
if (cliArgs.help) { printHelp(); process.exit(0); }
if (cliArgs.version) { printVersion(); process.exit(0); }


// Internal modules (sync imports first, then async init below)
import { rootsManager } from "./validation/roots-manager.js";
import { isRootsRestrictionEnabled, shouldLogRootsEvents, getConfig, loadConfig } from "./config/index.js";
import { isDebugMode } from "./constants.js";
import { isRipgrepAvailable } from "./search/index.js";
import { watcherManager } from "./file-operations/watch-utils.js";
import { getToolSelector } from "./intelligence/tool-selector.js";
import { setupToolFactories } from "./utils/tool-factory.js";
import { initializeSemanticModule } from "./semantic/index.js";

import { undoManager } from "./undo/undo-manager.js";


// Type augmentation for MCP SDK internal API (removes 'as any' casts)
import "./types/mcp-sdk-augmentation.js";

// Tool registration (modular)
import { registerAllTools } from "./tools/index.js";
import { loadRateLimitsFromEnv } from "./utils/rate-limiter.js";


// ============================================================================
// SERVER SETUP (Using McpServer class - MCP 2025+)
// ============================================================================

const server = new McpServer({
  name: "filesystem-pro",
  version: SERVER_VERSION,
});

// Tool factories for reduced boilerplate (SSOT)
const factories = setupToolFactories(server);

// Register all tools using modular structure
registerAllTools({ server, factories });




// ============================================================================
// SHUTDOWN HANDLERS
// ============================================================================

process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  await watcherManager.removeAllWatchers();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down...");
  await watcherManager.removeAllWatchers();
  process.exit(0);
});

// ============================================================================
// ROOTS PROTOCOL
// ============================================================================

/**
 * Request roots from the client and update the roots manager
 */
async function refreshRoots(): Promise<void> {
  if (!isRootsRestrictionEnabled()) {
    return; // Feature disabled, skip
  }

  try {
    // Access the underlying server to make requests
    // Types provided by ./types/mcp-sdk-augmentation.d.ts
    const underlyingServer = server.server;
    if (!underlyingServer || typeof underlyingServer.listRoots !== "function") {
      if (shouldLogRootsEvents()) {
        logger.info("[Roots] listRoots not available - running in unrestricted mode");
      }
      return;
    }

    const result = await underlyingServer.listRoots();
    if (result && Array.isArray(result.roots)) {
      await rootsManager.setRoots(result.roots);
    } else {
      if (shouldLogRootsEvents()) {
        logger.info("[Roots] No roots returned by client - running in unrestricted mode");
      }
      rootsManager.clearRoots();
    }
  } catch {
    // Client doesn't support roots - that's fine, run unrestricted
    if (shouldLogRootsEvents()) {
      logger.info("[Roots] Client doesn't support roots protocol - running in unrestricted mode");
    }
    rootsManager.clearRoots();
  }
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function runServer() {
  // Load async config first (reads config file if MCP_CONFIG_FILE is set)
  await loadConfig();
  logger.info("[Config] Loaded configuration");

  // --show-config: print resolved config and exit
  if (cliArgs.showConfig) {
    logger.info(JSON.stringify(getConfig(), null, 2));
    process.exit(0);
  }

  // Initialize rate limiter from environment
  loadRateLimitsFromEnv();

  if (!(await isRipgrepAvailable())) {
    logger.warn("Ripgrep not found. Search functions will fail.");
    logger.warn("Install via: brew install ripgrep");
  }

  // Initialize undo manager (with disk persistence if configured)
  try {
    await undoManager.initialize();
    const persistStatus = undoManager.isPersistenceEnabled ? "enabled" : "disabled";
    logger.info(`Undo manager initialized (persistence: ${persistStatus}, stack: ${undoManager.size})`);
  } catch (error: unknown) {
    logger.warn("Could not initialize undo manager:", error);
  }

  // Initialize semantic module (tree-sitter)
  try {
    await initializeSemanticModule();
    logger.info("Semantic code analysis module initialized (tree-sitter)");
  } catch (error: unknown) {
    logger.warn("Could not initialize semantic module:", error);
    logger.warn("Semantic code analysis tools may not work.");
  }



  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`Filesystem Pro v${SERVER_VERSION} running on stdio`);
  logger.info("Using McpServer class with registerTool API (MCP 2025+)");
  logger.info(
    `MCP Roots Protocol: ${isRootsRestrictionEnabled() ? "Enabled" : "Disabled"} (set MCP_ROOTS_RESTRICTION=0 to disable)`
  );

  // Set up roots change notification handler (only if feature enabled)
  if (isRootsRestrictionEnabled()) {
    try {
      // Types provided by ./types/mcp-sdk-augmentation.d.ts
      const underlyingServer = server.server;
      if (
        underlyingServer &&
        typeof underlyingServer.setNotificationHandler === "function"
      ) {
        // Listen for roots list changes using the proper schema
        underlyingServer.setNotificationHandler(
          RootsListChangedNotificationSchema,
          async () => {
            if (shouldLogRootsEvents()) {
              logger.info("[Roots] Received roots list change notification");
            }
            await refreshRoots();
          }
        );
        if (shouldLogRootsEvents()) {
          logger.info("[Roots] Listening for roots list changes");
        }
      }
    } catch (error: unknown) {
      if (shouldLogRootsEvents()) {
        logger.warn("[Roots] Could not set up roots change handler:", error);
      }
    }

    // Request initial roots after a short delay (allow client to initialize)
    setTimeout(async () => {
      await refreshRoots();
    }, 100);
  }

  // Show tool selector status in debug mode
  if (isDebugMode()) {
    const toolSelector = await getToolSelector();
    logger.debug("\n" + toolSelector.generateStatusReport());
  }

  if (!isRootsRestrictionEnabled()) {
    logger.warn(
      "Roots restriction is DISABLED. All filesystem paths are accessible. " +
      "Set MCP_ROOTS_RESTRICTION=1 to re-enable."
    );
  }

  const stalenessConfig = getConfig().stalenessGuard;
  if (!stalenessConfig.enabled) {
    logger.warn(
      "Staleness guard is DISABLED. Files changed externally between read and edit may be silently overwritten. " +
      "Set MCP_STALENESS_GUARD=1 to re-enable."
    );
  }
  // Startup summary
  const startupSummary = {
    version: SERVER_VERSION,
    rootsRestriction: isRootsRestrictionEnabled(),
    stalenessGuard: stalenessConfig.enabled,
    debugMode: isDebugMode(),
    undoStackDepth: undoManager.size,
  };
  logger.info("[Startup] Server initialized", startupSummary);
}

runServer().catch((error) => {
  logger.error("Fatal error", error);
  process.exit(1);
});
