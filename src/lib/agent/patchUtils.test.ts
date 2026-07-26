import { parseUnifiedDiff, extensionToLanguage } from './patchUtils';

describe('parseUnifiedDiff', () => {
  it('parses a modified file hunk', () => {
    const patch = [
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,2 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 3;',
    ].join('\n');
    const parsed = parseUnifiedDiff(patch);
    expect(parsed.fileStatus).toBe('modified');
    expect(parsed.oldContent).toBe('const a = 1;\nconst b = 2;');
    expect(parsed.newContent).toBe('const a = 1;\nconst b = 3;');
  });

  it('detects added files', () => {
    const patch = ['--- /dev/null', '+++ b/src/new.ts', '@@ -0,0 +1,1 @@', '+x'].join('\n');
    expect(parseUnifiedDiff(patch).fileStatus).toBe('added');
  });

  it('detects deleted files', () => {
    const patch = ['--- a/src/old.ts', '+++ /dev/null', '@@ -1,1 +0,0 @@', '-x'].join('\n');
    expect(parseUnifiedDiff(patch).fileStatus).toBe('deleted');
  });
});

describe('extensionToLanguage', () => {
  it('maps common extensions', () => {
    expect(extensionToLanguage('a/b.ts')).toBe('typescript');
    expect(extensionToLanguage('a/b.py')).toBe('python');
    expect(extensionToLanguage('a/b.unknown')).toBe('plaintext');
  });
});
