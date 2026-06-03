import fs from "fs/promises";
import path from "path";
import { normalizeLineEndings } from "../utils/text-utils.js";
import { FILE_ENCODING } from "../constants.js";

const projectPatternsCache = new Map<string, string | null>();
const MAX_CACHE_ENTRIES = 50;
function getProjectPatternsCache(): Map<string, string | null> {
  if (projectPatternsCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = projectPatternsCache.keys().next().value;
    if (firstKey !== undefined) projectPatternsCache.delete(firstKey);
  }
  return projectPatternsCache;
}

export interface ProjectPattern {
  name: string;
  description?: string;
  pattern: string;
  type: "code" | "structure" | "config";
  language?: string;
  tags?: string[];
  category?: string;
  variables?: Array<{name: string; description?: string}>;
  metadata?: Record<string, unknown>;
}

export interface ProjectPatternsResult {
  patterns: ProjectPattern[];
  claudeMdPath: string;
  projectRoot: string;
}

// Regex pattern factories - using functions to avoid stateful /g flag issues
// Each call returns a fresh regex instance, preventing lastIndex state bugs
const REGEX_FACTORIES = {
  // Global patterns (need fresh instance each use due to /g flag)
  patternsBlock: () => /<patterns>([\s\S]*?)<\/patterns>/gi,
  pattern: () => /<pattern([^>]*)>([\s\S]*?)<\/pattern>/gi,
  variable: () => /<var\s+name="([^"]+)"(?:\s+description="([^"]+)")?\s*\/>/gi,
  metaTag: () => /<([^>]+)>([\s\S]*?)<\/\1>/gi,
};

// Static patterns (no /g flag, safe to reuse)
const REGEX_STATIC = {
  attributes: {
    name: /name="([^"]+)"/,
    type: /type="(code|structure|config)"/,
    language: /language="([^"]+)"/,
    tags: /tags="([^"]+)"/,
    category: /category="([^"]+)"/
  },
  elements: {
    description: /<description>([\s\S]*?)<\/description>/,
    variables: /<variables>([\s\S]*?)<\/variables>/,
    metadata: /<metadata>([\s\S]*?)<\/metadata>/,
    template: /<template><!\[CDATA\[([\s\S]*?)\]\]><\/template>/,
    cdata: /<!\[CDATA\[([\s\S]*?)\]\]>/
  },
};

/**
 * Reads project patterns from AGENTS.md file in the project root
 * @param searchPath The path to start searching for AGENTS.md
 * @returns Project patterns if found, or null if no AGENTS.md exists
 */
export async function getProjectPatterns(searchPath: string): Promise<ProjectPatternsResult | null> {
  const currentPath = path.resolve(searchPath);
  let claudeMdPath: string | null = null;
  
  const projectRootCache = getProjectPatternsCache();
  const cached = projectRootCache.get(currentPath);
  if (cached !== undefined) {
    if (cached === null) return null;
    claudeMdPath = cached;
  } else {
    let searchDir = currentPath;
    while (searchDir !== path.parse(searchDir).root) {
      const potentialPath = path.join(searchDir, "AGENTS.md");
      try {
        await fs.access(potentialPath);
        claudeMdPath = potentialPath;
        break;
      } catch {
        // Continue searching up
      }
      searchDir = path.dirname(searchDir);
    }
    projectRootCache.set(path.resolve(searchPath), claudeMdPath);
  }
  
  if (!claudeMdPath) {
    return null;
  }
  
  // Read and parse AGENTS.md
  const content = await fs.readFile(claudeMdPath, FILE_ENCODING);
  const normalizedContent = normalizeLineEndings(content);
  
  // Extract patterns from the file
  const patterns = extractPatterns(normalizedContent);
  
  return {
    patterns,
    claudeMdPath,
    projectRoot: path.dirname(claudeMdPath)
  };
}

/**
 * Extracts patterns from AGENTS.md content
 * Supports advanced XML features including tags, metadata, and variables
 */
function extractPatterns(content: string): ProjectPattern[] {
  const patterns: ProjectPattern[] = [];
  const processedPatterns = new Set<string>(); // Avoid duplicates
  
  // Process patterns inside <patterns> blocks
  let patternsMatch;
  const patternsBlockRegex = REGEX_FACTORIES.patternsBlock();
  
  while ((patternsMatch = patternsBlockRegex.exec(content)) !== null) {
    const blockPatterns = extractPatternsFromContent(patternsMatch[1]);
    for (const pattern of blockPatterns) {
      const key = `${pattern.name}:${pattern.type}`;
      if (!processedPatterns.has(key)) {
        processedPatterns.add(key);
        patterns.push(pattern);
      }
    }
  }
  
  // Process standalone patterns (outside blocks)
  const contentWithoutBlocks = content.replace(REGEX_FACTORIES.patternsBlock(), '');
  const standalonePatterns = extractPatternsFromContent(contentWithoutBlocks);
  
  for (const pattern of standalonePatterns) {
    const key = `${pattern.name}:${pattern.type}`;
    if (!processedPatterns.has(key)) {
      processedPatterns.add(key);
      patterns.push(pattern);
    }
  }
  
  return patterns;
}

/**
 * Extract patterns from content with optimized regex usage
 */
function extractPatternsFromContent(content: string): ProjectPattern[] {
  const patterns: ProjectPattern[] = [];
  let match;
  
  // Use fresh regex instance to avoid stateful /g issues
  const patternRegex = REGEX_FACTORIES.pattern();
  
  while ((match = patternRegex.exec(content)) !== null) {
    const [, attributes, innerContent] = match;
    
    // Quick check for required name attribute
    const nameMatch = REGEX_STATIC.attributes.name.exec(attributes);
    if (!nameMatch) continue;
    
    const pattern: ProjectPattern = {
      name: nameMatch[1].trim(),
      type: "code",
      pattern: ""
    };
    
    // Extract attributes efficiently (static regexes, safe to reuse)
    const typeMatch = REGEX_STATIC.attributes.type.exec(attributes);
    if (typeMatch) pattern.type = typeMatch[1] as "code" | "structure" | "config";
    
    const langMatch = REGEX_STATIC.attributes.language.exec(attributes);
    if (langMatch) pattern.language = langMatch[1];
    
    const tagsMatch = REGEX_STATIC.attributes.tags.exec(attributes);
    if (tagsMatch) {
      pattern.tags = tagsMatch[1].split(',').map(t => t.trim()).filter(t => t);
    }
    
    const categoryMatch = REGEX_STATIC.attributes.category.exec(attributes);
    if (categoryMatch) pattern.category = categoryMatch[1];
    
    // Extract inner elements (static regexes)
    const descMatch = REGEX_STATIC.elements.description.exec(innerContent);
    if (descMatch) pattern.description = descMatch[1].trim();
    
    // Extract variables (needs fresh global regex)
    const variablesMatch = REGEX_STATIC.elements.variables.exec(innerContent);
    if (variablesMatch) {
      const variables: Array<{name: string; description?: string}> = [];
      let varMatch;
      const variableRegex = REGEX_FACTORIES.variable();
      
      while ((varMatch = variableRegex.exec(variablesMatch[1])) !== null) {
        variables.push({
          name: varMatch[1],
          description: varMatch[2]
        });
      }
      
      if (variables.length > 0) pattern.variables = variables;
    }
    
    // Extract metadata (needs fresh global regex)
    const metadataMatch = REGEX_STATIC.elements.metadata.exec(innerContent);
    if (metadataMatch) {
      const metadata: Record<string, unknown> = {};
      let metaMatch;
      const metaTagRegex = REGEX_FACTORIES.metaTag();
      
      while ((metaMatch = metaTagRegex.exec(metadataMatch[1])) !== null) {
        metadata[metaMatch[1]] = metaMatch[2].trim();
      }
      
      if (Object.keys(metadata).length > 0) pattern.metadata = metadata;
    }
    
    // Extract pattern content - try template first, then CDATA, then clean content
    const templateMatch = REGEX_STATIC.elements.template.exec(innerContent);
    if (templateMatch) {
      pattern.pattern = templateMatch[1].trim();
    } else {
      const cdataMatch = REGEX_STATIC.elements.cdata.exec(innerContent);
      if (cdataMatch) {
        pattern.pattern = cdataMatch[1].trim();
      } else {
        // Fallback: remove known elements and use remaining content
        pattern.pattern = innerContent
          .replace(REGEX_STATIC.elements.description, '')
          .replace(REGEX_STATIC.elements.variables, '')
          .replace(REGEX_STATIC.elements.metadata, '')
          .trim();
      }
    }
    
    patterns.push(pattern);
  }
  
  return patterns;
}

// ============================================================================
// SSOT: Generic filter function to reduce boilerplate
// ============================================================================

/**
 * Generic pattern filter function (SSOT)
 * All pattern filtering goes through this function to avoid code duplication.
 */
async function filterPatterns(
  searchPath: string,
  predicate: (p: ProjectPattern) => boolean
): Promise<ProjectPattern[]> {
  const result = await getProjectPatterns(searchPath);
  return result ? result.patterns.filter(predicate) : [];
}

/**
 * Searches for a specific pattern by name
 */
export async function findProjectPattern(
  searchPath: string, 
  patternName: string
): Promise<ProjectPattern | null> {
  const patterns = await filterPatterns(
    searchPath,
    p => p.name.toLowerCase() === patternName.toLowerCase()
  );
  return patterns[0] || null;
}

/**
 * Gets all patterns of a specific type
 */
export async function getPatternsByType(
  searchPath: string,
  type: "code" | "structure" | "config"
): Promise<ProjectPattern[]> {
  return filterPatterns(searchPath, p => p.type === type);
}

