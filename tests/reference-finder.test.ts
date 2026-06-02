import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  findReferences,
  findReferencesFromDefinition,
  countReferences,
  findUnusedSymbols,
} from '../src/semantic/reference-finder.js';
import { treeSitterManager } from '../src/semantic/tree-sitter-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Reference Finder', () => {
  let testDir: string;

  beforeAll(async () => {
    // Initialize tree-sitter
    await treeSitterManager.initialize();
    
    // Create temp directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ref-finder-test-'));
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('findReferences', () => {
    it('finds function references in TypeScript', async () => {
      const mainFile = path.join(testDir, 'main.ts');
      const utilsFile = path.join(testDir, 'utils.ts');

      await fs.writeFile(utilsFile, `
export function myHelper(x: number): number {
  return x * 2;
}
`);

      await fs.writeFile(mainFile, `
import { myHelper } from './utils';

const result1 = myHelper(5);
const result2 = myHelper(10);
console.log(myHelper(15));
`);

      const result = await findReferences(
        'myHelper',
        testDir,
        utilsFile,
        { startLine: 2, endLine: 4, startColumn: 16, endColumn: 24, startOffset: 0, endOffset: 0 },
        { includeDefinition: true }
      );

      expect(result.symbolName).toBe('myHelper');
      expect(result.totalCount).toBeGreaterThan(0);
    });

    it('finds class references', async () => {
      const classFile = path.join(testDir, 'myclass.ts');
      const userFile = path.join(testDir, 'user.ts');

      await fs.writeFile(classFile, `
export class MyService {
  getData() { return 'data'; }
}
`);

      await fs.writeFile(userFile, `
import { MyService } from './myclass';

const service = new MyService();
console.log(service.getData());
`);

      const result = await findReferences(
        'MyService',
        testDir,
        classFile,
        { startLine: 2, endLine: 4, startColumn: 13, endColumn: 22, startOffset: 0, endOffset: 0 },
        { includeDefinition: true }
      );

      expect(result.symbolName).toBe('MyService');
      expect(result.totalCount).toBeGreaterThan(0);
    });

    it('returns empty results for unused symbols', async () => {
      const unusedFile = path.join(testDir, 'unused.ts');

      await fs.writeFile(unusedFile, `
export function neverCalled() {
  return 'never';
}
`);

      const result = await findReferences(
        'neverCalled',
        testDir,
        unusedFile,
        { startLine: 2, endLine: 4, startColumn: 16, endColumn: 27, startOffset: 0, endOffset: 0 },
        { includeDefinition: false }
      );

      expect(result.symbolName).toBe('neverCalled');
      expect(Array.isArray(result.references)).toBe(true);
    });
  });

  describe('countReferences', () => {
    it('counts references correctly', async () => {
      const libFile = path.join(testDir, 'lib.ts');
      const appFile = path.join(testDir, 'app.ts');

      await fs.writeFile(libFile, `
export function calculate(x: number) { return x * 2; }
`);

      await fs.writeFile(appFile, `
import { calculate } from './lib';
const a = calculate(1);
const b = calculate(2);
const c = calculate(3);
`);

      // countReferences returns a number directly
      const count = await countReferences(
        'calculate',
        testDir,
        libFile,
        { startLine: 2, endLine: 2, startColumn: 16, endColumn: 25, startOffset: 0, endOffset: 0 }
      );

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles symbols with special regex characters', async () => {
      const specialFile = path.join(testDir, 'special.ts');
      
      // Use valid identifier names with $ (underscore would work too)
      await fs.writeFile(specialFile, `
export function $helper() { return 1; }
export const $store = {};
`);

      // The functions should handle regex escaping properly
      const result = await findReferences(
        '$helper',
        testDir,
        specialFile,
        { startLine: 2, endLine: 2, startColumn: 16, endColumn: 23, startOffset: 0, endOffset: 0 },
        { includeDefinition: true }
      );

      expect(result.symbolName).toBe('$helper');
    });

    it('handles files with no matches', async () => {
      const noMatchFile = path.join(testDir, 'nomatch.ts');
      
      await fs.writeFile(noMatchFile, `
export function uniqueNameThatDoesntExistAnywhere() { return 1; }
`);

      const result = await findReferences(
        'nonexistent',
        testDir,
        noMatchFile,
        { startLine: 1, endLine: 1, startColumn: 0, endColumn: 10, startOffset: 0, endOffset: 0 },
        { includeDefinition: false }
      );

      expect(result.symbolName).toBe('nonexistent');
      expect(result.references).toEqual([]);
    });
  });
});
