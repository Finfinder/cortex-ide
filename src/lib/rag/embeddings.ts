// ─── bge-m3 Embeddings Client ───────────────────────────────────────────────
// HTTP client for bge-m3 / OpenAI compatible embedding model endpoints.
// Supports both OpenAI compatible (/v1/embeddings) and custom (/embed) APIs.

import type { BgeM3Settings } from '../settings';
import { validateUrl } from '../utils/urlValidator';
import { checkEndpointHealth } from '../utils/healthCheck';

export interface EmbedResponse {
  data?: Array<{ embedding: number[]; index?: number }>;
  embeddings?: number[][];
  model?: string;
}

export class BgeM3Client {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeout: number;
  private readonly batchSize: number;
  private activeAbortControllers: Set<AbortController> = new Set();

  constructor(settings: BgeM3Settings) {
    // SEC-3: Validate base URL against SSRF
    this.baseUrl = validateUrl(settings.url).replace(/\/+$/, '');
    this.model = settings.model;
    this.timeout = settings.timeout;
    this.batchSize = settings.batchSize;
  }

  private createSignal(): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    this.activeAbortControllers.add(controller);
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeoutId);
        this.activeAbortControllers.delete(controller);
      },
    };
  }

  /** Check if embedding service is available (SMELL-1). */
  async health(): Promise<{ status: string; model?: string }> {
    const v1Models = await checkEndpointHealth(this.baseUrl, '/v1/models', { timeoutMs: this.timeout });
    if (v1Models.status === 'ok') {
      return { status: 'ok', model: v1Models.model || this.model };
    }

    const healthz = await checkEndpointHealth(this.baseUrl, '/health', { timeoutMs: this.timeout });
    if (healthz.status === 'ok') {
      return { status: 'ok', model: healthz.model || this.model };
    }

    const root = await checkEndpointHealth(this.baseUrl, '/', { timeoutMs: this.timeout });
    if (root.status === 'ok') {
      return { status: 'ok', model: this.model };
    }

    return { status: 'unavailable' };
  }

  /** Embed a single text into a vector. */
  async embed(text: string): Promise<number[]> {
    const { signal, cleanup } = this.createSignal();

    try {
      // 1. Try primary /v1/embeddings endpoint
      try {
        const url = validateUrl(`${this.baseUrl}/v1/embeddings`);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            input: text,
          }),
          signal,
        });

        if (response.ok) {
          const data: EmbedResponse = await response.json();
          if (data.data && data.data.length > 0 && Array.isArray(data.data[0].embedding)) {
            return data.data[0].embedding;
          }
        } else if (response.status !== 404) {
          const error = await response.text().catch(() => response.statusText);
          throw new Error(`bge-m3 embed error ${response.status}: ${error}`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('bge-m3 embed error')) {
          throw err;
        }
      }

      // 2. Fallback to /embed using the same signal (no double AbortController)
      const url = validateUrl(`${this.baseUrl}/embed`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          text,
          inputs: text,
        }),
        signal,
      });

      if (!response.ok) {
        const error = await response.text().catch(() => response.statusText);
        throw new Error(`bge-m3 embed error ${response.status}: ${error}`);
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        return Array.isArray(data[0]) ? data[0] : data;
      }
      if (data.embeddings && Array.isArray(data.embeddings[0])) {
        return data.embeddings[0];
      }
      if (data.data && Array.isArray(data.data[0]?.embedding)) {
        return data.data[0].embedding;
      }

      throw new Error('Unsupported embedding response structure');
    } finally {
      cleanup();
    }
  }

  /** Embed multiple texts in batches (respects batchSize - ERR-1: logs batch failures). */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const { signal, cleanup } = this.createSignal();

      try {
        let batchDone = false;
        try {
          const url = validateUrl(`${this.baseUrl}/v1/embeddings`);
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: this.model,
              input: batch,
            }),
            signal,
          });

          if (response.ok) {
            const data: EmbedResponse = await response.json();
            if (data.data && data.data.length > 0) {
              const sorted = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
              allEmbeddings.push(...sorted.map((item) => item.embedding));
              batchDone = true;
            }
          }
        } catch (err) {
          console.error('[Embeddings] Batch embedding /v1/embeddings error:', err);
        }

        if (batchDone) {
          continue;
        }

        // Try custom /embed-batch using same signal
        try {
          const url = validateUrl(`${this.baseUrl}/embed-batch`);
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: this.model,
              texts: batch,
            }),
            signal,
          });

          if (response.ok) {
            const data: EmbedResponse = await response.json();
            if (data.embeddings) {
              allEmbeddings.push(...data.embeddings);
              batchDone = true;
            }
          }
        } catch (err) {
          console.error('[Embeddings] Batch embedding /embed-batch error:', err);
        }

        if (batchDone) {
          continue;
        }
      } finally {
        cleanup();
      }

      // Fallback: embed individually
      for (const text of batch) {
        const embedding = await this.embed(text);
        allEmbeddings.push(embedding);
      }
    }

    return allEmbeddings;
  }

  /** Test embedding with a sample text. */
  async testEmbedding(): Promise<{ success: boolean; vectorSize?: number; error?: string }> {
    try {
      const vector = await this.embed('test embedding');
      return { success: true, vectorSize: vector.length };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /** RES-2: Abort pending fetch requests and clean up controllers. */
  dispose(): void {
    for (const controller of this.activeAbortControllers) {
      controller.abort();
    }
    this.activeAbortControllers.clear();
  }
}
