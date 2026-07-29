import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QdrantClient } from './rag/qdrant';
import { BgeM3Client } from './rag/embeddings';
import { OpencodeEventStream, parseSseBuffer } from './opencode/sse';
import { OpencodeClient } from './opencode/client';
import { LlmProvider } from './llm/provider';
import { validateUrl } from './utils/urlValidator';

describe('Audit Fixes & Verification Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Dispose cleanup test
  it('1. should clean up active abort controllers on dispose() for QdrantClient and BgeM3Client', () => {
    const qdrant = new QdrantClient({
      url: 'http://localhost:6333',
      timeout: 5000,
    });
    const bge = new BgeM3Client({
      url: 'http://localhost:8081',
      model: 'bge-m3',
      timeout: 5000,
      batchSize: 10,
    });

    expect(() => qdrant.dispose()).not.toThrow();
    expect(() => bge.dispose()).not.toThrow();
  });

  // 2. SSE error path test
  it('2. should handle SSE connection error and update status to error', async () => {
    const statusChanges: string[] = [];
    const stream = new OpencodeEventStream({
      url: 'http://127.0.0.1:4096/event',
      onEvent: () => {},
      onStatusChange: (status) => statusChanges.push(status),
      maxReconnectAttempts: 0,
      reconnectDelay: 10,
    });

    // Mock fetch to simulate failure
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    stream.connect();

    // Wait for async connect
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(statusChanges).toContain('connecting');
    expect(statusChanges).toContain('error');
    stream.disconnect();
  });

  // 3. Malformed response handling in SSE
  it('3. should handle malformed JSON gracefully in parseSseBuffer', () => {
    const rawBuffer = 'event: message.updated\ndata: { malformed json }\n\nevent: message.updated\ndata: {"properties":{"id":"123"}}\n\n';
    const result = parseSseBuffer(rawBuffer);

    expect(result.events.length).toBe(1);
    expect(result.events[0].properties).toEqual({ id: '123' });
    expect(result.remaining).toBe('');
  });

  // 4. SSRF & Path Traversal Edge Cases in validateUrl and OpencodeClient
  it('4. should reject metadata IPs and non-HTTP protocols in validateUrl', () => {
    expect(() => validateUrl('http://169.254.169.254/latest/meta-data')).toThrow();
    expect(() => validateUrl('ftp://example.com')).toThrow();
    expect(() => validateUrl('file:///etc/passwd')).toThrow();
    expect(() => validateUrl('gopher://example.com')).toThrow();

    expect(() => new OpencodeClient({ baseUrl: 'http://169.254.169.254' })).toThrow();
  });

  // 5. Anthropic provider header test (SEC-H3)
  it('5. should set x-api-key and anthropic-version for Anthropic provider without Bearer token', async () => {
    const provider = new LlmProvider({
      url: 'https://api.anthropic.com',
      provider: 'anthropic',
      apiKey: 'sk-ant-test12345',
      model: 'claude-3-5-sonnet',
      timeout: 5000,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
    } as Response);

    await provider.chatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(fetchSpy).toHaveBeenCalled();
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test12345');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['Authorization']).toBeUndefined();
  });

  // 6. URL encoding test in listPoints() (BUG-1)
  it('6. should correctly encode special characters in listPoints() and Qdrant endpoints', async () => {
    const client = new QdrantClient({
      url: 'http://localhost:6333',
      timeout: 5000,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: [] }),
    } as Response);

    await client.listPoints('my/special collection', 'offset/123?foo=bar', 50);

    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/collections/my%2Fspecial%20collection/points');
    expect(calledUrl).toContain('offset=offset%2F123%3Ffoo%3Dbar');
    expect(calledUrl).toContain('limit=50');
  });
});
