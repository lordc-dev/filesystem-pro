/**
 * Undo & Refactor Module
 *
 * Provides:
 * - UndoManager: In-memory undo stack for filesystem operations
 * - StalenessGuard: Reject edits when files changed externally since last read
 * - Composite Refactors: extract_method, inline_variable, introduce_parameter
 */

export { undoManager, getUndoManager, setUndoManager, resetUndoManager, type UndoEntry, type UndoResult } from "./undo-manager.js";
export { stalenessGuard, type FileFingerprint, type StalenessCheckResult } from "./staleness-guard.js";
export {
  extractMethod,
  inlineVariable,
  introduceParameter,
  type RefactorResult,
} from "./composite-refactors.js";