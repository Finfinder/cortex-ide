// ─── Workspace Indexer ──────────────────────────────────────────────────────
// Index workspace files using AST-boundary chunking and Qdrant storage.
// Chunks are split at function/class/module boundaries per language.
// Supports incremental reindex via file watcher and mtime check.
// Hardened against Path Traversal vulnerabilities (SEC-4).

import { resolve, relative } from 'node:path';
import { QdrantClient, type Point } from './qdrant';
import { BgeM3Client } from './embeddings';
import { chunkByAstBoundaries, detectLanguage } from './chunker';

export interface Chunk {
  id: string;
  filePath: string;
  relativePath: string;
  content: string;
  language?: string;
  lineStart: number;
  lineEnd: number;
  mtime: number;
  vector?: number[];
}

export interface IndexMetadata {
  filePath: string;
  relativePath: string;
  mtime: number;
  size: number;
  language?: string;
  chunkCount: number;
}

export interface IndexerConfig {
  workspaceDir: string;
  qdrant: QdrantClient;
  embeddings: BgeM3Client;
  collectionName: string;
  vectorSize: number;
  chunkSize?: number;
  chunkOverlap?: number;
  maxConcurrentEmbeddings?: number;
}

/** SEC-4: Canonicalize path and verify workspace boundary */
export function getSafeRelativePath(filePath: string, workspaceDir: string): string {
  const absWorkspace = resolve(workspaceDir);
  const absFilePath = resolve(filePath);

  // Check path traversal escape attempt
  const rel = relative(absWorkspace, absFilePath);
  if (rel.startsWith('..') || rel.includes(`..\\`) || rel.includes(`../`)) {
    throw new Error(`Path Traversal detected: "${filePath}" is outside workspace "${workspaceDir}"`);
  }

  return rel.replace(/\\/g, '/');
}

export class WorkspaceIndexer {
  private readonly config: IndexerConfig;
  private index: Map<string, IndexMetadata> = new Map();

  constructor(config: IndexerConfig) {
    this.config = {
      chunkSize: config.chunkSize || 512,
      chunkOverlap: config.chunkOverlap || 50,
      maxConcurrentEmbeddings: config.maxConcurrentEmbeddings || 5,
      ...config,
    };
  }

  /** Initialize the index collection in Qdrant. */
  async initialize(): Promise<void> {
    const exists = await this.config.qdrant.collectionExists(this.config.collectionName);
    if (!exists) {
      await this.config.qdrant.createCollection(
        this.config.collectionName,
        this.config.vectorSize,
      );
    }
  }

  /** Load existing index metadata from Qdrant payload. */
  async loadIndex(): Promise<Map<string, IndexMetadata>> {
    const { result: points } = await this.config.qdrant.listPoints(this.config.collectionName);
    const index = new Map<string, IndexMetadata>();

    for (const point of points) {
      if (point.payload?.relativePath && point.payload?.mtime) {
        index.set(point.payload.relativePath as string, {
          filePath: point.payload.filePath as string,
          relativePath: point.payload.relativePath as string,
          mtime: point.payload.mtime as number,
          size: point.payload.size as number,
          language: point.payload.language as string,
          chunkCount: (point.payload.chunkCount as number) || 1,
        });
      }
    }

    this.index = index;
    return index;
  }

  /** Get the current index. */
  getIndex(): Map<string, IndexMetadata> {
    return this.index;
  }

  /**
   * Chunk a file's content using AST-boundary detection.
   * Hardened with safe path resolution (SEC-4).
   */
  private chunkContent(content: string, filePath: string, language?: string): Chunk[] {
    const detectedLang = detectLanguage(filePath);
    const maxLines = Math.max(10, Math.floor((this.config.chunkSize ?? 512) / 4));
    const astChunks = chunkByAstBoundaries(content, detectedLang, maxLines);
    const relativePath = getSafeRelativePath(filePath, this.config.workspaceDir);
    const now = Date.now();

    return astChunks.map((c) => ({
      id: `${relativePath}:${c.lineStart}`,
      filePath,
      relativePath,
      content: c.content,
      language: language ?? detectedLang,
      lineStart: c.lineStart,
      lineEnd: c.lineEnd,
      mtime: now,
    }));
  }

  /** Index a single file (embed + upsert to Qdrant). */
  async indexFile(filePath: string, content: string, language?: string): Promise<Chunk[]> {
    const relativePath = getSafeRelativePath(filePath, this.config.workspaceDir);
    const chunks = this.chunkContent(content, filePath, language);

    // Embed chunks in batches
    const embeddingPromises = chunks.map((chunk) =>
      this.embedChunk(chunk).catch((error) => {
        console.error(`[Indexer] Failed to embed ${chunk.id}:`, error);
        return chunk;
      }),
    );

    const embeddedChunks = await Promise.all(embeddingPromises);

    const failedCount = embeddedChunks.filter((chunk) => !chunk.vector).length;
    if (failedCount > 0) {
      console.warn(
        `[Indexer] Failed to generate embeddings for ${failedCount}/${chunks.length} chunks in "${relativePath}"`,
      );
    }

    // Upsert to Qdrant
    const points: Point[] = embeddedChunks
      .filter((chunk) => chunk.vector)
      .map((chunk) => ({
        id: chunk.id,
        vector: chunk.vector!,
        payload: {
          filePath: chunk.filePath,
          relativePath: chunk.relativePath,
          content: chunk.content,
          language: chunk.language,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          mtime: chunk.mtime,
          size: chunk.content.length,
          chunkCount: chunks.length,
        },
      }));

    if (points.length > 0) {
      await this.config.qdrant.upsert(this.config.collectionName, points);
    }

    // Update index metadata
    this.index.set(relativePath, {
      filePath,
      relativePath,
      mtime: Date.now(),
      size: content.length,
      language,
      chunkCount: chunks.length,
    });

    return embeddedChunks;
  }

  /** Embed a single chunk with concurrency control. */
  private async embedChunk(chunk: Chunk): Promise<Chunk> {
    try {
      const vector = await this.config.embeddings.embed(chunk.content);
      return { ...chunk, vector };
    } catch (error) {
      console.error(`[Indexer] Embed failed for ${chunk.id}:`, error);
      return chunk;
    }
  }

  /** Index all files in workspace (incremental). */
  async indexWorkspace(
    files: Array<{ path: string; content: string; language?: string; mtime?: number }>,
  ): Promise<Map<string, Chunk[]>> {
    const results = new Map<string, Chunk[]>();

    for (const file of files) {
      const relativePath = getSafeRelativePath(file.path, this.config.workspaceDir);
      const existing = this.index.get(relativePath);

      // Skip unchanged files (mtime check)
      const fileMtime = file.mtime ?? Date.now();
      if (existing && existing.mtime >= fileMtime) {
        continue;
      }

      const chunks = await this.indexFile(file.path, file.content, file.language);
      results.set(relativePath, chunks);
    }

    return results;
  }

  /** Search indexed workspace. */
  async search(query: string, limit: number = 10): Promise<Array<{ chunk: Chunk; score: number }>> {
    const vector = await this.config.embeddings.embed(query);
    const results = await this.config.qdrant.search(this.config.collectionName, vector, limit);

    return results.map((result) => ({
      chunk: {
        id: result.id as string,
        filePath: result.payload?.filePath as string,
        relativePath: result.payload?.relativePath as string,
        content: result.payload?.content as string,
        language: result.payload?.language as string,
        lineStart: result.payload?.lineStart as number,
        lineEnd: result.payload?.lineEnd as number,
        mtime: result.payload?.mtime as number,
      },
      score: result.score,
    }));
  }

  /** Remove a file from the index. */
  async removeFile(filePath: string): Promise<void> {
    const relativePath = getSafeRelativePath(filePath, this.config.workspaceDir);
    const { result: points } = await this.config.qdrant.listPoints(this.config.collectionName);

    const toDelete = points.filter((p) => p.payload?.relativePath === relativePath);
    for (const point of toDelete) {
      await this.config.qdrant.delete(this.config.collectionName, point.id);
    }

    this.index.delete(relativePath);
  }

  /** Clear the entire index. */
  async clearIndex(): Promise<void> {
    await this.config.qdrant.deleteCollection(this.config.collectionName);
    await this.initialize();
    this.index.clear();
  }
}
