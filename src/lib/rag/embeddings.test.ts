// ─── bge-m3 Embeddings Client Unit Tests ────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BgeM3Client } from './embeddings';

const BASE_SETTINGS = {
  url: 'http://localhost:8081',
  model: 'bge-m3',
  timeout: 5000,
  batchSize: 3,
};

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.reject(new Error()),
    text: () => Promise.resolve('Bad request'),
  } as unknown as Response;
}

describe('BgeM3Client', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: BgeM3Client;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new BgeM3Client(BASE_SETTINGS);
  });

  // ─── health ──────────────────────────────────────────────────────────────

  describe('health()', () => {
    it('returns ok via /v1/models', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({ data: [{ id: 'bge-m3' }] }),
      );
      const result = await client.health();
      expect(result.status).toBe('ok');
      expect(result.model).toBe('bge-m3');
    });

    it('falls back to /health endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(404)) // /v1/models fails
        .mockResolvedValueOnce(okJson({ model: 'bge-m3' })); // /health succeeds

      const result = await client.health();
      expect(result.status).toBe('ok');
    });

    it('falls back to root / when both /v1/models and /health fail', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('ok') } as Response);

      const result = await client.health();
      expect(result.status).toBe('ok');
    });

    it('returns unavailable when all endpoints fail', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await client.health();
      expect(result.status).toBe('unavailable');
    });
  });

  // ─── embed — OpenAI compat ───────────────────────────────────────────────

  describe('embed() — OpenAI compatible', () => {
    it('returns vector from /v1/embeddings', async () => {
      const vector = [0.1, 0.2, 0.3];
      mockFetch.mockResolvedValueOnce(
        okJson({ data: [{ embedding: vector, index: 0 }] }),
      );
      const result = await client.embed('hello world');
      expect(result).toEqual(vector);
    });

    it('sends correct payload to /v1/embeddings', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({ data: [{ embedding: [0.1], index: 0 }] }),
      );
      await client.embed('test text');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1/embeddings');
      const body = JSON.parse(options.body);
      expect(body.model).toBe('bge-m3');
      expect(body.input).toBe('test text');
    });
  });

  // ─── embed — TEI fallback ────────────────────────────────────────────────

  describe('embed() — TEI fallback', () => {
    it('falls back to /embed when /v1/embeddings returns 404', async () => {
      const vector = [0.4, 0.5, 0.6];
      mockFetch
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce(okJson(vector)); // /embed returns bare array

      const result = await client.embed('test');
      expect(result).toEqual(vector);
    });

    it('handles nested array response from /embed', async () => {
      const vector = [0.1, 0.2];
      mockFetch
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce(okJson([vector])); // [[0.1, 0.2]]

      const result = await client.embed('test');
      expect(result).toEqual(vector);
    });

    it('handles { embeddings: [[...]] } response from /embed', async () => {
      const vector = [0.7, 0.8];
      mockFetch
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce(okJson({ embeddings: [vector] }));

      const result = await client.embed('test');
      expect(result).toEqual(vector);
    });

    it('throws on bge-m3 error status from /v1/embeddings', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      await expect(client.embed('fail')).rejects.toThrow('bge-m3 embed error 500');
    });

    it('throws when /embed returns unsupported structure', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce(okJson({ unexpected: 'format' }));

      await expect(client.embed('x')).rejects.toThrow('Unsupported embedding response');
    });
  });

  // ─── embedBatch ──────────────────────────────────────────────────────────

  describe('embedBatch()', () => {
    it('batches texts according to batchSize', async () => {
      const makeVec = (n: number) => Array.from({ length: 3 }, (_, i) => i + n * 0.1);
      const texts = ['a', 'b', 'c', 'd']; // batchSize=3 → 2 batches

      // First batch (3 items)
      mockFetch.mockResolvedValueOnce(
        okJson({
          data: [
            { embedding: makeVec(0), index: 0 },
            { embedding: makeVec(1), index: 1 },
            { embedding: makeVec(2), index: 2 },
          ],
        }),
      );
      // Second batch (1 item)
      mockFetch.mockResolvedValueOnce(
        okJson({
          data: [{ embedding: makeVec(3), index: 0 }],
        }),
      );

      const results = await client.embedBatch(texts);
      expect(results).toHaveLength(4);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns empty array for empty input', async () => {
      const results = await client.embedBatch([]);
      expect(results).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── testEmbedding ───────────────────────────────────────────────────────

  describe('testEmbedding()', () => {
    it('returns success with vectorSize on valid response', async () => {
      const vector = [0.1, 0.2, 0.3, 0.4];
      mockFetch.mockResolvedValueOnce(
        okJson({ data: [{ embedding: vector, index: 0 }] }),
      );
      const result = await client.testEmbedding();
      expect(result.success).toBe(true);
      expect(result.vectorSize).toBe(4);
    });

    it('returns failure with error message on exception', async () => {
      // Both /v1/embeddings and /embed fail
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'));
      const result = await client.testEmbedding();
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
});
