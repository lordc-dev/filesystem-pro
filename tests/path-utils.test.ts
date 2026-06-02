import { describe, it, expect } from 'vitest';
import { normalizePath, expandHome } from '../src/validation/path-utils.js';
import os from 'os';
import path from 'path';

describe('Path Utilities', () => {
  describe('normalizePath', () => {
    it('preserves Unix paths', () => {
      expect(normalizePath('/usr/local/bin'))
        .toBe('/usr/local/bin');
      expect(normalizePath('/home/user/Documents'))
        .toBe('/home/user/Documents');
    });

    it('removes surrounding quotes', () => {
      expect(normalizePath('"/path/to/file"'))
        .toBe('/path/to/file');
      expect(normalizePath("'/path/to/file'"))
        .toBe('/path/to/file');
    });

    it('normalizes multiple slashes', () => {
      expect(normalizePath('/usr//local///bin'))
        .toBe('/usr/local/bin');
    });

    it('removes trailing slashes', () => {
      expect(normalizePath('/path/to/dir/'))
        .toBe('/path/to/dir');
    });

    it('preserves root slash', () => {
      expect(normalizePath('/'))
        .toBe('/');
    });

    it('resolves . and .. in paths', () => {
      expect(normalizePath('/usr/local/./bin'))
        .toBe('/usr/local/bin');
      expect(normalizePath('/usr/local/../share'))
        .toBe('/usr/share');
    });
  });

  describe('expandHome', () => {
    const homeDir = os.homedir();

    it('expands ~ to home directory', () => {
      expect(expandHome('~/Documents'))
        .toBe(path.join(homeDir, 'Documents'));
      expect(expandHome('~/'))
        .toBe(path.join(homeDir, '/'));
      expect(expandHome('~'))
        .toBe(homeDir);
    });

    it('leaves other paths unchanged', () => {
      expect(expandHome('/usr/local/bin'))
        .toBe('/usr/local/bin');
      expect(expandHome('/home/user/~file'))
        .toBe('/home/user/~file');
      expect(expandHome('relative/path'))
        .toBe('relative/path');
    });

    it('does not expand ~ in the middle of path', () => {
      expect(expandHome('/some/~/path'))
        .toBe('/some/~/path');
    });
  });
});
