import { createTwoFilesPatch } from 'diff';
import fs from 'fs/promises';
import { normalizeLineEndings } from '../utils/text-utils.js';
import { BaseError } from "../errors/index.js";
import { FILE_ENCODING, DEFAULT_DIFF_CONTEXT_LINES } from '../constants.js';

export interface DiffFilesOptions {
  context?: number;
  ignoreWhitespace?: boolean;
  format?: 'unified' | 'side-by-side' | 'inline';
}

export interface UnifiedDiffOptions {
  context?: number;
  originalLabel?: string;
  modifiedLabel?: string;
}

/**
 * Create a unified diff between two strings (SSOT - used by index.ts and diffFiles)
 * This is the single source of truth for unified diff generation.
 */
export function createUnifiedDiff(
  original: string,
  modified: string,
  filepath: string,
  options: UnifiedDiffOptions = {}
): string {
  const {
    context = DEFAULT_DIFF_CONTEXT_LINES,
    originalLabel = 'original',
    modifiedLabel = 'modified'
  } = options;
  
  // Escape special characters in filepath for diff headers (spaces, unicode, etc)
  // Build regex dynamically to avoid no-control-regex lint error
  const CONTROL_OR_WHITESPACE_RE = new RegExp(String.raw`[\s\x00-\x1f\\]`, "g");
  const safeFilepath = filepath.replace(CONTROL_OR_WHITESPACE_RE, (ch) => {
    if (ch === "\\") return "\\\\";
    return `\\0${ch.charCodeAt(0).toString(8).padStart(3, "0")}`;
  });
  
  const normalizedOriginal = normalizeLineEndings(original);
  const normalizedModified = normalizeLineEndings(modified);
  return createTwoFilesPatch(
    safeFilepath, 
    safeFilepath, 
    normalizedOriginal, 
    normalizedModified, 
    originalLabel, 
    modifiedLabel,
    { context }
  );
}

/**
 * Format a side-by-side diff
 */
function formatSideBySideDiff(file1Content: string, file2Content: string, file1Name: string, file2Name: string, maxLineLength = 80): string {
  const lines1 = file1Content.split('\n');
  const lines2 = file2Content.split('\n');
  const maxLines = Math.max(lines1.length, lines2.length);
  
  const output: string[] = [];
  const separator = ' | ';
  const columnWidth = Math.floor((maxLineLength - separator.length) / 2);
  
  // Header
  output.push(`${'='.repeat(maxLineLength)}`);
  output.push(`${file1Name.padEnd(columnWidth)}${separator}${file2Name}`);
  output.push(`${'='.repeat(maxLineLength)}`);
  
  for (let i = 0; i < maxLines; i++) {
    const line1 = (lines1[i] || '').substring(0, columnWidth);
    const line2 = (lines2[i] || '').substring(0, columnWidth);
    
    // Simple comparison - could be enhanced with actual diff algorithm
    const isDifferent = lines1[i] !== lines2[i];
    const marker = isDifferent ? '≠' : ' ';
    
    output.push(
      `${line1.padEnd(columnWidth)}${marker}${separator.substring(1)}${line2}`
    );
  }
  
  output.push(`${'='.repeat(maxLineLength)}`);
  return output.join('\n');
}

/**
 * Format an inline diff with highlighted changes
 */
function formatInlineDiff(file1Content: string, file2Content: string, file1Name: string, file2Name: string): string {
  const lines1 = file1Content.split('\n');
  const lines2 = file2Content.split('\n');
  const output: string[] = [];
  
  output.push(`Comparing ${file1Name} with ${file2Name}`);
  output.push('---');
  
  const maxLines = Math.max(lines1.length, lines2.length);
  
  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i];
    const line2 = lines2[i];
    
    if (line1 === line2) {
      output.push(`  ${i + 1}: ${line1 || ''}`);
    } else if (line1 === undefined) {
      output.push(`+ ${i + 1}: ${line2}`);
    } else if (line2 === undefined) {
      output.push(`- ${i + 1}: ${line1}`);
    } else {
      output.push(`- ${i + 1}: ${line1}`);
      output.push(`+ ${i + 1}: ${line2}`);
    }
  }
  
  return output.join('\n');
}

/**
 * Compare two files and return differences
 */
export async function diffFiles(
  file1Path: string,
  file2Path: string,
  options: DiffFilesOptions = {}
): Promise<string> {
  const {
    context = DEFAULT_DIFF_CONTEXT_LINES,
    ignoreWhitespace = false,
    format = 'unified'
  } = options;
  
  // Read both files
  const [file1Content, file2Content] = await Promise.all([
    fs.readFile(file1Path, FILE_ENCODING),
    fs.readFile(file2Path, FILE_ENCODING)
  ]);
  
  // Normalize line endings
  let content1 = normalizeLineEndings(file1Content);
  let content2 = normalizeLineEndings(file2Content);
  
  // Optionally ignore whitespace
  if (ignoreWhitespace) {
    content1 = content1.split('\n').map(line => line.trim()).join('\n');
    content2 = content2.split('\n').map(line => line.trim()).join('\n');
  }
  
  // Generate diff based on format (using SSOT functions)
  switch (format) {
    case 'unified':
      // Use SSOT createUnifiedDiff instead of direct createTwoFilesPatch call
      return createUnifiedDiff(content1, content2, `${file1Path} → ${file2Path}`, { context });
      
    case 'side-by-side':
      return formatSideBySideDiff(content1, content2, file1Path, file2Path);
      
    case 'inline':
      return formatInlineDiff(content1, content2, file1Path, file2Path);
      
    default:
      throw new BaseError(`Unknown diff format: ${format}`, { context: { format } });
  }
}
