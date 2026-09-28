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
  /** Called before each file is written — lets the caller record undo
   * snapshots of PRE-write content (audit finding #1). */
  beforeWrite?: (filePath: string) => Promise<void>;
}

export interface SymbolRenameResult {
  oldName: string;
  newName: string;
  modifiedFiles: string[];
  totalReferences: number;
  diffs: Map<string, string>;
  errors: string[];
}