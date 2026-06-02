/**
 * Test Helpers
 * 
 * Provides utilities for testing semantic analysis, path validation,
 * and performance benchmarking.
 */
import path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { expect } from "vitest";

// ============================================================================
// PATH VALIDATION HELPERS
// ============================================================================

/**
 * Check if a path is within any of the allowed directories.
 * This is a standalone function for testing purposes.
 * 
 * @param targetPath - Path to check
 * @param allowedDirs - Array of allowed directory paths
 * @returns true if path is within an allowed directory
 */
export function isPathWithinAllowedDirectories(
  targetPath: string,
  allowedDirs: string[]
): boolean {
  // Handle invalid inputs
  if (!targetPath || typeof targetPath !== "string") {
    return false;
  }
  if (!allowedDirs || !Array.isArray(allowedDirs) || allowedDirs.length === 0) {
    return false;
  }

  // Check for null bytes (security)
  if (targetPath.includes("\x00")) {
    return false;
  }

  // Normalize the target path
  const normalizedTarget = path.normalize(path.resolve(targetPath));

  for (const allowedDir of allowedDirs) {
    // Skip invalid entries
    if (!allowedDir || typeof allowedDir !== "string") {
      continue;
    }

    // Check for null bytes in allowed dir
    if (allowedDir.includes("\x00")) {
      continue;
    }

    // Normalize the allowed directory
    const normalizedAllowed = path.normalize(path.resolve(allowedDir));

    // Check if target is the allowed directory itself
    if (normalizedTarget === normalizedAllowed) {
      return true;
    }

    // Check if target is inside the allowed directory
    // Use a proper check that the target starts with the allowed dir + separator
    // to prevent prefix attacks (e.g., /allowed vs /allowed2)
    const relative = path.relative(normalizedAllowed, normalizedTarget);
    
    // Path is inside allowed if:
    // 1. relative path exists (not empty)
    // 2. relative path doesn't start with '..' followed by separator (going up)
    // 3. relative path is not absolute (different root)
    // 4. relative path is not just '..' (going up one level exactly)
    if (relative && 
        !path.isAbsolute(relative) &&
        relative !== ".." &&
        !relative.startsWith(".." + path.sep)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// PERFORMANCE MEASUREMENT HELPERS
// ============================================================================

/**
 * Result of a performance measurement
 */
export interface PerformanceResult<T> {
  result: T;
  elapsed: number;
  name: string;
}

/**
 * Measure the execution time of an async function and assert it's within threshold.
 * 
 * @param name - Name for logging/identification
 * @param fn - Async function to measure
 * @param maxMs - Maximum allowed milliseconds
 * @returns Result with timing information
 * 
 * @example
 * const { result, elapsed } = await measurePerformance(
 *   "extract-symbols",
 *   () => extractSymbols(content, "typescript"),
 *   500
 * );
 */
export async function measurePerformance<T>(
  name: string,
  fn: () => Promise<T>,
  maxMs: number
): Promise<PerformanceResult<T>> {
  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;
  
  // Log for debugging (only shows in verbose mode)
  console.log(`[PERF] ${name}: ${elapsed.toFixed(2)}ms (max: ${maxMs}ms)`);
  
  // Assert within threshold
  expect(
    elapsed,
    `${name} took ${elapsed.toFixed(2)}ms, expected < ${maxMs}ms`
  ).toBeLessThan(maxMs);
  
  return { result, elapsed, name };
}

/**
 * Measure sync function execution time
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  maxMs: number
): PerformanceResult<T> {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  
  console.log(`[PERF] ${name}: ${elapsed.toFixed(2)}ms (max: ${maxMs}ms)`);
  
  expect(
    elapsed,
    `${name} took ${elapsed.toFixed(2)}ms, expected < ${maxMs}ms`
  ).toBeLessThan(maxMs);
  
  return { result, elapsed, name };
}

/**
 * Run a function multiple times and return average timing
 */
export async function benchmark<T>(
  name: string,
  fn: () => Promise<T>,
  iterations: number = 10
): Promise<{ avgMs: number; minMs: number; maxMs: number; result: T }> {
  const times: number[] = [];
  let lastResult: T | undefined;
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    lastResult = await fn();
    times.push(performance.now() - start);
  }
  
  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  
  console.log(`[BENCH] ${name}: avg=${avgMs.toFixed(2)}ms, min=${minMs.toFixed(2)}ms, max=${maxMs.toFixed(2)}ms`);
  
  return { avgMs, minMs, maxMs, result: lastResult! };
}

// ============================================================================
// FILE SYSTEM HELPERS
// ============================================================================

/**
 * Create a temporary test directory
 * 
 * @param prefix - Prefix for the directory name
 * @returns Absolute path to the temp directory
 */
export async function createTempTestDir(prefix: string = "test-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `fs-mcp-${prefix}`));
}

/**
 * Clean up a temporary test directory
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Write multiple files to a directory
 * 
 * @param baseDir - Base directory path
 * @param files - Map of relative paths to content
 */
export async function writeTestFiles(
  baseDir: string,
  files: Map<string, string> | Record<string, string>
): Promise<void> {
  const entries = files instanceof Map ? files.entries() : Object.entries(files);
  
  for (const [relativePath, content] of entries) {
    const fullPath = path.join(baseDir, relativePath);
    const dir = path.dirname(fullPath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }
}

/**
 * Read all TypeScript files from a directory
 */
export async function readTypeScriptFiles(
  dirPath: string
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  
  async function walkDir(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        const content = await fs.readFile(fullPath, "utf-8");
        const relativePath = path.relative(dirPath, fullPath);
        files.set(relativePath, content);
      }
    }
  }
  
  await walkDir(dirPath);
  return files;
}

// ============================================================================
// MOCK HELPERS
// ============================================================================

/**
 * Create a mock SyntaxNode for testing classifiers
 */
export interface MockSyntaxNode {
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

/**
 * Create a mock SyntaxNode for testing
 */
export function createMockSyntaxNode(
  overrides: Partial<MockSyntaxNode> = {}
): MockSyntaxNode {
  const mockNode: MockSyntaxNode = {
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
  return mockNode;
}

/**
 * Mock ripgrep output for testing search functions
 */
export function createMockRipgrepOutput(
  results: Array<{ file: string; line: number; content: string }>
): string {
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

// ============================================================================
// TEST PROJECT GENERATORS
// ============================================================================

/**
 * Create a multi-module test project in a temp directory
 * 
 * @param fileCount - Number of interconnected files to create
 * @returns Path to the created project directory
 */
export async function createMultiModuleProject(
  fileCount: number = 10
): Promise<string> {
  const projectDir = await createTempTestDir("multi-module-");
  
  // Create shared utilities
  await writeTestFiles(projectDir, {
    "utils/helpers.ts": `
export function formatId(id: string): string {
  return \`ID-\${id}\`;
}

export function validateEmail(email: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2);
}

export const CONSTANTS = {
  MAX_ITEMS: 100,
  DEFAULT_TIMEOUT: 5000,
};

// Unused export for testing dead code detection
export function unusedHelper(): void {
  console.log("never called");
}
`,
    "types/index.ts": `
export interface Entity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User extends Entity {
  email: string;
  name: string;
}

export type Status = "active" | "inactive" | "pending";

// Unused type for testing
export type UnusedType = { unused: boolean };
`,
    "services/base.ts": `
import { Entity } from "../types";
import { generateId } from "../utils/helpers";

export abstract class BaseService<T extends Entity> {
  protected items: Map<string, T> = new Map();
  
  abstract create(data: Omit<T, "id" | "createdAt" | "updatedAt">): T;
  
  get(id: string): T | undefined {
    return this.items.get(id);
  }
  
  list(): T[] {
    return Array.from(this.items.values());
  }
  
  delete(id: string): boolean {
    return this.items.delete(id);
  }
  
  protected generateEntity<D>(data: D): D & Entity {
    return {
      ...data,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
`,
  });
  
  // Generate service files
  for (let i = 0; i < Math.min(fileCount - 3, 10); i++) {
    const serviceName = `Service${i}`;
    await writeTestFiles(projectDir, {
      [`services/${serviceName.toLowerCase()}.ts`]: `
import { BaseService } from "./base";
import { Entity } from "../types";
import { formatId, CONSTANTS } from "../utils/helpers";

export interface ${serviceName}Entity extends Entity {
  name: string;
  value: number;
}

export class ${serviceName} extends BaseService<${serviceName}Entity> {
  create(data: Omit<${serviceName}Entity, "id" | "createdAt" | "updatedAt">): ${serviceName}Entity {
    const entity = this.generateEntity(data);
    this.items.set(entity.id, entity);
    return entity;
  }
  
  findByName(name: string): ${serviceName}Entity | undefined {
    return this.list().find(e => e.name === name);
  }
  
  getFormattedId(id: string): string {
    return formatId(id);
  }
  
  getMaxItems(): number {
    return CONSTANTS.MAX_ITEMS;
  }
}
`,
    });
  }
  
  // Create main entry point
  const serviceImports: string[] = [];
  const serviceNames: string[] = [];
  
  for (let i = 0; i < Math.min(fileCount - 3, 10); i++) {
    const serviceName = `Service${i}`;
    serviceImports.push(`import { ${serviceName} } from "./services/${serviceName.toLowerCase()}";`);
    serviceNames.push(serviceName);
  }
  
  await writeTestFiles(projectDir, {
    "index.ts": `
${serviceImports.join("\n")}
export * from "./types";
export * from "./utils/helpers";

export {
  ${serviceNames.join(",\n  ")},
};

export function createServices() {
  return {
    ${serviceNames.map(n => `${n.toLowerCase()}: new ${n}()`).join(",\n    ")},
  };
}
`,
  });
  
  return projectDir;
}

/**
 * Generate a large TypeScript file in a temp directory
 * 
 * @param lineCount - Target number of lines
 * @returns Object with path and content
 */
export async function generateLargeTestFile(
  lineCount: number = 500
): Promise<{ path: string; content: string }> {
  const lines: string[] = [];
  
  // Header
  lines.push("/**");
  lines.push(" * Generated TypeScript file for testing");
  lines.push(` * Target line count: ${lineCount}`);
  lines.push(" */");
  lines.push("");
  
  // Calculate component counts
  const classCount = Math.max(5, Math.floor(lineCount / 50));
  const functionCount = Math.max(10, Math.floor(lineCount / 20));
  
  // Generate interfaces
  for (let i = 0; i < Math.min(5, classCount); i++) {
    lines.push(`export interface Entity${i} {`);
    lines.push(`  id: string;`);
    lines.push(`  name: string;`);
    lines.push(`  value${i}: number;`);
    lines.push(`}`);
    lines.push("");
  }
  
  // Generate classes
  for (let i = 0; i < classCount && lines.length < lineCount - 50; i++) {
    lines.push(`export class Service${i} {`);
    lines.push(`  private data: Map<string, unknown> = new Map();`);
    lines.push("");
    lines.push(`  constructor(private readonly id: string) {}`);
    lines.push("");
    
    for (let j = 0; j < 3; j++) {
      lines.push(`  method${j}(param: string): string {`);
      lines.push(`    const result = this.id + param;`);
      lines.push(`    this.data.set("${j}", result);`);
      lines.push(`    return result;`);
      lines.push(`  }`);
      lines.push("");
    }
    
    lines.push(`  async asyncMethod(): Promise<void> {`);
    lines.push(`    await new Promise(r => setTimeout(r, 100));`);
    lines.push(`  }`);
    lines.push("}");
    lines.push("");
  }
  
  // Generate functions
  for (let i = 0; i < functionCount && lines.length < lineCount - 10; i++) {
    lines.push(`export function utility${i}(input: string): string {`);
    lines.push(`  const processed = input.trim().toLowerCase();`);
    lines.push(`  return processed + "_${i}";`);
    lines.push(`}`);
    lines.push("");
  }
  
  // Pad to reach target
  while (lines.length < lineCount) {
    lines.push(`// Padding line ${lines.length}`);
  }
  
  const content = lines.slice(0, lineCount).join("\n");
  const tempDir = await createTempTestDir("large-file-");
  const filePath = path.join(tempDir, "large.ts");
  
  await fs.writeFile(filePath, content, "utf-8");
  
  return { path: filePath, content };
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  expect(value, message).toBeDefined();
  expect(value, message).not.toBeNull();
}

/**
 * Assert that an array has at least one element
 */
export function assertNonEmpty<T>(
  array: T[],
  message?: string
): asserts array is [T, ...T[]] {
  expect(array.length, message).toBeGreaterThan(0);
}

/**
 * Assert that a string contains a substring
 */
export function assertContains(
  str: string,
  substring: string,
  message?: string
): void {
  expect(str, message).toContain(substring);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Wait for a specified number of milliseconds
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get a unique temp directory path
 */
export function getTempTestDir(): string {
  return path.join(os.tmpdir(), `fs-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

/**
 * Create a file system structure for testing
 */
export function createMockFs(files: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(files));
}
