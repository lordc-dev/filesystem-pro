/**
 * Ripgrep Arguments Builder
 * 
 * Fluent API for constructing ripgrep command arguments.
 */

/**
 * Builder pattern for ripgrep command arguments
 * Provides fluent API to reduce repetitive args construction
 */
export class RipgrepArgsBuilder {
  private args: string[] = [];

  /** Add --files flag for file listing mode */
  files(): this {
    this.args.push("--files");
    return this;
  }

  /** Add JSON output flags */
  json(): this {
    this.args.push("--json", "--no-heading", "--line-number");
    return this;
  }

  /** Add --no-messages to suppress error messages */
  noMessages(): this {
    this.args.push("--no-messages");
    return this;
  }

  /** Add --hidden to include hidden files */
  hidden(): this {
    this.args.push("--hidden");
    return this;
  }

  /** Add --ignore-case for case-insensitive search */
  ignoreCase(enabled = true): this {
    if (enabled) this.args.push("--ignore-case");
    return this;
  }

  /** Add context lines around matches */
  context(lines: number): this {
    if (lines > 0) this.args.push("-C", lines.toString());
    return this;
  }

  /** Add --max-depth for depth limiting */
  maxDepth(depth: number): this {
    if (depth !== undefined) this.args.push("--max-depth", depth.toString());
    return this;
  }

  /** Add --max-count to limit results per file */
  maxCount(count: number): this {
    if (count > 0) this.args.push("--max-count", count.toString());
    return this;
  }

  /** Add --count for counting matches only */
  count(): this {
    this.args.push("--count");
    return this;
  }

  /** Add --follow for following symlinks */
  follow(enabled = true): this {
    if (enabled) this.args.push("--follow");
    return this;
  }

  /** Add --type for file type filtering */
  fileType(type: string): this {
    if (type) this.args.push("--type", type);
    return this;
  }

  /** Add exclude patterns as negative globs */
  exclude(patterns: readonly string[] = []): this {
    patterns.forEach(p => this.args.push("--glob", `!${p}`));
    return this;
  }

  /** Add include glob patterns */
  glob(patterns: string | string[]): this {
    const arr = Array.isArray(patterns) ? patterns : [patterns];
    arr.forEach(p => this.args.push("--glob", p));
    return this;
  }

  /** Add search pattern */
  pattern(p: string): this {
    this.args.push(p);
    return this;
  }

  /** Add search path */
  path(p: string): this {
    this.args.push(p);
    return this;
  }

  /** Build and return the args array */
  build(): string[] {
    return [...this.args];
  }
}

/** Factory function for creating a new builder */
export function rgArgs(): RipgrepArgsBuilder {
  return new RipgrepArgsBuilder();
}

/**
 * Parse ripgrep line output to array (SSOT)
 * Trims, splits by newline, and filters empty lines.
 * @param output - Raw ripgrep stdout output
 * @returns Array of non-empty lines
 */
export function parseRipgrepLines(output: string): string[] {
  return output.trim().split("\n").filter(Boolean);
}
