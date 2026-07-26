// ─── Patch parsing utilities ────────────────────────────────────────────────
// Parse unified diff text into old/new file contents for the diff viewer.

export interface ParsedPatch {
  oldContent: string;
  newContent: string;
  /** File status derived from the diff headers. */
  fileStatus: 'added' | 'modified' | 'deleted' | 'renamed';
}

/**
 * Reconstruct old/new file contents from a unified diff.
 * Falls back to empty strings when hunks cannot be parsed.
 */
export function parseUnifiedDiff(patch: string): ParsedPatch {
  const lines = patch.split('\n');
  const oldContent: string[] = [];
  const newContent: string[] = [];
  let fileStatus: ParsedPatch['fileStatus'] = 'modified';
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      if (line.slice(4).trim() === '/dev/null') fileStatus = 'added';
      continue;
    }
    if (line.startsWith('+++ ')) {
      if (line.slice(4).trim() === '/dev/null') fileStatus = 'deleted';
      continue;
    }
    if (line.startsWith('rename from')) {
      fileStatus = 'renamed';
      continue;
    }
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;

    if (line.startsWith('+')) {
      newContent.push(line.slice(1));
    } else if (line.startsWith('-')) {
      oldContent.push(line.slice(1));
    } else if (line.startsWith(' ') || line === '') {
      const text = line.slice(1);
      oldContent.push(text);
      newContent.push(text);
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" — ignore
      continue;
    } else {
      inHunk = false;
    }
  }

  // Partial reconstruction: without full file context we can only show hunks.
  // This is acceptable for review purposes.
  return {
    oldContent: oldContent.join('\n'),
    newContent: newContent.join('\n'),
    fileStatus,
  };
}

/** Map file extension to a syntax-highlight language label. */
export function extensionToLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    html: 'html',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cs: 'csharp',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    sh: 'bash',
    ps1: 'powershell',
  };
  return map[ext] ?? 'plaintext';
}
