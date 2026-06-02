/**
 * Code Sample Generators for Testing
 * 
 * Provides utilities to generate realistic code samples for testing
 * semantic analysis, symbol extraction, and code review functionality.
 */

// ============================================================================
// STATIC CODE SAMPLES
// ============================================================================

/**
 * Simple TypeScript class with methods
 */
export const simpleClass = `
export class Calculator {
  private value: number = 0;

  add(x: number): this {
    this.value += x;
    return this;
  }

  subtract(x: number): this {
    this.value -= x;
    return this;
  }

  multiply(x: number): this {
    this.value *= x;
    return this;
  }

  divide(x: number): this {
    if (x === 0) throw new Error("Division by zero");
    this.value /= x;
    return this;
  }

  getResult(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}
`;

/**
 * TypeScript with nested classes and methods
 */
export const nestedClass = `
export class Outer {
  private data: string;

  constructor(data: string) {
    this.data = data;
  }

  process(): string {
    const helper = (s: string): string => {
      const inner = (x: string): string => x.toUpperCase();
      return inner(s);
    };
    return helper(this.data);
  }

  static Inner = class {
    value: number;

    constructor(v: number) {
      this.value = v;
    }

    compute(): number {
      return this.value * 2;
    }

    static Deeper = class {
      id: string;

      constructor(id: string) {
        this.id = id;
      }

      describe(): string {
        return \`ID: \${this.id}\`;
      }
    };
  };
}
`;

/**
 * TypeScript with various function signatures
 */
export const functionVariants = `
// Regular function
export function regularFunction(x: number): number {
  return x * 2;
}

// Arrow function
export const arrowFunction = (x: number): number => x * 3;

// Async function
export async function asyncFunction(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

// Generator function
export function* generatorFunction(max: number): Generator<number> {
  for (let i = 0; i < max; i++) {
    yield i;
  }
}

// Async generator
export async function* asyncGenerator(urls: string[]): AsyncGenerator<string> {
  for (const url of urls) {
    const response = await fetch(url);
    yield await response.text();
  }
}

// Function with rest parameters
export function withRest(first: string, ...rest: string[]): string {
  return [first, ...rest].join(", ");
}

// Function with default parameters
export function withDefaults(a: number, b: number = 10, c: number = 20): number {
  return a + b + c;
}

// Generic function
export function identity<T>(value: T): T {
  return value;
}

// Overloaded function
export function overloaded(x: string): string;
export function overloaded(x: number): number;
export function overloaded(x: string | number): string | number {
  return x;
}
`;

/**
 * TypeScript interfaces and types
 */
export const interfacesAndTypes = `
// Simple interface
export interface User {
  id: string;
  name: string;
  email: string;
}

// Interface with methods
export interface Repository<T> {
  find(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Omit<T, "id">): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

// Extended interface
export interface AdminUser extends User {
  permissions: string[];
  lastLogin: Date;
}

// Type alias
export type UserId = string;

// Union type
export type Status = "pending" | "active" | "inactive";

// Intersection type
export type UserWithStatus = User & { status: Status };

// Mapped type
export type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

// Conditional type
export type NonNullable<T> = T extends null | undefined ? never : T;
`;

/**
 * Python code sample
 */
export const pythonSample = `
"""
Python module for testing semantic analysis
"""

from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import asyncio


@dataclass
class User:
    """User data class"""
    id: str
    name: str
    email: str


class UserService:
    """Service for managing users"""
    
    def __init__(self):
        self._users: Dict[str, User] = {}
    
    def create_user(self, name: str, email: str) -> User:
        """Create a new user"""
        user_id = str(len(self._users) + 1)
        user = User(id=user_id, name=name, email=email)
        self._users[user_id] = user
        return user
    
    def get_user(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        return self._users.get(user_id)
    
    def list_users(self) -> List[User]:
        """List all users"""
        return list(self._users.values())
    
    async def async_process(self, data: Any) -> Any:
        """Async processing example"""
        await asyncio.sleep(0.1)
        return data


def helper_function(x: int) -> int:
    """Helper function"""
    return x * 2


def unused_function():
    """This function is never called"""
    pass


class UnusedClass:
    """This class is never used"""
    pass
`;

/**
 * Code with unused imports for testing
 */
export const unusedImports = `
import { useState, useEffect, useCallback, useMemo } from "react";
import { format, parse, addDays } from "date-fns";
import _ from "lodash";
import axios from "axios";

// Only useState and format are actually used
export function Component() {
  const [value, setValue] = useState(0);
  
  return format(new Date(), "yyyy-MM-dd");
}
`;

/**
 * Code with cross-references for testing
 */
export const crossReferences = {
  "utils.ts": `
export function helper() {
  return 42;
}

export function unused() {
  return 0;
}

export const CONSTANT = "value";
`,
  "service.ts": `
import { helper, CONSTANT } from "./utils";

export class Service {
  getValue(): number {
    return helper();
  }
  
  getConstant(): string {
    return CONSTANT;
  }
}
`,
  "main.ts": `
import { Service } from "./service";
import { helper } from "./utils";

const service = new Service();
console.log(service.getValue());
console.log(helper());
`,
};

// ============================================================================
// CODE GENERATORS
// ============================================================================

/**
 * Generate a TypeScript file with specified number of lines
 */
export function generateLargeTypeScriptFile(lineCount: number): string {
  const lines: string[] = [];
  
  // Header
  lines.push("/**");
  lines.push(" * Generated TypeScript file for testing");
  lines.push(` * Target line count: ${lineCount}`);
  lines.push(" */");
  lines.push("");
  lines.push('import { EventEmitter } from "events";');
  lines.push("");
  
  // Calculate how many classes/functions we need
  const classCount = Math.floor(lineCount / 50);
  const functionCount = Math.floor(lineCount / 20);
  
  // Generate interfaces
  lines.push("// Interfaces");
  for (let i = 0; i < Math.min(5, classCount); i++) {
    lines.push(`export interface Entity${i} {`);
    lines.push(`  id: string;`);
    lines.push(`  name: string;`);
    lines.push(`  value${i}: number;`);
    lines.push(`}`);
    lines.push("");
  }
  
  // Generate classes
  for (let i = 0; i < classCount; i++) {
    lines.push(`export class Service${i} {`);
    lines.push(`  private data: Map<string, unknown> = new Map();`);
    lines.push("");
    lines.push(`  constructor(private readonly id: string) {}`);
    lines.push("");
    
    // Add methods
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
  for (let i = 0; i < functionCount; i++) {
    lines.push(`export function utility${i}(input: string): string {`);
    lines.push(`  const processed = input.trim().toLowerCase();`);
    lines.push(`  return processed + "_${i}";`);
    lines.push(`}`);
    lines.push("");
  }
  
  // Pad to reach target line count
  while (lines.length < lineCount) {
    lines.push(`// Padding line ${lines.length}`);
  }
  
  return lines.slice(0, lineCount).join("\n");
}

/**
 * Generate a multi-module project with interconnected files
 */
export function generateMultiModuleProject(
  fileCount: number
): Map<string, string> {
  const files = new Map<string, string>();
  
  // Create shared utilities
  files.set(
    "utils/helpers.ts",
    `
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
`
  );
  
  // Create types
  files.set(
    "types/index.ts",
    `
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
`
  );
  
  // Create base service
  files.set(
    "services/base.ts",
    `
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
  
  protected generateEntity<D>(data: D): D & { id: string; createdAt: Date; updatedAt: Date } {
    return {
      ...data,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
`
  );
  
  // Generate service files
  for (let i = 0; i < Math.min(fileCount - 3, 10); i++) {
    const serviceName = `Service${i}`;
    files.set(
      `services/${serviceName.toLowerCase()}.ts`,
      `
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
`
    );
  }
  
  // Create main entry point
  const serviceImports = [];
  const serviceExports = [];
  for (let i = 0; i < Math.min(fileCount - 3, 10); i++) {
    const serviceName = `Service${i}`;
    serviceImports.push(
      `import { ${serviceName} } from "./services/${serviceName.toLowerCase()}";`
    );
    serviceExports.push(`  ${serviceName},`);
  }
  
  files.set(
    "index.ts",
    `
${serviceImports.join("\n")}
export * from "./types";
export * from "./utils/helpers";

export {
${serviceExports.join("\n")}
};

export function createServices() {
  return {
${serviceExports.map((s) => s.replace(",", ": new " + s.trim().replace(",", "(),"))).join("\n")}
  };
}
`
  );
  
  return files;
}

/**
 * Generate code with specific patterns for testing detection
 */
export function generateCodeWithPattern(
  pattern: "unused-imports" | "unused-exports" | "deep-nesting" | "long-function"
): string {
  switch (pattern) {
    case "unused-imports":
      return unusedImports;
      
    case "unused-exports":
      return `
export function usedFunction() {
  return 42;
}

export function unusedFunction1() {
  return 1;
}

export function unusedFunction2() {
  return 2;
}

export class UnusedClass {
  method() {}
}

// Only usedFunction is imported elsewhere
`;
      
    case "deep-nesting":
      return `
export function deeplyNested() {
  return () => {
    return () => {
      return () => {
        return () => {
          return () => {
            return "deeply nested";
          };
        };
      };
    };
  };
}

export class Outer {
  static Middle = class {
    static Inner = class {
      static Deepest = class {
        getValue() {
          return 42;
        }
      };
    };
  };
}
`;
      
    case "long-function":
      const lines = ["export function longFunction(input: string): string {"];
      for (let i = 0; i < 100; i++) {
        lines.push(`  const step${i} = input + "_${i}";`);
      }
      lines.push("  return step99;");
      lines.push("}");
      return lines.join("\n");
      
    default:
      return "";
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const samples = {
  simpleClass,
  nestedClass,
  functionVariants,
  interfacesAndTypes,
  pythonSample,
  unusedImports,
  crossReferences,
};
