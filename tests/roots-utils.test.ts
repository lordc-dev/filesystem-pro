import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isPathWithinAllowedDirectories } from './test-helpers.js';

/**
 * Tests for path validation logic used by RootsManager.
 * Since RootsManager requires mocking the config module and has complex
 * initialization, we test the underlying path validation logic directly.
 */
describe('Path Validation (RootsManager logic)', () => {
  let testDir1: string;
  let testDir2: string;
  let testDir3: string;
  let testFile: string;

  beforeEach(() => {
    // Create test directories
    testDir1 = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-roots-test1-')));
    testDir2 = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-roots-test2-')));
    testDir3 = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-roots-test3-')));

    // Create a test file (not a directory)
    testFile = join(testDir1, 'test-file.txt');
    writeFileSync(testFile, 'test content');
  });

  afterEach(() => {
    // Cleanup
    rmSync(testDir1, { recursive: true, force: true });
    rmSync(testDir2, { recursive: true, force: true });
    rmSync(testDir3, { recursive: true, force: true });
  });

  describe('isPathAllowed logic', () => {
    it('should allow paths within allowed directories', () => {
      const allowed = [testDir1];
      
      expect(isPathWithinAllowedDirectories(testDir1, allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories(join(testDir1, 'subdir'), allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories(join(testDir1, 'subdir', 'file.txt'), allowed)).toBe(true);
    });

    it('should block paths outside allowed directories', () => {
      const allowed = [testDir1];
      
      expect(isPathWithinAllowedDirectories(testDir2, allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/etc/passwd', allowed)).toBe(false);
    });

    it('should block similar directory names (prefix attack)', () => {
      const allowed = [testDir1];
      
      // These paths start with the same prefix but are not subdirectories
      expect(isPathWithinAllowedDirectories(testDir1 + '-malicious', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories(testDir1 + '2', allowed)).toBe(false);
    });

    it('should handle multiple allowed directories', () => {
      const allowed = [testDir1, testDir2];
      
      expect(isPathWithinAllowedDirectories(join(testDir1, 'file'), allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories(join(testDir2, 'file'), allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories(join(testDir3, 'file'), allowed)).toBe(false);
    });

    it('should handle complex normalized paths', () => {
      const subDir = join(testDir1, 'subdir');
      mkdirSync(subDir);
      
      // Path with . and .. should normalize correctly
      const complexPath = join(testDir1, 'subdir', '..', 'subdir', 'file.txt');
      const allowed = [testDir1];
      
      expect(isPathWithinAllowedDirectories(complexPath, allowed)).toBe(true);
    });
  });

  describe('empty and invalid inputs', () => {
    it('should return false for empty allowed list', () => {
      expect(isPathWithinAllowedDirectories(testDir1, [])).toBe(false);
    });

    it('should handle empty path', () => {
      const allowed = [testDir1];
      expect(isPathWithinAllowedDirectories('', allowed)).toBe(false);
    });

    it('should skip empty entries in allowed list', () => {
      const allowed = ['', testDir1, ''];
      expect(isPathWithinAllowedDirectories(join(testDir1, 'file'), allowed)).toBe(true);
    });
  });
});
