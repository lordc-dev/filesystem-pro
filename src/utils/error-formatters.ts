/**
 * Shared Error Formatting Utilities (SSOT)
 * 
 * Provides consistent error message formatting across the codebase.
 * All error formatting should use these utilities to ensure consistency.
 */

/**
 * Format a validation error with context
 * @param type - Type of validation that failed (e.g., "regex", "glob", "path")
 * @param value - The value that failed validation
 * @param errors - List of validation errors
 * @param suggestions - Optional suggestions for fixing the errors
 * @returns Formatted validation error message
 */
export function formatValidationError(
  type: string,
  value: string,
  errors: string[],
  suggestions?: string[]
): string {
  const lines: string[] = [];
  
  lines.push(`Invalid ${type}: "${value}"`);
  lines.push('');
  
  if (errors.length > 0) {
    lines.push('Issues found:');
    errors.forEach(err => lines.push(`  - ${err}`));
    lines.push('');
  }
  
  if (suggestions?.length) {
    lines.push('Suggestions:');
    suggestions.forEach(sug => lines.push(`  ✓ ${sug}`));
  }
  
  return lines.join('\n');
}

