/**
 * Code Editor Types
 *
 * Shared interfaces for code editing operations.
 */

export interface ReplaceOptions {
  dryRun?: boolean;
  preserveWhitespace?: boolean;
  adjustIndentation?: boolean;
}

export interface InsertOptions {
  dryRun?: boolean;
  blankLineBefore?: boolean;
  blankLineAfter?: boolean;
  matchIndentation?: boolean;
}

export interface RenameOptions {
  dryRun?: boolean;
  searchPath?: string;
  filePatterns?: string[];
  excludePatterns?: readonly string[];
}

export interface SymbolRenameResult {
  oldName: string;
  newName: string;
  modifiedFiles: string[];
  totalReferences: number;
  diffs: Map<string, string>;
  errors: string[];
}