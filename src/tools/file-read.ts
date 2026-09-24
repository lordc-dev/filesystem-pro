/**
 * File Read Tools
 *
 * Tools for reading files (text, media, multiple).
 * Records staleness fingerprints for edit protection.
 */

import fs from "fs/promises";
import path from "path";
import { z } from "zod";

import type { ToolContext } from "./types.js";
import { validatePath } from "../validation/path-validation.js";
import { readValidatedFile } from "../file-operations/read-utils.js";
import {
  textResponse,
  mediaResponse,
  MEDIA_MIME_TYPES,
  getMediaType,
} from "../utils/response-helpers.js";
import { PathSchema } from "../schemas/index.js";
import { FILE_ENCODING } from "../constants.js";
import { stalenessGuard } from "../undo/staleness-guard.js";
import { getLanguageFromPath } from "../semantic/index.js";
import { getFileStats, getFileSummary } from "../semantic/file-stats.js";

function jsonValueType(v: unknown): string {
  if (Array.isArray(v)) return `array(${v.length})`;
  if (v === null) return "null";
  if (typeof v === "object") return `object(${Object.keys(v).length} keys)`;
  return typeof v;
}

function summarizeJson(filePath: string, content: string): string {
  const lines = [`File: ${filePath}`, "Language: json", ""];
  try {
    const data = JSON.parse(content) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      lines.push(`Top-level keys: ${Object.keys(data).length}`);
      for (const [k, v] of Object.entries(data)) {
        lines.push(`  ${k}: ${jsonValueType(v)}`);
      }
    } else {
      lines.push(`Type: ${jsonValueType(data)}`);
    }
  } catch (error: unknown) {
    lines.push(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return lines.join("\n");
}

export function registerFileReadTools({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "read_text_file",
    {
      title: "Read Text File",
      description:
        "Read file contents as UTF-8 text. Use 'head' for first N lines, 'tail' for last N lines, 'offset' to start at a 1-based line number (combined with 'head' as window size). Always treats file as text regardless of extension. " +
        "Do NOT use this to understand a file's structure — use get_file_summary or get_symbols_overview instead (saves context).",
      inputSchema: {
        path: PathSchema,
        head: z.number().optional().describe("Return only the first N lines (with offset: window size)"),
        tail: z.number().optional().describe("Return only the last N lines"),
        offset: z.number().optional().describe("Start reading at this 1-based line number (combine with head for window size, default 100)"),
        summary: z.boolean().optional().default(false).describe("If true, return a structural summary (lines, symbols, imports) instead of full content"),
      },
      outputSchema: {
        content: z.string().describe("File content as text"),
      },
    },
    async ({ path: filePath, head, tail, offset, summary }) => {
      const { validPath, content } = await readValidatedFile(filePath, { head, tail, offset });
      // Record staleness fingerprint under validated path (must match write-side key)
      await stalenessGuard.recordFromPath(validPath);

      if (summary) {
        const language = getLanguageFromPath(validPath);
        if (!language) {
          if (path.extname(validPath).toLowerCase() === ".json") {
            return textResponse(summarizeJson(validPath, content));
          }
          return textResponse(content);
        }
        const stats = await getFileStats(validPath, content, language);
        return textResponse(getFileSummary(stats));
      }

      return textResponse(content);
    }
  );

  readOnly(
    "read_media_file",
    {
      title: "Read Media File",
      description:
        "Read an image or audio file and return base64-encoded data with MIME type. Supports: png, jpg, gif, webp, bmp, svg, mp3, wav, ogg, flac, aac, m4a.",
      inputSchema: {
        path: PathSchema,
      },
      outputSchema: {
        mediaType: z.enum(["image", "audio", "blob"]).describe("Media category"),
        mimeType: z.string().describe("MIME type of the file"),
        size: z.number().describe("Size of the base64-encoded data in bytes"),
      },
    },
    async ({ path: filePath }) => {
      const validPath = await validatePath(filePath);
      // Record staleness fingerprint for later edit protection
      await stalenessGuard.recordFromPath(validPath);
      const extension = path.extname(validPath).toLowerCase();
      const mimeType = MEDIA_MIME_TYPES[extension] || "application/octet-stream";
      const data = await fs.readFile(validPath);
      const base64Data = data.toString("base64");
      const mediaType = getMediaType(mimeType);

      return mediaResponse(base64Data, mimeType, mediaType);
    }
  );

  readOnly(
    "read_multiple_files",
    {
      title: "Read Multiple Files",
      description: "Read multiple files simultaneously. More efficient than reading one by one.",
      inputSchema: {
        paths: z.array(z.string()).describe("Array of file paths to read"),
      },
      outputSchema: {
        files: z
          .array(
            z.object({
              path: z.string(),
              content: z.string().optional(),
              error: z.string().optional(),
            })
          )
          .describe("Array of file contents or errors"),
      },
    },
    async ({ paths }) => {
      const results = await Promise.all(
        paths.map(async (filePath) => {
          try {
            const validPath = await validatePath(filePath);
            const content = await fs.readFile(validPath, FILE_ENCODING);
            return { path: filePath, content, validPath };
          } catch (error: unknown) {
            return { path: filePath, error: error instanceof Error ? error.message : String(error) };
          }
        })
      );

      // Batch staleness recording (parallel stats)
      const validPaths = results
        .filter((r): r is typeof r & { validPath: string } => 'validPath' in r)
        .map(r => r.validPath);
      await stalenessGuard.recordBatch(validPaths);

      const textContent = results
        .map((r) => (r.error ? `${r.path}: Error - ${r.error}` : `${r.path}:\n${r.content}\n`))
        .join("\n---\n");

      return {
        content: [{ type: "text" as const, text: textContent }],
        structuredContent: { files: results.map(({ path, content, error }) => ({ path, content, error })) },
      };
    }
  );
}