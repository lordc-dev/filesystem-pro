/**
 * Vitest Test Setup
 *
 * Common utilities and setup for all tests.
 * This file is automatically loaded before each test file.
 */

import { vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fsSync from "node:fs";

// ============================================================================
// Grammar Resolution (must run before any tree-sitter imports)
// ============================================================================
const projectRoot = path.resolve(__dirname, "..");
const distGrammars = path.join(projectRoot, "dist", "grammars");
try {
  fsSync.accessSync(distGrammars);
  process.env.GRAMMARS_DIR = distGrammars;
} catch {
  const nodeModulesGrammars = path.join(
    projectRoot, "node_modules", "tree-sitter-wasms", "out",
  );
  try {
    fsSync.accessSync(nodeModulesGrammars);
    process.env.GRAMMARS_DIR = nodeModulesGrammars;
  } catch {
    // grammar dir not found, tree-sitter tests will fail
  }
}

// ============================================================================
// Global Test Setup
// ============================================================================

/**
 * Reset all mocks before each test
 */
beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Cleanup after each test
 */
afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock file system structure for testing
 */
export function createMockFs(files: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(files));
}

/**
 * Create a mock SyntaxNode for testing classifiers
 */
export function createMockSyntaxNode(overrides: Partial<MockSyntaxNode> = {}): MockSyntaxNode {
  return {
    type: "identifier",
    text: "test",
    startIndex: 0,
    endIndex: 4,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 4 },
    parent: null,
    children: [],
    firstChild: null,
    lastChild: null,
    childForFieldName: () => null,
    equals: (other) => other === mockNode,
    ...overrides,
  };
}

/**
 * Mock SyntaxNode interface for testing
 */
interface MockSyntaxNode {
  type: string;
  text: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  parent: MockSyntaxNode | null;
  children: MockSyntaxNode[];
  firstChild: MockSyntaxNode | null;
  lastChild: MockSyntaxNode | null;
  childForFieldName: (name: string) => MockSyntaxNode | null;
  equals: (other: MockSyntaxNode) => boolean;
}

// Reference for equals() function
const mockNode: MockSyntaxNode = null as unknown as MockSyntaxNode;

/**
 * Helper to wait for async operations
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a temporary test directory path
 */
export function getTempTestDir(): string {
  return `/tmp/filesystem-mcp-tests-${Date.now()}`;
}

/**
 * Mock ripgrep output for testing search functions
 */
export function createMockRipgrepOutput(results: Array<{ file: string; line: number; content: string }>): string {
  return results
    .map(
      (r) =>
        JSON.stringify({
          type: "match",
          data: {
            path: { text: r.file },
            lines: { text: r.content },
            line_number: r.line,
            submatches: [],
          },
        })
    )
    .join("\n");
}
