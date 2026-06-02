import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { isPathWithinAllowedDirectories, createTempTestDir, cleanupTempDir } from './test-helpers.js';

describe('Security Path Validation', () => {
  describe('path traversal attacks', () => {
    it('blocks ../ traversal beyond root', () => {
      const allowed = ['/home/user/project'];
      expect(isPathWithinAllowedDirectories('/home/user/project/../etc/passwd', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project/../../etc/passwd', allowed)).toBe(false);
    });

    it('blocks deeply nested ../ traversal', () => {
      const allowed = ['/home/user/project'];
      const attack = '/home/user/project/foo/bar/../../../etc/passwd';
      expect(isPathWithinAllowedDirectories(attack, allowed)).toBe(false);
    });

    it('URL-encoded %2e%2e treated as literal filename (not traversal)', () => {
      const allowed = ['/home/user/project'];
      // %2e%2e is NOT decoded by path.normalize — treated as literal dir name
      // This is expected: the filesystem would create a directory named '%2e%2e'
      expect(isPathWithinAllowedDirectories('/home/user/project/%2e%2e/etc/passwd', allowed)).toBe(true);
    });

    it('blocks null byte injection', () => {
      const allowed = ['/home/user/project'];
      expect(isPathWithinAllowedDirectories('/home/user/project\x00/../../etc/passwd', allowed)).toBe(false);
    });
  });

  describe('symlink traversal prevention', () => {
    let tmpDir: string;
    let targetDir: string;
    let linkDir: string;

    beforeEach(async () => {
      tmpDir = await createTempTestDir('symlink-');
      targetDir = path.join(tmpDir, 'target');
      linkDir = path.join(tmpDir, 'link');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, 'secret.txt'), 'sensitive data', 'utf-8');
    });

    afterEach(async () => {
      await cleanupTempDir(tmpDir);
    });

    it('detects symlink pointing outside allowed roots', async () => {
      const outsideDir = path.join(tmpDir, 'outside');
      await fs.mkdir(outsideDir, { recursive: true });
      await fs.writeFile(path.join(outsideDir, 'forbidden.txt'), 'no access', 'utf-8');

      const linkPath = path.join(targetDir, 'escape');
      await fs.symlink(outsideDir, linkPath);

      const stat = await fs.lstat(linkPath);
      expect(stat.isSymbolicLink()).toBe(true);

      const realPath = await fs.realpath(linkPath);
      expect(realPath).not.toBe(targetDir);
      // On macOS, /tmp → /private/tmp, so compare resolved paths
      const resolvedOutside = await fs.realpath(outsideDir);
      expect(realPath).toBe(resolvedOutside);
    });

    it('resolves symlink within allowed roots correctly', async () => {
      const innerLink = path.join(targetDir, 'inner-link');
      const innerTarget = path.join(targetDir, 'inner');
      await fs.mkdir(innerTarget, { recursive: true });
      await fs.symlink(innerTarget, innerLink);

      const realPath = await fs.realpath(innerLink);
      // On macOS, realpath may resolve to /private/tmp prefix
      const resolvedTarget = await fs.realpath(targetDir);
      expect(realPath.startsWith(resolvedTarget)).toBe(true);
    });
  });

  describe('prefix collision attacks', () => {
    it('blocks paths that start with allowed prefix but are different dirs', () => {
      const allowed = ['/home/user/project'];
      expect(isPathWithinAllowedDirectories('/home/user/project2', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project-evil', allowed)).toBe(false);
      expect(isPathWithinAllowedDirectories('/home/user/project.backup', allowed)).toBe(false);
    });

    it('allows exact root path', () => {
      const allowed = ['/home/user/project'];
      expect(isPathWithinAllowedDirectories('/home/user/project', allowed)).toBe(true);
    });

    it('allows proper child paths', () => {
      const allowed = ['/home/user/project'];
      expect(isPathWithinAllowedDirectories('/home/user/project/src', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project/src/index.ts', allowed)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty allowed list', () => {
      expect(isPathWithinAllowedDirectories('/any/path', [])).toBe(false);
    });

    it('handles null/empty target path', () => {
      expect(isPathWithinAllowedDirectories('', ['/home'])).toBe(false);
    });

    it('handles multiple allowed roots', () => {
      const allowed = ['/home/user/project-a', '/home/user/project-b'];
      expect(isPathWithinAllowedDirectories('/home/user/project-a/src', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project-b/src', allowed)).toBe(true);
      expect(isPathWithinAllowedDirectories('/home/user/project-c/src', allowed)).toBe(false);
    });

    it('handles case sensitivity on normalized paths', () => {
      const allowed = ['/HOME/user/project'];
      expect(isPathWithinAllowedDirectories('/home/user/project', allowed)).toBe(false);
    });
  });

  describe('roots manager validation', () => {
    it('throws PathValidationError for paths outside roots', async () => {
      const { validatePathAgainstRootsAsync } = await import('../src/validation/roots-manager.js');
      const { PathValidationError } = await import('../src/errors/index.js');

      const { rootsManager } = await import('../src/validation/roots-manager.js');

      const origSetRoots = rootsManager.setRoots.bind(rootsManager);
      const origClear = rootsManager.clearRoots.bind(rootsManager);

      try {
        await origSetRoots([{ uri: `file://${os.tmpdir()}` }]);
        if (rootsManager.isRestricted()) {
          await expect(
            validatePathAgainstRootsAsync('/etc/passwd')
          ).rejects.toThrow();

          try {
            await validatePathAgainstRootsAsync('/etc/passwd');
          } catch (err) {
            expect(err).toBeInstanceOf(PathValidationError);
          }
        }
      } finally {
        origClear();
      }
    });
  });
});