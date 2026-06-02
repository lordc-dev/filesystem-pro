/**
 * Safe Execute Utility
 *
 * Wraps async operations with consistent error handling.
 * Eliminates repetitive try/catch boilerplate across the codebase.
 */

import { logger } from "./logger.js";

export function normalizeError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export function normalizeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface SafeResult<T> {
  data: T | null;
  error: Error | null;
}

export async function safeExecute<T>(
  fn: () => Promise<T>,
  context?: string,
): Promise<SafeResult<T>> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (context) {
      logger.warn(`[${context}] ${error.message}`);
    }
    return { data: null, error };
  }
}

export async function safeExecuteOr<T>(
  fn: () => Promise<T>,
  fallback: T,
  context?: string,
): Promise<T> {
  const result = await safeExecute(fn, context);
  return result.data ?? fallback;
}