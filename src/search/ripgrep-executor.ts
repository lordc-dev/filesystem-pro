/**
 * Ripgrep Executor
 *
 * Core ripgrep execution functionality.
 * Requires system ripgrep: brew install ripgrep
 */

import { spawn, execFile } from "child_process";
import { promisify } from "util";

import { logger } from "../utils/logger.js";
import { isDebugMode, RG_CANDIDATE_PATHS, RG_TIMEOUT_MS as DEFAULT_RG_TIMEOUT_MS, MAX_CONCURRENT_RG as DEFAULT_MAX_CONCURRENT_RG, MAX_RG_ARGS_BYTES, FILE_ENCODING } from "../constants.js";
import { BaseError } from "../errors/index.js";
import { Semaphore } from "../utils/concurrency.js";

const MAX_CONCURRENT_RG = process.env.MCP_MAX_CONCURRENT_RG ? parseInt(process.env.MCP_MAX_CONCURRENT_RG, 10) : DEFAULT_MAX_CONCURRENT_RG;
const RG_TIMEOUT_MS = process.env.MCP_RG_TIMEOUT_MS ? parseInt(process.env.MCP_RG_TIMEOUT_MS, 10) : DEFAULT_RG_TIMEOUT_MS;
const rgSemaphore = new Semaphore(MAX_CONCURRENT_RG);

const execFileAsync = promisify(execFile);

const CANDIDATE_PATHS = [...RG_CANDIDATE_PATHS];

let cachedRgPath: string | null | undefined = undefined;
let pcre2Supported: boolean | undefined = undefined;

async function getRgPath(): Promise<string | null> {
  if (cachedRgPath !== undefined) return cachedRgPath;

  try {
    const { stdout } = await execFileAsync("which", ["rg"]);
    const resolved = stdout.trim();
    if (resolved) {
      cachedRgPath = resolved;
      if (isDebugMode()) logger.debug(`Using ripgrep: ${resolved}`);
      return resolved;
    }
  } catch {
    // rg not found in PATH
  }

  for (const candidate of CANDIDATE_PATHS) {
    try {
      await execFileAsync(candidate, ["--version"]);
      cachedRgPath = candidate;
      if (isDebugMode()) logger.debug(`Using ripgrep: ${candidate}`);
      return candidate;
    } catch {
      // rg not found at candidate path
    }
  }

  logger.error("Ripgrep not found in PATH or common locations");
  logger.error("Install via: brew install ripgrep / apt install ripgrep");
  cachedRgPath = null;
  return null;
}

// ============================================================================
// RIPGREP AVAILABILITY API
// ============================================================================

/**
 * Custom error for ripgrep not found scenarios
 */
export class RipgrepNotFoundError extends Error {
  constructor() {
    super(
      "System ripgrep is not available.\n" +
      "Install via: brew install ripgrep"
    );
    this.name = "RipgrepNotFoundError";
  }
}

/**
 * Check if ripgrep is available
 */
export async function isRipgrepAvailable(): Promise<boolean> {
  return (await getRgPath()) !== null;
}

/**
 * Check if ripgrep was compiled with PCRE2 support
 */
async function checkPcre2Support(): Promise<boolean> {
  if (pcre2Supported !== undefined) return pcre2Supported;
  const rgPath = await getRgPath();
  if (!rgPath) { pcre2Supported = false; return false; }
  try {
    const result = await execFileAsync(rgPath, ['--pcre2', '--version']);
    pcre2Supported = result.stdout.trim().length > 0;
  } catch {
    pcre2Supported = false;
  }
  return pcre2Supported;
}

/**
 * Ensure ripgrep is available, throw RipgrepNotFoundError if not.
 */
export async function ensureRipgrep(): Promise<string> {
  const rgExecutable = await getRgPath();
  if (!rgExecutable) {
    throw new RipgrepNotFoundError();
  }
  return rgExecutable;
}

/**
 * Detect if pattern requires PCRE2 engine (lookahead, lookbehind, etc.)
 * @internal Used by executeRipgrep and searchContent
 */
export function requiresPCRE2(pattern: string): boolean {
  if (!pattern) return false;

  const pcre2Features = [
    /\(\?[=!<]/, // Lookahead/lookbehind
    /\(\?\w+:/, // Named groups
    /\\[kKgG]/, // Backreferences
    /\(\?\w+\)/, // Modifiers
    /\(\?R\)/, // Recursion
  ];

  return pcre2Features.some((regex) => regex.test(pattern));
}

export async function executeRipgrep(args: string[], pcre2 = false): Promise<string> {
  const rgExecutable = await ensureRipgrep();

  // Security: validate total argument length (CWE-400)
  const totalArgLength = args.reduce((sum, arg) => sum + arg.length + 1, 0);
  if (totalArgLength > MAX_RG_ARGS_BYTES) {
    throw new BaseError(
      `ripgrep argument length (${totalArgLength} bytes) exceeds maximum (${MAX_RG_ARGS_BYTES} bytes). Reduce the number of patterns or exclude patterns.`,
      { context: { totalArgLength, maxArgsBytes: MAX_RG_ARGS_BYTES, argCount: args.length } }
    );
  }

  if (pcre2) {
    const hasPcre2 = await checkPcre2Support();
    if (!hasPcre2) {
      throw new BaseError(
        "ripgrep does not support PCRE2. Remove the pcre2 option or install a ripgrep version compiled with PCRE2 support.",
        { context: { pcre2, args } }
      );
    }
  }

  await rgSemaphore.acquire();

  return new Promise((resolve, reject) => {
    let output = "";
    let errorOutput = "";
    let timedOut = false;

    const finalArgs = pcre2 ? ["--pcre2", ...args] : args;

    if (isDebugMode()) {
      logger.debug(`[ripgrep] ${rgExecutable} ${finalArgs.join(" ")}`);
    }

    const rg = spawn(rgExecutable, finalArgs);

    const timer = setTimeout(() => {
      timedOut = true;
      rg.kill("SIGTERM");
    }, RG_TIMEOUT_MS);

    rg.stdout.on("data", (data) => {
      output += data.toString();
    });

    rg.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    rg.on("close", (code) => {
      clearTimeout(timer);
      rgSemaphore.release();
      if (timedOut) {
        reject(new BaseError(`ripgrep timed out after ${RG_TIMEOUT_MS}ms`, { context: { args, timeout: RG_TIMEOUT_MS } }));
        return;
      }
      if (code === 0 || code === 1) {
        resolve(output);
      } else {
        const codeNum = code ?? -1;
        reject(new BaseError(`ripgrep exited with code ${codeNum}`, { context: { code: codeNum, stderr: errorOutput } }));
      }
    });

    rg.on("error", (err) => {
      clearTimeout(timer);
      rgSemaphore.release();
      reject(new BaseError(`ripgrep spawn failed`, { cause: err }));
    });
  });
}

/**
 * Execute ripgrep with a byte limit. Kills the process when output exceeds maxBytes.
 * Returns truncated output. Useful for large search results.
 */
export async function executeRipgrepWithLimit(
  args: string[],
  maxBytes: number,
  pcre2 = false
): Promise<string> {
  const rgExecutable = await ensureRipgrep();

  if (pcre2) {
    const hasPcre2 = await checkPcre2Support();
    if (!hasPcre2) {
      throw new BaseError(
        "ripgrep does not support PCRE2.",
        { context: { pcre2, args } }
      );
    }
  }

  await rgSemaphore.acquire();

  return new Promise((resolve) => {
    let output = "";
    let killed = false;
    const finalArgs = pcre2 ? ["--pcre2", ...args] : args;
    const rg = spawn(rgExecutable, finalArgs);

    const timer = setTimeout(() => {
      if (!killed) {
        killed = true;
        rg.kill("SIGTERM");
      }
    }, RG_TIMEOUT_MS);

    rg.stdout.on("data", (data: Buffer) => {
      if (!killed) {
        output += data.toString();
        if (Buffer.byteLength(output, FILE_ENCODING) > maxBytes) {
          killed = true;
          rg.kill("SIGTERM");
        }
      }
    });

    rg.stderr.on("data", () => {
      // swallow stderr on limited runs
    });

    rg.on("close", () => {
      clearTimeout(timer);
      rgSemaphore.release();
      resolve(output);
    });

    rg.on("error", () => {
      clearTimeout(timer);
      rgSemaphore.release();
      resolve(output);
    });
  });
}
