// ─── AST-boundary Chunker ────────────────────────────────────────────────────
// Language-aware code chunker using regex-based boundary detection.
// Splits code at top-level function / class / module boundaries per language.
// Supports robust fallback for single-line and non-empty files (BUG-3).

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'c'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'unknown';

export interface AstChunk {
  content: string;
  lineStart: number;
  lineEnd: number;
  kind: 'function' | 'class' | 'module' | 'block' | 'other';
  name?: string;
}

// ─── Language Detection ──────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, SupportedLanguage> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  pyi: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  cs: 'csharp',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
};

/** Detect language from file path extension. */
export function detectLanguage(filePath: string): SupportedLanguage {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_LANG[ext] ?? 'unknown';
}

// ─── Boundary Patterns ───────────────────────────────────────────────────────

type BoundaryRule = {
  pattern: RegExp;
  kind: AstChunk['kind'];
  nameGroup?: number;
};

const BOUNDARIES: Record<SupportedLanguage, BoundaryRule[]> = {
  typescript: [
    { pattern: /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^(?:export\s+)?(?:interface|type)\s+(\w+)/, kind: 'module', nameGroup: 1 },
  ],
  javascript: [
    { pattern: /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:export\s+(?:default\s+)?)?class\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^module\.exports/, kind: 'module' },
  ],
  python: [
    { pattern: /^(?:async\s+)?def\s+(\w+)/, kind: 'function', nameGroup: 1 },
    { pattern: /^class\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^@\w+/, kind: 'other' },
  ],
  rust: [
    { pattern: /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum)\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^(?:pub(?:\([^)]*\))?\s+)?impl(?:\s+\w+)?\s+(?:for\s+)?(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)/, kind: 'module', nameGroup: 1 },
  ],
  go: [
    { pattern: /^func\s+(?:\(\w+\s+[*]?\w+\)\s+)?(\w+)/, kind: 'function', nameGroup: 1 },
    { pattern: /^type\s+(\w+)\s+struct/, kind: 'class', nameGroup: 1 },
    { pattern: /^type\s+(\w+)\s+interface/, kind: 'class', nameGroup: 1 },
  ],
  java: [
    { pattern: /^(?:public|private|protected|static|final|abstract|\s)*class\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^(?:public|private|protected|static|final|\s)*(?:void|\w+)\s+(\w+)\s*\(/, kind: 'function', nameGroup: 1 },
  ],
  csharp: [
    { pattern: /^(?:public|private|protected|internal|static|abstract|sealed|\s)*class\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^(?:public|private|protected|internal|static|\s)*(?:void|\w+)\s+(\w+)\s*\(/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:public|private|protected|\s)*(?:interface|enum)\s+(\w+)/, kind: 'class', nameGroup: 1 },
  ],
  cpp: [
    { pattern: /^(?:(?:virtual|static|inline|explicit|constexpr|\w+)\s+)*\w+\s+(\w+)\s*\(/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:class|struct)\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^namespace\s+(\w+)/, kind: 'module', nameGroup: 1 },
  ],
  c: [
    { pattern: /^\w[\w\s*]+\s+(\w+)\s*\([^;]*\)\s*\{/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:typedef\s+)?struct\s+(\w+)/, kind: 'class', nameGroup: 1 },
  ],
  ruby: [
    { pattern: /^def\s+(?:self\.)?(\w+)/, kind: 'function', nameGroup: 1 },
    { pattern: /^class\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^module\s+(\w+)/, kind: 'module', nameGroup: 1 },
  ],
  php: [
    { pattern: /^(?:public|private|protected|static|\s)*function\s+(\w+)/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:abstract\s+)?class\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^interface\s+(\w+)/, kind: 'class', nameGroup: 1 },
  ],
  swift: [
    { pattern: /^(?:public|private|internal|fileprivate|open|\s)*func\s+(\w+)/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:public|private|\s)*(?:class|struct|enum|actor)\s+(\w+)/, kind: 'class', nameGroup: 1 },
  ],
  kotlin: [
    { pattern: /^(?:fun|suspend\s+fun)\s+(\w+)/, kind: 'function', nameGroup: 1 },
    { pattern: /^(?:data\s+|sealed\s+|abstract\s+)?class\s+(\w+)/, kind: 'class', nameGroup: 1 },
    { pattern: /^object\s+(\w+)/, kind: 'module', nameGroup: 1 },
  ],
  unknown: [],
};

// ─── Chunker ─────────────────────────────────────────────────────────────────

/**
 * Split file content into semantically meaningful chunks.
 * Empty content returns []; non-empty content with < minChunkLines returns 1 chunk fallback (BUG-3).
 */
export function chunkByAstBoundaries(
  content: string,
  language: SupportedLanguage,
  maxChunkLines = 120,
  minChunkLines = 3,
): AstChunk[] {
  if (!content || !content.trim()) {
    return [];
  }

  const lines = content.split('\n');
  const rules = BOUNDARIES[language] || [];

  if (rules.length === 0) {
    return chunkByLines(content, lines, maxChunkLines, minChunkLines);
  }

  const chunks: AstChunk[] = [];
  let currentStart = 0;
  let currentLines: string[] = [];
  let currentKind: AstChunk['kind'] = 'other';
  let currentName: string | undefined;

  const flushChunk = (endLine: number) => {
    const text = currentLines.join('\n').trim();
    if (text) {
      chunks.push({
        content: text,
        lineStart: currentStart,
        lineEnd: endLine,
        kind: currentKind,
        name: currentName,
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    let matched = false;
    for (const rule of rules) {
      const m = trimmed.match(rule.pattern);
      if (m) {
        if (currentLines.length >= minChunkLines) {
          flushChunk(i - 1);
        }
        currentStart = i;
        currentLines = [line];
        currentKind = rule.kind;
        currentName = rule.nameGroup ? m[rule.nameGroup] : undefined;
        matched = true;
        break;
      }
    }

    if (!matched) {
      currentLines.push(line);

      if (currentLines.length >= maxChunkLines) {
        flushChunk(i);
        currentStart = i + 1;
        currentLines = [];
        currentKind = 'other';
        currentName = undefined;
      }
    }
  }

  if (currentLines.some((l) => l.trim())) {
    flushChunk(lines.length - 1);
  }

  // BUG-3: Fallback for single-line or small files
  if (chunks.length === 0 && content.trim()) {
    return [
      {
        content: content.trim(),
        lineStart: 0,
        lineEnd: Math.max(0, lines.length - 1),
        kind: 'other',
      },
    ];
  }

  return chunks;
}

/** Fallback chunker for unknown languages or small files (BUG-3). */
function chunkByLines(
  rawContent: string,
  lines: string[],
  windowSize: number,
  minLines: number,
): AstChunk[] {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }

  const chunks: AstChunk[] = [];
  for (let i = 0; i < lines.length; i += windowSize) {
    const slice = lines.slice(i, i + windowSize);
    const text = slice.join('\n').trim();
    if (text.split('\n').length >= minLines) {
      chunks.push({
        content: text,
        lineStart: i,
        lineEnd: Math.min(i + windowSize - 1, lines.length - 1),
        kind: 'block',
      });
    }
  }

  // BUG-3: Fallback to single chunk containing raw content if small file
  if (chunks.length === 0 && rawContent.trim()) {
    chunks.push({
      content: rawContent.trim(),
      lineStart: 0,
      lineEnd: Math.max(0, lines.length - 1),
      kind: 'block',
    });
  }

  return chunks;
}
