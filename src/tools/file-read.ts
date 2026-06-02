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
import { readTextContent } from "../file-operations/read-utils.js";
import {
  textResponse,
  mediaResponse,
  MEDIA_MIME_TYPES,
  getMediaType,
} from "../utils/response-helpers.js";
import { PathSchema } from "../schemas/index.js";
import { FILE_ENCODING } from "../constants.js";
import { stalenessGuard } from "../undo/staleness-guard.js";

export function registerFileReadTools({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "read_text_file",
    {
      title: "Read Text File",
      description:
        "Read file contents as UTF-8 text. Use 'head' for first N lines, 'tail' for last N lines. Always treats file as text regardless of extension.",
      inputSchema: {
        path: PathSchema,
        head: z.number().optional().describe("Return only the first N lines"),
        tail: z.number().optional().describe("Return only the last N lines"),
      },
      outputSchema: {
        content: z.string().describe("File content as text"),
      },
    },
    async ({ path: filePath, head, tail }) => {
      const content = await readTextContent(filePath, head, tail);
      // Record staleness fingerprint for later edit protection
      await stalenessGuard.recordFromPath(filePath);
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