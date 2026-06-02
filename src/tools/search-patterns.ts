/**
 * Get Project Patterns Tool
 *
 * Get code patterns from AGENTS.md file.
 */

import { z } from "zod";
import type { ToolContext } from "./types.js";
import { validatePath } from "../validation/path-validation.js";
import { getProjectPatterns, findProjectPattern, getPatternsByType } from "../operations/project-patterns.js";
import { PathSchema, ProjectPatternSchema } from "../schemas/index.js";

export function registerGetProjectPatternsTool({ factories }: ToolContext): void {
  const { readOnly } = factories;

  readOnly(
    "get_project_patterns",
    {
      title: "Get Project Patterns",
      description: "Get code patterns from a AGENTS.md file. Returns pattern definitions organized by type (code, structure, config).",
      inputSchema: {
        path: PathSchema,
        type: z.enum(["code", "structure", "config"]).optional().describe("Pattern type filter"),
        patternName: z.string().optional().describe("Specific pattern name to find"),
      },
      outputSchema: {
        patterns: z.array(ProjectPatternSchema).describe("Code patterns"),
        claudeMdPath: z.string().optional().describe("Path to AGENTS.md file"),
      },
    },
    async ({ path: projectPath, type, patternName }) => {
      const validPath = await validatePath(projectPath);

      if (patternName) {
        const pattern = await findProjectPattern(validPath, patternName);
        const text = pattern
          ? `Pattern "${patternName}":\n${pattern.pattern}`
          : `Pattern "${patternName}" not found in project`;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { patterns: pattern ? [pattern] : [], claudeMdPath: undefined },
        };
      }

      if (type) {
        const patterns = await getPatternsByType(validPath, type);
        const formatted =
          patterns.length > 0 ? patterns.map((p) => `${p.name}:\n${p.pattern}`).join("\n\n") : `No ${type} patterns found`;
        return {
          content: [{ type: "text" as const, text: formatted }],
          structuredContent: { patterns, claudeMdPath: undefined },
        };
      }

      const result = await getProjectPatterns(validPath);
      if (!result) {
        return {
          content: [{ type: "text" as const, text: "No patterns found in AGENTS.md" }],
          structuredContent: { patterns: [], claudeMdPath: undefined },
        };
      }
      const formatted =
        result.patterns.length > 0
          ? result.patterns.map((p) => `[${p.type}] ${p.name}:\n${p.pattern}`).join("\n\n---\n\n")
          : "No patterns found in AGENTS.md";

      return {
        content: [{ type: "text" as const, text: formatted }],
        structuredContent: { patterns: result.patterns, claudeMdPath: result.claudeMdPath },
      };
    }
  );
}
