/**
 * Large TypeScript Fixture File
 * 
 * This file contains realistic TypeScript code for testing semantic analysis.
 * It includes diverse symbol types, deep nesting, and common patterns.
 * 
 * @module test-fixtures
 * @version 1.0.0
 */

import { EventEmitter } from "events";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * User roles in the system
 */
export type UserRole = "admin" | "editor" | "viewer" | "guest";

/**
 * Status of an operation
 */
export type OperationStatus = "pending" | "running" | "completed" | "failed";

/**
 * Generic result wrapper
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Base entity interface
 */
export interface Entity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User interface extending Entity
 */
export interface User extends Entity {
  email: string;
  name: string;
  role: UserRole;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration options
 */
export interface ConfigOptions {
  debug: boolean;
  maxRetries: number;
  timeout: number;
  baseUrl: string;
  headers?: Record<string, string>;
}

/**
 * Event handler interface
 */
export interface EventHandler<T = unknown> {
  handle(event: T): Promise<void>;
  canHandle(event: unknown): boolean;
}

/**
 * Repository interface for data access
 */
export interface Repository<T extends Entity> {
  findById(id: string): Promise<T | null>;
  findAll(options?: { limit?: number; offset?: number }): Promise<T[]>;
  create(data: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_CONFIG: ConfigOptions = {
  debug: false,
  maxRetries: 3,
  timeout: 30000,
  baseUrl: "https://api.example.com",
};

export const ERROR_CODES = {
  NOT_FOUND: "E001",
  UNAUTHORIZED: "E002",
  VALIDATION_FAILED: "E003",
  INTERNAL_ERROR: "E004",
  RATE_LIMITED: "E005",
} as const;

const INTERNAL_SECRET = "should-not-be-exported";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique identifier
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000 } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const delay = baseDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Memoize a function
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T
): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format a date to ISO string
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Parse query string
 */
export function parseQueryString(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = query.replace(/^\?/, "").split("&");
  
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || "");
    }
  }
  
  return params;
}

// ============================================================================
// CLASSES
// ============================================================================

/**
 * Base class for all services
 */
export abstract class BaseService {
  protected readonly config: ConfigOptions;
  
  constructor(config: Partial<ConfigOptions> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  protected log(message: string, level: "debug" | "info" | "error" = "info"): void {
    if (this.config.debug || level === "error") {
      console.log(`[${level.toUpperCase()}] ${message}`);
    }
  }
  
  abstract initialize(): Promise<void>;
}

/**
 * HTTP Client for API requests
 */
export class HttpClient extends BaseService {
  private readonly headers: Record<string, string>;
  
  constructor(config: Partial<ConfigOptions> = {}) {
    super(config);
    this.headers = {
      "Content-Type": "application/json",
      ...config.headers,
    };
  }
  
  async initialize(): Promise<void> {
    this.log("HttpClient initialized");
  }
  
  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }
  
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }
  
  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }
  
  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
  
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    
    this.log(`${method} ${url}`, "debug");
    
    // Simulated fetch - in real code would use actual fetch
    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json() as Promise<T>;
  }
}

/**
 * User service for user management
 */
export class UserService extends BaseService {
  private users: Map<string, User> = new Map();
  private readonly httpClient: HttpClient;
  
  constructor(config: Partial<ConfigOptions> = {}) {
    super(config);
    this.httpClient = new HttpClient(config);
  }
  
  async initialize(): Promise<void> {
    await this.httpClient.initialize();
    this.log("UserService initialized");
  }
  
  async createUser(data: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
    const user: User = {
      ...data,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.users.set(user.id, user);
    return user;
  }
  
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }
  
  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }
    
    const updated: User = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };
    
    this.users.set(id, updated);
    return updated;
  }
  
  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }
  
  async listUsers(options?: { role?: UserRole }): Promise<User[]> {
    let users = Array.from(this.users.values());
    
    if (options?.role) {
      users = users.filter((u) => u.role === options.role);
    }
    
    return users;
  }
}

/**
 * Event bus for pub/sub messaging
 */
export class EventBus extends EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  
  registerHandler(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }
  
  unregisterHandler(eventType: string, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }
  
  async publish<T>(eventType: string, event: T): Promise<void> {
    const handlers = this.handlers.get(eventType);
    if (!handlers) return;
    
    const promises: Promise<void>[] = [];
    
    for (const handler of handlers) {
      if (handler.canHandle(event)) {
        promises.push(handler.handle(event));
      }
    }
    
    await Promise.all(promises);
  }
}

/**
 * Cache implementation with TTL
 */
export class Cache<K, V> {
  private readonly store: Map<K, { value: V; expiresAt: number }> = new Map();
  private readonly ttlMs: number;
  
  constructor(ttlMs: number = 60000) {
    this.ttlMs = ttlMs;
  }
  
  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    
    return entry.value;
  }
  
  set(key: K, value: V, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.ttlMs);
    this.store.set(key, { value, expiresAt });
  }
  
  delete(key: K): boolean {
    return this.store.delete(key);
  }
  
  clear(): void {
    this.store.clear();
  }
  
  get size(): number {
    return this.store.size;
  }
  
  // Nested class for cache statistics
  static Statistics = class {
    hits: number = 0;
    misses: number = 0;
    
    recordHit(): void {
      this.hits++;
    }
    
    recordMiss(): void {
      this.misses++;
    }
    
    get hitRate(): number {
      const total = this.hits + this.misses;
      return total === 0 ? 0 : this.hits / total;
    }
  };
}

/**
 * Task queue for async processing
 */
export class TaskQueue<T> {
  private queue: Array<{ task: T; resolve: (value: unknown) => void; reject: (error: Error) => void }> = [];
  private processing = false;
  private readonly concurrency: number;
  private activeCount = 0;
  
  constructor(
    private readonly processor: (task: T) => Promise<unknown>,
    options: { concurrency?: number } = {}
  ) {
    this.concurrency = options.concurrency ?? 1;
  }
  
  async add(task: T): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }
  
  private async processNext(): Promise<void> {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }
    
    const item = this.queue.shift();
    if (!item) return;
    
    this.activeCount++;
    
    try {
      const result = await this.processor(item.task);
      item.resolve(result);
    } catch (error) {
      item.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }
  
  get pending(): number {
    return this.queue.length;
  }
  
  get active(): number {
    return this.activeCount;
  }
}

// ============================================================================
// DEEP NESTING EXAMPLES
// ============================================================================

/**
 * Complex nested structure for testing deep symbol extraction
 */
export class OuterClass {
  private value: number;
  
  constructor(initial: number) {
    this.value = initial;
  }
  
  // Method with nested function
  processWithCallback(callback: (x: number) => number): number {
    const transform = (n: number): number => {
      // Deeply nested arrow function
      const innerTransform = (m: number): number => {
        const veryInner = (k: number): number => k * 2;
        return veryInner(m) + 1;
      };
      return innerTransform(n);
    };
    
    return callback(transform(this.value));
  }
  
  // Nested class
  static InnerClass = class {
    name: string;
    
    constructor(name: string) {
      this.name = name;
    }
    
    greet(): string {
      return `Hello, ${this.name}`;
    }
    
    // Even deeper nesting
    static DeepInnerClass = class {
      id: number;
      
      constructor(id: number) {
        this.id = id;
      }
      
      describe(): string {
        return `DeepInner #${this.id}`;
      }
    };
  };
  
  // Method returning a class
  createFactory(): new (x: number) => { getValue: () => number } {
    const self = this;
    return class {
      private x: number;
      constructor(x: number) {
        this.x = x;
      }
      getValue(): number {
        return this.x + self.value;
      }
    };
  }
}

/**
 * Higher-order function returning nested functions
 */
export function createProcessor(
  config: { multiplier: number }
): (data: number[]) => (filter: (x: number) => boolean) => number[] {
  return (data: number[]) => {
    return (filter: (x: number) => boolean) => {
      return data
        .filter(filter)
        .map((x) => x * config.multiplier);
    };
  };
}

/**
 * Async generator with nested logic
 */
export async function* paginatedFetch<T>(
  fetcher: (page: number) => Promise<{ data: T[]; hasMore: boolean }>
): AsyncGenerator<T[], void, unknown> {
  let page = 0;
  let hasMore = true;
  
  while (hasMore) {
    const result = await fetcher(page);
    yield result.data;
    hasMore = result.hasMore;
    page++;
  }
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Base error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, ERROR_CODES.NOT_FOUND, 404);
    this.name = "NotFoundError";
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields: Record<string, string[]>
  ) {
    super(message, ERROR_CODES.VALIDATION_FAILED, 400);
    this.name = "ValidationError";
  }
}

// ============================================================================
// DECORATORS (for testing decorator extraction)
// ============================================================================

/**
 * Log method calls
 */
export function Log(target: unknown, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
  const original = descriptor.value;
  
  descriptor.value = function (...args: unknown[]) {
    console.log(`Calling ${propertyKey} with`, args);
    const result = original.apply(this, args);
    console.log(`${propertyKey} returned`, result);
    return result;
  };
  
  return descriptor;
}

/**
 * Measure execution time
 */
export function Measure(target: unknown, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
  const original = descriptor.value;
  
  descriptor.value = async function (...args: unknown[]) {
    const start = performance.now();
    const result = await original.apply(this, args);
    const elapsed = performance.now() - start;
    console.log(`${propertyKey} took ${elapsed.toFixed(2)}ms`);
    return result;
  };
  
  return descriptor;
}

// ============================================================================
// MIXED EXPORTS
// ============================================================================

// Re-export with alias
export { generateId as createId };

// Default export
export default class DefaultExportClass {
  static version = "1.0.0";
  
  static getVersion(): string {
    return this.version;
  }
}

// Namespace-like object
export const Utils = {
  formatters: {
    date: formatDate,
    query: parseQueryString,
  },
  validators: {
    email: isValidEmail,
  },
  helpers: {
    sleep,
    retry,
    debounce,
    throttle,
    memoize,
  },
};

// Unused function (for testing dead code detection)
function unusedHelperFunction(): void {
  console.log("This function is never called");
}

// Unused class (for testing dead code detection)
class UnusedClass {
  private value: number = 0;
  
  increment(): void {
    this.value++;
  }
}

// Line count padding to ensure 500+ lines
// These comments serve as realistic documentation
//
// Architecture Notes:
// - BaseService provides common functionality for all services
// - HttpClient handles all HTTP communication
// - UserService manages user CRUD operations
// - EventBus enables decoupled event handling
// - Cache provides TTL-based caching
// - TaskQueue handles async task processing
//
// Usage Examples:
// const userService = new UserService({ debug: true });
// await userService.initialize();
// const user = await userService.createUser({ email: "test@example.com", name: "Test", role: "viewer" });
//
// Performance Considerations:
// - Use memoize for expensive computations
// - Use debounce for user input handlers
// - Use throttle for scroll handlers
// - Configure appropriate cache TTL
//
// Error Handling:
// - All errors should extend AppError
// - Include error codes for client handling
// - Include status codes for HTTP responses
