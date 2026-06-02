import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getProjectPatterns, findProjectPattern, getPatternsByType } from "../src/operations/project-patterns.js";
import { createTempTestDir, writeTestFiles, cleanupTempDir } from "./test-helpers.js";
import path from "path";

describe("project-patterns", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await createTempTestDir("patterns-");
    await writeTestFiles(tempDir, {
      "AGENTS.md": `# Project Rules

<patterns>
<pattern name="service-layer" type="code" language="kotlin" tags="arch,backend">
<description>Service layer pattern</description>
<variables>
<var name="ServiceName" description="Name of the service class"/>
</variables>
class ServiceName {
    fun execute() {}
}
</pattern>

<pattern name="repo-structure" type="structure" category="layout">
<description>Repository directory layout</description>
src/
  main/
  test/
</pattern>

<pattern name="env-config" type="config">
<description>Environment configuration pattern</description>
DB_URL=jdbc:postgresql://localhost:5432/db
</pattern>
</patterns>

Standalone pattern outside block:
<pattern name="standalone-pattern" type="code">
standalone content
</pattern>
`,
    });
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("getProjectPatterns", () => {
    it("finds AGENTS.md and returns patterns", async () => {
      const result = await getProjectPatterns(tempDir);
      expect(result).not.toBeNull();
      expect(result!.patterns.length).toBeGreaterThanOrEqual(3);
      expect(result!.projectRoot).toBe(tempDir);
      expect(result!.claudeMdPath).toContain("AGENTS.md");
    });

    it("returns null when no AGENTS.md exists", async () => {
      const emptyDir = await createTempTestDir("empty-");
      try {
        const result = await getProjectPatterns(emptyDir);
        expect(result).toBeNull();
      } finally {
        await cleanupTempDir(emptyDir);
      }
    });

    it("parses pattern attributes correctly", async () => {
      const result = await getProjectPatterns(tempDir);
      const serviceLayer = result!.patterns.find(p => p.name === "service-layer");
      expect(serviceLayer).toBeDefined();
      expect(serviceLayer!.type).toBe("code");
      expect(serviceLayer!.language).toBe("kotlin");
      expect(serviceLayer!.tags).toEqual(["arch", "backend"]);
    });

    it("parses description", async () => {
      const result = await getProjectPatterns(tempDir);
      const serviceLayer = result!.patterns.find(p => p.name === "service-layer");
      expect(serviceLayer!.description).toBe("Service layer pattern");
    });

    it("parses variables", async () => {
      const result = await getProjectPatterns(tempDir);
      const serviceLayer = result!.patterns.find(p => p.name === "service-layer");
      expect(serviceLayer!.variables).toEqual([
        { name: "ServiceName", description: "Name of the service class" },
      ]);
    });

    it("parses category", async () => {
      const result = await getProjectPatterns(tempDir);
      const repoStructure = result!.patterns.find(p => p.name === "repo-structure");
      expect(repoStructure!.category).toBe("layout");
    });

    it("deduplicates patterns by name:type", async () => {
      const result = await getProjectPatterns(tempDir);
      const names = result!.patterns.map(p => `${p.name}:${p.type}`);
      const unique = new Set(names);
      expect(names.length).toBe(unique.size);
    });

    it("finds standalone patterns outside <patterns> block", async () => {
      const result = await getProjectPatterns(tempDir);
      const standalone = result!.patterns.find(p => p.name === "standalone-pattern");
      expect(standalone).toBeDefined();
      expect(standalone!.pattern).toContain("standalone content");
    });
  });

  describe("findProjectPattern", () => {
    it("finds pattern by name (case-insensitive)", async () => {
      const p = await findProjectPattern(tempDir, "SERVICE-LAYER");
      expect(p).not.toBeNull();
      expect(p!.name).toBe("service-layer");
    });

    it("returns null for non-existent pattern", async () => {
      const p = await findProjectPattern(tempDir, "nonexistent");
      expect(p).toBeNull();
    });
  });

  describe("getPatternsByType", () => {
    it("filters patterns by type", async () => {
      const codePatterns = await getPatternsByType(tempDir, "code");
      expect(codePatterns.length).toBeGreaterThanOrEqual(1);
      expect(codePatterns.every(p => p.type === "code")).toBe(true);
    });

    it("returns empty for type with no patterns", async () => {
      const result = await getPatternsByType(tempDir, "structure");
      expect(result.every(p => p.type === "structure")).toBe(true);
    });

    it("returns empty when no AGENTS.md", async () => {
      const emptyDir = await createTempTestDir("empty2-");
      try {
        const result = await getPatternsByType(emptyDir, "code");
        expect(result).toEqual([]);
      } finally {
        await cleanupTempDir(emptyDir);
      }
    });
  });
});