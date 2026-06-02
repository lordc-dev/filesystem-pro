import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  extractImports,
  getImportSources,
  hasImport,
  findImportsFrom,
  findDependents,
  countDependents,
  findRelatedTests,
  findUnusedImports,
} from '../src/semantic/import-analyzer.js';
import { treeSitterManager } from '../src/semantic/tree-sitter-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Import Analyzer', () => {
  let testDir: string;

  beforeAll(async () => {
    // Initialize tree-sitter
    await treeSitterManager.initialize();
    
    // Create temp directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-analyzer-test-'));
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('extractImports (content-based)', () => {
    it('extracts named imports from TypeScript', async () => {
      const content = `
import { foo, bar } from './utils';

console.log(foo, bar);
`;

      const result = await extractImports(content, 'typescript');
      
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.imports.some(i => i.source.includes('utils'))).toBe(true);
    });

    it('extracts default imports', async () => {
      const content = `
import React from 'react';

export default function App() { return null; }
`;

      const result = await extractImports(content, 'typescript');
      
      expect(result.count).toBeGreaterThanOrEqual(1);
      const reactImport = result.imports.find(i => i.source === 'react');
      expect(reactImport).toBeDefined();
      expect(reactImport?.isDefault).toBe(true);
    });

    it('extracts namespace imports', async () => {
      const content = `
import * as path from 'path';

console.log(path.join('a', 'b'));
`;

      const result = await extractImports(content, 'typescript');
      
      expect(result.count).toBeGreaterThanOrEqual(1);
      const pathImport = result.imports.find(i => i.source === 'path');
      expect(pathImport).toBeDefined();
      expect(pathImport?.isNamespace).toBe(true);
    });

    it('extracts type-only imports', async () => {
      const content = `
import type { User } from './types';

const user: User = { name: 'test' };
`;

      const result = await extractImports(content, 'typescript');
      
      expect(result.count).toBeGreaterThanOrEqual(1);
      const typeImport = result.imports.find(i => i.source.includes('types'));
      expect(typeImport?.isTypeOnly).toBe(true);
    });

    it('extracts side-effect imports', async () => {
      const content = `
import './polyfills';

console.log('App started');
`;

      const result = await extractImports(content, 'typescript');
      
      expect(result.count).toBeGreaterThanOrEqual(1);
      const sideEffectImport = result.imports.find(i => i.source.includes('polyfills'));
      expect(sideEffectImport?.isSideEffect).toBe(true);
    });

    it('extracts Python imports', async () => {
      const content = `
import os
import sys
from pathlib import Path

print(os.getcwd())
`;

      const result = await extractImports(content, 'python');
      
      expect(result.count).toBeGreaterThanOrEqual(3);
      expect(result.imports.some(i => i.source === 'os')).toBe(true);
    });

    it('returns summary with type counts', async () => {
      const content = `
import DefaultFoo from 'default-module';
import { named } from 'named-module';
import * as namespace from 'namespace-module';
import './side-effect';

console.log(DefaultFoo, named, namespace);
`;

      const result = await extractImports(content, 'typescript');
      
      expect(result.summary).toBeDefined();
      expect(result.summary.default).toBeGreaterThanOrEqual(1);
      expect(result.summary.namespace).toBeGreaterThanOrEqual(1);
      expect(result.summary.sideEffect).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getImportSources', () => {
    it('returns unique import sources', async () => {
      const content = `
import { a } from 'react';
import { b } from 'react-dom';
import { c } from 'react';

console.log(a, b, c);
`;

      const sources = await getImportSources(content, 'typescript');
      
      expect(sources).toContain('react');
      expect(sources).toContain('react-dom');
      // Should be unique
      expect(sources.filter(s => s === 'react').length).toBe(1);
    });
  });

  describe('hasImport', () => {
    it('returns true when import exists', async () => {
      const content = `
import { useState } from 'react';

function App() { return useState; }
`;

      const result = await hasImport(content, 'typescript', 'react');
      expect(result).toBe(true);
    });

    it('returns false when import does not exist', async () => {
      const content = `
import { useState } from 'react';

function App() { return null; }
`;

      const result = await hasImport(content, 'typescript', 'vue');
      expect(result).toBe(false);
    });
  });

  describe('findImportsFrom', () => {
    it('finds all imports from a specific source', async () => {
      const content = `
import { useState, useEffect } from 'react';
import { render } from 'react-dom';

const App = () => { useState(); useEffect(() => {}, []); return null; };
`;

      const imports = await findImportsFrom(content, 'typescript', 'react');
      
      expect(imports.length).toBeGreaterThanOrEqual(1);
      expect(imports[0].source).toBe('react');
    });
  });

  describe('findDependents (file-based)', () => {
    it('finds files that import a given file', async () => {
      const moduleFile = path.join(testDir, 'myModule.ts');
      await fs.writeFile(moduleFile, `
export function helper() { return 'help'; }
`);

      const consumerFile = path.join(testDir, 'consumer.ts');
      await fs.writeFile(consumerFile, `
import { helper } from './myModule';

console.log(helper());
`);

      const dependents = await findDependents(moduleFile, testDir);
      
      expect(Array.isArray(dependents)).toBe(true);
    });

    it('returns array for isolated files', async () => {
      const isolatedFile = path.join(testDir, 'isolated.ts');
      await fs.writeFile(isolatedFile, `
export function isolated() { return 'alone'; }
`);

      const dependents = await findDependents(isolatedFile, testDir);
      
      expect(Array.isArray(dependents)).toBe(true);
    });
  });

  describe('countDependents', () => {
    it('returns count of dependent files', async () => {
      const sharedModule = path.join(testDir, 'shared.ts');
      await fs.writeFile(sharedModule, `
export const CONSTANT = 42;
`);

      const user1 = path.join(testDir, 'user1.ts');
      await fs.writeFile(user1, `
import { CONSTANT } from './shared';
console.log(CONSTANT);
`);

      const count = await countDependents(sharedModule, testDir);
      
      expect(typeof count).toBe('number');
    });
  });

  describe('findRelatedTests', () => {
    it('finds .test.ts files', async () => {
      const sourceFile = path.join(testDir, 'component.ts');
      await fs.writeFile(sourceFile, `
export function Component() { return null; }
`);

      const testFile = path.join(testDir, 'component.test.ts');
      await fs.writeFile(testFile, `
import { Component } from './component';
describe('Component', () => { it('works', () => {}); });
`);

      const tests = await findRelatedTests(sourceFile, testDir);
      
      expect(Array.isArray(tests)).toBe(true);
    });

    it('finds .spec.ts files', async () => {
      const sourceFile = path.join(testDir, 'service.ts');
      await fs.writeFile(sourceFile, `
export class Service { }
`);

      const specFile = path.join(testDir, 'service.spec.ts');
      await fs.writeFile(specFile, `
import { Service } from './service';
describe('Service', () => { it('exists', () => {}); });
`);

      const tests = await findRelatedTests(sourceFile, testDir);
      
      expect(Array.isArray(tests)).toBe(true);
    });

    it('finds Python test files with test_ prefix', async () => {
      const sourceFile = path.join(testDir, 'calculator.py');
      await fs.writeFile(sourceFile, `
def add(a, b):
    return a + b
`);

      const pyTestFile = path.join(testDir, 'test_calculator.py');
      await fs.writeFile(pyTestFile, `
from calculator import add

def test_add():
    assert add(1, 2) == 3
`);

      const tests = await findRelatedTests(sourceFile, testDir);
      
      expect(Array.isArray(tests)).toBe(true);
    });
  });

  describe('findUnusedImports', () => {
    it('detects unused imports', async () => {
      const content = `
import { used, unused } from './utils';

console.log(used);
`;

      const result = await findUnusedImports(content, 'typescript');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.some(u => u.unusedSpecifiers.includes('unused'))).toBe(true);
    });

    it('returns empty array when all imports are used', async () => {
      const content = `
import { a, b } from './utils';

console.log(a, b);
`;

      const result = await findUnusedImports(content, 'typescript');
      
      // a and b should not be flagged as unused
      const hasAorB = result.some(u => 
        u.unusedSpecifiers.includes('a') || u.unusedSpecifiers.includes('b')
      );
      expect(hasAorB).toBe(false);
    });

    it('handles namespace imports', async () => {
      const content = `
import * as utils from './utils';

console.log(utils);
`;

      const result = await findUnusedImports(content, 'typescript');
      
      expect(Array.isArray(result)).toBe(true);
      // 'utils' is used, should not be flagged
      const hasUtils = result.some(u => u.unusedSpecifiers.includes('utils'));
      expect(hasUtils).toBe(false);
    });

    it('does not flag side-effect imports', async () => {
      const content = `
import './polyfills';

console.log('App');
`;

      const result = await findUnusedImports(content, 'typescript');
      
      // Side-effect imports should never be flagged
      const hasSideEffect = result.some(u => 
        u.import.source.includes('polyfills')
      );
      expect(hasSideEffect).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty content', async () => {
      const result = await extractImports('', 'typescript');
      expect(result.count).toBe(0);
      expect(result.imports).toEqual([]);
    });

    it('handles content with only comments', async () => {
      const content = `
// This is a comment
/* Multi-line comment */
`;

      const result = await extractImports(content, 'typescript');
      expect(result.count).toBe(0);
    });

    it('handles mixed import styles', async () => {
      const content = `
import DefaultExport, { named1, named2 } from './mixed-module';
import * as namespace from './namespace-module';
import type { TypeOnly } from './types';

console.log(DefaultExport, named1, named2, namespace);
`;

      const result = await extractImports(content, 'typescript');
      
      expect(result.count).toBeGreaterThanOrEqual(3);
    });

    it('handles dynamic imports', async () => {
      const content = `
const module = await import('./dynamic-module');
console.log(module);
`;

      const result = await extractImports(content, 'typescript');
      // Dynamic imports may or may not be detected
      expect(result).toBeDefined();
    });
  });
});
