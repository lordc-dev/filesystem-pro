/**
 * File Reading Utilities (SSOT)
 * 
 * Unified implementation for file reading operations with path validation.
 */

import fs from "fs/promises";
import { validatePath } from "../validation/path-validation.js";
import { normalizeLineEndings } from "../utils/text-utils.js";
import { type SupportedLanguage, getLanguageFromPath } from "../semantic/index.js";
import { FILE_ENCODING } from "../constants.js";
import { TreeSitterError } from "../errors/index.js";
import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { Writable } from "stream";
import { getConfig } from "../config/index.js";
import { isSemanticAvailable } from "../semantic/index.js";

// ============================================================================
// TYPES
// ============================================================================

type ReadDirection = "head" | "tail";
const CHUNK_SIZE = 16384;
const FS_TIMEOUT_MS = process.env.MCP_FS_TIMEOUT_MS ? parseInt(process.env.MCP_FS_TIMEOUT_MS, 10) : 60_000;
const STREAM_THRESHOLD = 1_048_576;

// Error message for file size limit
const FILE_TOO_LARGE = (path: string, size: number, limit: number) =>
  `File too large: ${path} (${(size / 1024 / 1024).toFixed(1)}MB exceeds ${(limit / 1024 / 1024).toFixed(0)}MB limit). Use head/tail parameters to read portions of the file.`;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Helper to execute file operations with automatic handle cleanup
 */
async function withFileHandle<T>(
  filePath: string,
  operation: (handle: fs.FileHandle) => Promise<T>,
): Promise<T> {
  const fileHandle = await fs.open(filePath, "r");
  try {
    return await operation(fileHandle);
  } finally {
    await fileHandle.close();
  }
}

/**
 * Read first N lines from file handle
 */
async function readFromStart(
  handle: fs.FileHandle,
  numLines: number,
): Promise<string> {
  const lines: string[] = [];
  let buffer = "";
  let bytesRead = 0;
  const chunk = Buffer.alloc(CHUNK_SIZE);

  while (lines.length < numLines) {
    const result = await handle.read(chunk, 0, chunk.length, bytesRead);
    if (result.bytesRead === 0) break;
    bytesRead += result.bytesRead;
    buffer += chunk.slice(0, result.bytesRead).toString(FILE_ENCODING);

    const newLineIndex = buffer.lastIndexOf("\n");
    if (newLineIndex !== -1) {
      const completeLines = buffer.slice(0, newLineIndex).split("\n");
      buffer = buffer.slice(newLineIndex + 1);
      for (const line of completeLines) {
        lines.push(line);
        if (lines.length >= numLines) break;
      }
    }
  }

  if (buffer.length > 0 && lines.length < numLines) {
    lines.push(buffer);
  }

  return lines.join("\n");
}

/**
 * Read last N lines from file handle
 */
async function readFromEnd(
  handle: fs.FileHandle,
  numLines: number,
  fileSize: number,
): Promise<string> {
  if (fileSize === 0) return "";

  const lines: string[] = [];
  let position = fileSize;
  const chunk = Buffer.alloc(CHUNK_SIZE);
  let remainingText = "";

  while (position > 0 && lines.length < numLines) {
    const size = Math.min(CHUNK_SIZE, position);
    position -= size;

    const { bytesRead } = await handle.read(chunk, 0, size, position);
    if (!bytesRead) break;

    const chunkText =
      chunk.slice(0, bytesRead).toString(FILE_ENCODING) + remainingText;
    const chunkLines = normalizeLineEndings(chunkText).split("\n");

    if (position > 0) {
      remainingText = chunkLines[0];
      chunkLines.shift();
    }

    for (
      let i = chunkLines.length - 1;
      i >= 0 && lines.length < numLines;
      i--
    ) {
      lines.unshift(chunkLines[i]);
    }
  }

  return lines.join("\n");
}

/**
 * Read N lines from file - unified implementation (SSOT)
 * @param filePath - Path to the file (must be already validated)
 * @param numLines - Number of lines to read
 * @param direction - 'head' for first N lines, 'tail' for last N lines
 */
async function readFileLines(
  filePath: string,
  numLines: number,
  direction: ReadDirection,
): Promise<string> {
  return withFileHandle(filePath, async (handle) => {
    if (direction === "head") {
      return readFromStart(handle, numLines);
    } else {
      const stats = await fs.stat(filePath);
      return readFromEnd(handle, numLines, stats.size);
    }
  });
}

// ============================================================================
// STREAMING READ (for large files)
// ============================================================================

async function streamFullFile(filePath: string): Promise<string> {
  const chunks: Buffer[] = [];

  const collector = new Writable({
    write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void) {
      chunks.push(chunk);
      callback();
    },
  });

  await pipeline(
    createReadStream(filePath, { encoding: FILE_ENCODING }),
    collector
  );

  return chunks.join("");
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Unified file reading with path validation (SSOT)
 * 
 * This is the single source of truth for validated file reading operations.
 * Both readTextContent() and withFileContent() use this internally.
 * 
 * @param filePath - Path to the file to read
 * @param options - Optional head/tail line limits
 * @returns Object with validated path and content
 */
export async function readValidatedFile(
  filePath: string,
  options?: { head?: number; tail?: number }
): Promise<{ validPath: string; content: string }> {
  if (options?.head !== undefined && options.head < 1) {
    throw new Error(`Invalid \u201Chead\u201D parameter: ${options.head}. Must be a positive integer.`);
  }
  if (options?.tail !== undefined && options.tail < 1) {
    throw new Error(`Invalid \u201Ctail\u201D parameter: ${options.tail}. Must be a positive integer.`);
  }
  
  const validPath = await validatePath(filePath);
  
  if (options?.head && options?.tail) {
    const headContent = await readFileLines(validPath, options.head, "head");
    const tailContent = await readFileLines(validPath, options.tail, "tail");
    return {
      validPath,
      content: `${headContent}\n... (content omitted) ...\n${tailContent}`,
    };
  }
  
  if (options?.tail) {
    return { validPath, content: await readFileLines(validPath, options.tail, "tail") };
  }
  
  if (options?.head) {
    return { validPath, content: await readFileLines(validPath, options.head, "head") };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => { ac.abort(); }, FS_TIMEOUT_MS);

  try {
    const stat = await fs.stat(validPath);
    const maxSize = getConfig().fileRead.maxFileSizeBytes;
    if (stat.size > maxSize) {
      throw new Error(FILE_TOO_LARGE(validPath, stat.size, maxSize));
    }

    if (stat.size > STREAM_THRESHOLD) {
      return { validPath, content: await streamFullFile(validPath) };
    }
    
    return { validPath, content: await fs.readFile(validPath, { encoding: FILE_ENCODING, signal: ac.signal }) };
  } catch (err: unknown) {
    if (ac.signal.aborted) {
      throw new Error(`File read timed out after ${FS_TIMEOUT_MS}ms: ${validPath}. Set MCP_FS_TIMEOUT_MS to increase.`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read text file content with optional head/tail (SSOT)
 * 
 * Convenience wrapper around readValidatedFile() that returns only the content.
 * Used by read_text_file tool.
 */
export async function readTextContent(
  filePath: string,
  head?: number,
  tail?: number
): Promise<string> {
  const { content } = await readValidatedFile(filePath, { head, tail });
  return content;
}

/**
 * Helper for semantic tools - validates path, reads content, gets language (SSOT)
 * 
 * Uses readValidatedFile() internally for path validation and file reading.
 * Reduces boilerplate in semantic tool handlers by handling common operations.
 * 
 * @param filePath - Path to the file to process
 * @param handler - Async handler that receives validated path, content, and language
 * @returns Result from the handler
 * @throws Error if file type is unsupported
 */
export async function withFileContent<T>(
  filePath: string,
  handler: (validPath: string, content: string, language: SupportedLanguage) => Promise<T>
): Promise<T> {
  const { validPath, content } = await readValidatedFile(filePath);
  const language = getLanguageFromPath(validPath);
  
  if (!language) {
    throw new TreeSitterError("unsupported file type", { context: { validPath } });
  }

  if (!isSemanticAvailable()) {
    throw new TreeSitterError("not available — semantic module failed to initialize. Semantic tools cannot process this file.", { context: { validPath } });
  }
  
  return handler(validPath, content, language);
}
