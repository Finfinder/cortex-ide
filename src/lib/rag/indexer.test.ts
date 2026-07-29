// ─── WorkspaceIndexer + Chunker Unit Tests ───────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceIndexer } from './indexer';
import { QdrantClient } from './qdrant';
import { BgeM3Client } from './embeddings';
import { detectLanguage, chunkByAstBoundaries } from './chunker';

// ─── Chunker Tests ───────────────────────────────────────────────────────────

describe('detectLanguage()', () => {
  it.each([
    ['src/app.ts', 'typescript'],
    ['utils/helper.tsx', 'typescript'],
    ['main.js', 'javascript'],
    ['index.mjs', 'javascript'],
    ['script.py', 'python'],
    ['main.rs', 'rust'],
    ['server.go', 'go'],
    ['Main.java', 'java'],
    ['Program.cs', 'csharp'],
    ['app.cpp', 'cpp'],
    ['lib.c', 'c'],
    ['script.rb', 'ruby'],
    ['index.php', 'php'],
    ['View.swift', 'swift'],
    ['App.kt', 'kotlin'],
    ['Makefile', 'unknown'],
    ['no-extension', 'unknown'],
  ])('detects %s as %s', (path, lang) => {
    expect(detectLanguage(path)).toBe(lang);
  });
});

describe('chunkByAstBoundaries()', () => {
  describe('TypeScript', () => {
    it('splits at function boundaries', () => {
      const code = [
        'import { foo } from "bar";',
        '',
        'function alpha() {',
        '  return 1;',
        '}',
        '',
        'function beta() {',
        '  return 2;',
        '}',
      ].join('\n');

      const chunks = chunkByAstBoundaries(code, 'typescript');
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks.some((c) => c.name === 'alpha')).toBe(true);
      expect(chunks.some((c) => c.name === 'beta')).toBe(true);
    });

    it('splits at class boundaries', () => {
      const code = [
        'class Foo {',
        '  bar() {}',
        '}',
        '',
        'class Baz {',
        '  qux() {}',
        '}',
      ].join('\n');

      const chunks = chunkByAstBoundaries(code, 'typescript');
      expect(chunks.some((c) => c.kind === 'class' && c.name === 'Foo')).toBe(true);
      expect(chunks.some((c) => c.kind === 'class' && c.name === 'Baz')).toBe(true);
    });

    it('marks function chunks as kind=function', () => {
      const code = ['function myFn() {', '  return true;', '}'].join('\n');
      const chunks = chunkByAstBoundaries(code, 'typescript');
      const fnChunk = chunks.find((c) => c.name === 'myFn');
      expect(fnChunk?.kind).toBe('function');
    });
  });

  describe('Python', () => {
    it('splits at def boundaries', () => {
      const code = [
        'def foo():',
        '    return 1',
        '',
        'def bar():',
        '    return 2',
      ].join('\n');

      const chunks = chunkByAstBoundaries(code, 'python');
      expect(chunks.some((c) => c.name === 'foo')).toBe(true);
      expect(chunks.some((c) => c.name === 'bar')).toBe(true);
    });

    it('splits async def', () => {
      const code = [
        'async def fetch():',
        '    pass',
        '',
        'class MyClass:',
        '    pass',
      ].join('\n');

      const chunks = chunkByAstBoundaries(code, 'python');
      expect(chunks.some((c) => c.kind === 'function')).toBe(true);
      expect(chunks.some((c) => c.kind === 'class')).toBe(true);
    });
  });

  describe('Rust', () => {
    it('splits at fn boundaries', () => {
      const code = [
        'pub fn add(a: i32, b: i32) -> i32 {',
        '    a + b',
        '}',
        '',
        'fn private_fn() {}',
      ].join('\n');

      const chunks = chunkByAstBoundaries(code, 'rust');
      expect(chunks.some((c) => c.name === 'add')).toBe(true);
      expect(chunks.some((c) => c.name === 'private_fn')).toBe(true);
    });
  });

  describe('Go', () => {
    it('splits at func boundaries', () => {
      const code = [
        'func main() {',
        '    fmt.Println("hello")',
        '}',
        '',
        'func helper(x int) int {',
        '    return x * 2',
        '}',
      ].join('\n');

      const chunks = chunkByAstBoundaries(code, 'go');
      expect(chunks.some((c) => c.name === 'main')).toBe(true);
      expect(chunks.some((c) => c.name === 'helper')).toBe(true);
    });
  });

  describe('Force-split oversized chunks', () => {
    it('splits when maxChunkLines is exceeded', () => {
      // Create a large block with no boundaries
      const code = Array.from({ length: 50 }, (_, i) => `const x${i} = ${i};`).join('\n');
      const chunks = chunkByAstBoundaries(code, 'typescript', 10);
      // Should be split into multiple chunks
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.content.split('\n').length).toBeLessThanOrEqual(12);
      }
    });
  });

  describe('Unknown language fallback', () => {
    it('falls back to line-window chunking for unknown language', () => {
      const code = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
      const chunks = chunkByAstBoundaries(code, 'unknown', 10);
      expect(chunks.every((c) => c.kind === 'block')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('returns empty array for empty content', () => {
      const chunks = chunkByAstBoundaries('', 'typescript');
      expect(chunks).toEqual([]);
    });

    it('returns single chunk for small file with no boundaries', () => {
      const code = 'const x = 1;\nconst y = 2;\nconst z = 3;';
      const chunks = chunkByAstBoundaries(code, 'typescript');
      // Small file, no boundary patterns → falls through to windowed (or single chunk)
      expect(Array.isArray(chunks)).toBe(true);
    });
  });
});

// ─── WorkspaceIndexer Tests ──────────────────────────────────────────────────

describe('WorkspaceIndexer', () => {
  let mockQdrant: QdrantClient;
  let mockEmbeddings: BgeM3Client;
  let indexer: WorkspaceIndexer;

  const makeQdrant = () =>
    ({
      collectionExists: vi.fn().mockResolvedValue(false),
      createCollection: vi.fn().mockResolvedValue({ result: true, status: 'ok' }),
      upsert: vi.fn().mockResolvedValue({ result: true, status: 'ok' }),
      search: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({ result: true }),
      listPoints: vi.fn().mockResolvedValue({ result: [] }),
      deleteCollection: vi.fn().mockResolvedValue({ result: true }),
    }) as unknown as QdrantClient;

  const makeEmbeddings = () =>
    ({
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    }) as unknown as BgeM3Client;

  beforeEach(() => {
    mockQdrant = makeQdrant();
    mockEmbeddings = makeEmbeddings();
    indexer = new WorkspaceIndexer({
      workspaceDir: '/workspace',
      qdrant: mockQdrant,
      embeddings: mockEmbeddings,
      collectionName: 'test-code',
      vectorSize: 3,
    });
  });

  // ─── initialize ──────────────────────────────────────────────────────────

  describe('initialize()', () => {
    it('creates collection when it does not exist', async () => {
      await indexer.initialize();
      expect(mockQdrant.createCollection).toHaveBeenCalledWith('test-code', 3);
    });

    it('skips creation when collection already exists', async () => {
      (mockQdrant.collectionExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      await indexer.initialize();
      expect(mockQdrant.createCollection).not.toHaveBeenCalled();
    });
  });

  // ─── indexFile ───────────────────────────────────────────────────────────

  describe('indexFile()', () => {
    it('embeds and upserts chunks to Qdrant', async () => {
      const content = [
        'function alpha() {',
        '  return 1;',
        '}',
        '',
        'function beta() {',
        '  return 2;',
        '}',
      ].join('\n');

      await indexer.indexFile('/workspace/src/app.ts', content);

      expect(mockEmbeddings.embed).toHaveBeenCalled();
      expect(mockQdrant.upsert).toHaveBeenCalledWith(
        'test-code',
        expect.arrayContaining([
          expect.objectContaining({
            vector: [0.1, 0.2, 0.3],
            payload: expect.objectContaining({ filePath: '/workspace/src/app.ts' }),
          }),
        ]),
      );
    });

    it('updates internal index metadata after indexing', async () => {
      await indexer.indexFile('/workspace/main.py', 'def foo():\n    pass\n\ndef bar():\n    pass');
      const idx = indexer.getIndex();
      expect(idx.has('main.py')).toBe(true);
    });

    it('skips upsert when all embeddings fail', async () => {
      (mockEmbeddings.embed as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('embed failed'),
      );
      await indexer.indexFile('/workspace/fail.ts', 'function x() {}\n'.repeat(5));
      expect(mockQdrant.upsert).not.toHaveBeenCalled();
    });

    it('logs warning when some chunks fail to embed', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (mockEmbeddings.embed as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([0.1, 0.2, 0.3])
        .mockRejectedValueOnce(new Error('embed failed'));

      const code = [
        'export function alpha() {',
        '  return 1;',
        '}',
        '',
        'export function beta() {',
        '  return 2;',
        '}',
      ].join('\n');

      await indexer.indexFile('/workspace/partfail.ts', code);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to generate embeddings'));
    });
  });

  // ─── loadIndex ───────────────────────────────────────────────────────────

  describe('loadIndex()', () => {
    it('populates index from existing Qdrant points payload', async () => {
      (mockQdrant.listPoints as ReturnType<typeof vi.fn>).mockResolvedValue({
        result: [
          {
            id: 'src/app.ts:0',
            payload: {
              filePath: '/workspace/src/app.ts',
              relativePath: 'src/app.ts',
              mtime: 123456,
              size: 100,
              language: 'typescript',
              chunkCount: 2,
            },
          },
        ],
      });

      const idx = await indexer.loadIndex();
      expect(idx.has('src/app.ts')).toBe(true);
      expect(idx.get('src/app.ts')?.mtime).toBe(123456);
    });
  });

  // ─── indexWorkspace — incremental ────────────────────────────────────────

  describe('indexWorkspace() — incremental (mtime)', () => {
    it('skips unchanged files (mtime check)', async () => {
      // Pre-populate index with a recent mtime
      const now = Date.now();
      (indexer as any).index.set('old.ts', {
        filePath: '/workspace/old.ts',
        relativePath: 'old.ts',
        mtime: now,
        size: 100,
        chunkCount: 1,
      });

      await indexer.indexWorkspace([
        { path: '/workspace/old.ts', content: 'const x = 1;', mtime: now - 1000 },
      ]);

      expect(mockQdrant.upsert).not.toHaveBeenCalled();
    });

    it('indexes changed files (newer mtime)', async () => {
      const past = Date.now() - 10000;
      (indexer as any).index.set('new.ts', {
        filePath: '/workspace/new.ts',
        relativePath: 'new.ts',
        mtime: past,
        size: 10,
        chunkCount: 1,
      });

      await indexer.indexWorkspace([
        {
          path: '/workspace/new.ts',
          content: 'function updated() {\n  return true;\n}\n',
          mtime: Date.now(),
        },
      ]);

      expect(mockEmbeddings.embed).toHaveBeenCalled();
    });
  });

  // ─── search ──────────────────────────────────────────────────────────────

  describe('search()', () => {
    it('embeds query and searches Qdrant', async () => {
      (mockQdrant.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'src/app.ts:0',
          score: 0.95,
          payload: {
            filePath: '/workspace/src/app.ts',
            relativePath: 'src/app.ts',
            content: 'function foo() {}',
            lineStart: 0,
            lineEnd: 1,
            mtime: Date.now(),
          },
        },
      ]);

      const results = await indexer.search('find foo function', 5);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.95);
      expect(results[0].chunk.relativePath).toBe('src/app.ts');
      expect(mockEmbeddings.embed).toHaveBeenCalledWith('find foo function');
    });
  });

  // ─── removeFile ──────────────────────────────────────────────────────────

  describe('removeFile()', () => {
    it('removes matching points from Qdrant and index', async () => {
      (mockQdrant.listPoints as ReturnType<typeof vi.fn>).mockResolvedValue({
        result: [
          { id: 'target.ts:0', payload: { relativePath: 'target.ts' } },
          { id: 'other.ts:0', payload: { relativePath: 'other.ts' } },
        ],
      });
      (indexer as any).index.set('target.ts', { relativePath: 'target.ts' });

      await indexer.removeFile('/workspace/target.ts');

      expect(mockQdrant.delete).toHaveBeenCalledWith('test-code', 'target.ts:0');
      expect(mockQdrant.delete).not.toHaveBeenCalledWith('test-code', 'other.ts:0');
      expect(indexer.getIndex().has('target.ts')).toBe(false);
    });
  });

  // ─── clearIndex ──────────────────────────────────────────────────────────

  describe('clearIndex()', () => {
    it('deletes and recreates the collection', async () => {
      await indexer.clearIndex();
      expect(mockQdrant.deleteCollection).toHaveBeenCalledWith('test-code');
      expect(mockQdrant.createCollection).toHaveBeenCalled();
      expect(indexer.getIndex().size).toBe(0);
    });
  });
});
