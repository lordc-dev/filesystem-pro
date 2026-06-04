/**
 * API Versioning
 *
 * Provides semantic version information for MCP tools.
 * Version is derived from package.json and exposed via:
 * - Tool annotations _meta.apiVersion
 * - Server stats tool response
 * - /health HTTP endpoint
 */

const PACKAGE_VERSION = __SERVER_VERSION__ as string;

export const API_VERSION_STRING = PACKAGE_VERSION;
