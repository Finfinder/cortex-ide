// ─── Qdrant Client Unit Tests ────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QdrantClient } from './qdrant';

const BASE_SETTINGS = {
  url: 'http://localhost:6333',
  timeout: 5000,
};

function makeOkResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: { get: () => 'application/json' },
  } as unknown as Response;
}

function makeErrorResponse(status: number, body = 'Error') {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.reject(new Error('Not JSON')),
    text: () => Promise.resolve(body),
    headers: { get: () => 'text/plain' },
  } as unknown as Response;
}

describe('QdrantClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: QdrantClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new QdrantClient(BASE_SETTINGS);
  });

  // ─── health ──────────────────────────────────────────────────────────────

  describe('health()', () => {
    it('returns ok when root endpoint responds with title', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ title: 'qdrant', version: '1.10.0' }),
      );
      const result = await client.health();
      expect(result.status).toBe('qdrant');
      expect(result.version).toBe('1.10.0');
    });

    it('falls back to /healthz when root fails', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('ok'),
          headers: { get: () => 'text/plain' },
        } as unknown as Response);

      const result = await client.health();
      expect(result.status).toBe('ok');
    });

    it('throws when both root and /healthz fail', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('root fail'))
        .mockResolvedValueOnce({ ok: false, status: 503 } as Response);

      await expect(client.health()).rejects.toThrow('Qdrant health check failed');
    });
  });

  // ─── listCollections ─────────────────────────────────────────────────────

  describe('listCollections()', () => {
    it('returns list of collection names', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ collections: ['code', 'docs'] }),
      );
      const result = await client.listCollections();
      expect(result.collections).toEqual(['code', 'docs']);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(500, 'Internal error'));
      await expect(client.listCollections()).rejects.toThrow('Qdrant API error 500');
    });
  });

  // ─── createCollection ────────────────────────────────────────────────────

  describe('createCollection()', () => {
    it('creates collection with default Cosine distance', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ result: true, status: 'ok' }),
      );
      const result = await client.createCollection('my-collection', 1024);
      expect(result.result).toBe(true);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.vectors.size).toBe(1024);
      expect(body.vectors.distance).toBe('Cosine');
    });

    it('creates collection with explicit distance', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ result: true, status: 'ok' }),
      );
      await client.createCollection('my-collection', 768, 'Dot');

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.vectors.distance).toBe('Dot');
    });
  });

  // ─── collectionExists ────────────────────────────────────────────────────

  describe('collectionExists()', () => {
    it('returns true when collection is in list', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ collections: ['code', 'docs'] }),
      );
      const exists = await client.collectionExists('code');
      expect(exists).toBe(true);
    });

    it('returns false when collection not found', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ collections: ['code'] }),
      );
      const exists = await client.collectionExists('missing');
      expect(exists).toBe(false);
    });

    it('returns false when listCollections throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'));
      const exists = await client.collectionExists('any');
      expect(exists).toBe(false);
    });
  });

  // ─── upsert ──────────────────────────────────────────────────────────────

  describe('upsert()', () => {
    it('sends PUT with correct payload', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ result: true, status: 'ok' }),
      );
      const points = [
        { id: 'abc', vector: [0.1, 0.2, 0.3], payload: { file: 'a.ts' } },
      ];
      await client.upsert('code', points);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/collections/code/points');
      expect(options.method).toBe('PUT');
      const body = JSON.parse(options.body);
      expect(body.points).toHaveLength(1);
      expect(body.points[0].id).toBe('abc');
    });
  });

  // ─── search ──────────────────────────────────────────────────────────────

  describe('search()', () => {
    it('returns search results sorted by score', async () => {
      const mockResults = [
        { id: '1', score: 0.9, payload: { content: 'hello' } },
        { id: '2', score: 0.7, payload: { content: 'world' } },
      ];
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ result: mockResults }),
      );

      const results = await client.search('code', [0.1, 0.2], 5);
      expect(results).toHaveLength(2);
      expect(results[0].score).toBe(0.9);
    });

    it('passes limit and params in body', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ result: [] }));
      await client.search('code', [0.1, 0.2], 10, { hnsw_ef: 128 });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.limit).toBe(10);
      expect(body.params?.hnsw_ef).toBe(128);
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('sends DELETE to correct URL', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ result: true }));
      await client.delete('code', 'point-123');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/points/point-123');
      expect(options.method).toBe('DELETE');
    });
  });

  // ─── deleteCollection ────────────────────────────────────────────────────

  describe('deleteCollection()', () => {
    it('sends DELETE to collection URL', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ result: true }));
      await client.deleteCollection('old-collection');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/collections/old-collection');
      expect(options.method).toBe('DELETE');
    });
  });

  // ─── API Key header ──────────────────────────────────────────────────────

  describe('API Key header', () => {
    it('adds Api-Key header when apiKey is set', async () => {
      const clientWithKey = new QdrantClient({
        ...BASE_SETTINGS,
        apiKey: 'secret-key',
      });
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ collections: [] }),
      );
      await clientWithKey.listCollections();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Api-Key']).toBe('secret-key');
    });

    it('does not add Api-Key header when apiKey is not set', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ collections: [] }));
      await client.listCollections();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Api-Key']).toBeUndefined();
    });
  });
});
