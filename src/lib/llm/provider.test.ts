// ─── LLM Provider Unit Tests ────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmProvider } from './provider';
import type { LlmSettings } from '../settings';

const BASE_SETTINGS: LlmSettings = {
  url: 'http://localhost:8080',
  model: 'test-model',
  provider: 'llama.cpp',
  timeout: 5000,
  extraHeaders: {},
  extraParams: {},
};

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    body: null,
  } as unknown as Response;
}

function errorResponse(status: number, body = 'Error') {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.reject(new Error()),
    text: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('LlmProvider', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let provider: LlmProvider;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    provider = new LlmProvider(BASE_SETTINGS);
  });

  // ─── health ──────────────────────────────────────────────────────────────

  describe('health()', () => {
    it('returns available via /health endpoint (JSON)', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({ status: 'available', model: 'test-model' }),
      );
      const result = await provider.health();
      expect(result.status).toBe('available');
      expect(result.provider).toBe('llama.cpp');
    });

    it('falls back to /v1/models when /health returns 404', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce(okJson({ data: [{ id: 'llama3' }] }));

      const result = await provider.health();
      expect(result.status).toBe('available');
      expect(result.model).toBe('llama3');
    });

    it('returns unavailable when both /health and /v1/models fail', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce(errorResponse(503));

      const result = await provider.health();
      expect(result.status).toBe('unavailable');
    });

    it('handles opencode provider via /health', async () => {
      const ocProvider = new LlmProvider({
        ...BASE_SETTINGS,
        provider: 'opencode',
        url: 'http://127.0.0.1:4096',
      });
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);
      const result = await ocProvider.health();
      expect(result.status).toBe('available');
      expect(result.provider).toBe('opencode');
    });
  });

  // ─── chatCompletion ──────────────────────────────────────────────────────

  describe('chatCompletion()', () => {
    it('sends POST to /v1/chat/completions', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        model: 'test-model',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finishReason: 'stop' }],
      };
      mockFetch.mockResolvedValueOnce(okJson(mockResponse));

      const result = await provider.chatCompletion({
        messages: [{ role: 'user', content: 'Hi' }],
      });
      expect(result.choices[0].message.content).toBe('Hello!');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1/chat/completions');
      expect(options.method).toBe('POST');
    });

    it('throws on API error response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(429, 'Rate limited'));
      await expect(
        provider.chatCompletion({ messages: [{ role: 'user', content: 'test' }] }),
      ).rejects.toThrow('LLM API error 429');
    });

    it('merges extraParams from settings', async () => {
      const providerWithExtra = new LlmProvider({
        ...BASE_SETTINGS,
        extraParams: { top_p: 0.9 },
      });
      mockFetch.mockResolvedValueOnce(
        okJson({ id: '1', model: 'm', choices: [] }),
      );
      await providerWithExtra.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.top_p).toBe(0.9);
    });
  });

  // ─── listModels ──────────────────────────────────────────────────────────

  describe('listModels()', () => {
    it('returns model list from /v1/models', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({ data: [{ id: 'llama3', name: 'Llama 3' }, { id: 'mistral' }] }),
      );
      const models = await provider.listModels();
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('llama3');
    });

    it('returns empty array on error response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      const models = await provider.listModels();
      expect(models).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const models = await provider.listModels();
      expect(models).toEqual([]);
    });

    it('returns empty array when response is not JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
      } as unknown as Response);
      const models = await provider.listModels();
      expect(models).toEqual([]);
    });
  });

  // ─── testConnection ──────────────────────────────────────────────────────

  describe('testConnection()', () => {
    it('returns success when health says available', async () => {
      // llama.cpp: /health returns 404 → fallback to /v1/models → available
      mockFetch
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce(okJson({ data: [{ id: 'test-model' }] }));
      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });

    it('returns failure when service unavailable', async () => {
      // /health → 404, /v1/models → 503
      mockFetch
        .mockResolvedValueOnce(errorResponse(404))
        .mockResolvedValueOnce(errorResponse(503));
      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // ─── auth headers ────────────────────────────────────────────────────────

  describe('auth headers', () => {
    it('adds Bearer token for openrouter', async () => {
      const p = new LlmProvider({
        ...BASE_SETTINGS,
        provider: 'openrouter',
        apiKey: 'sk-or-test',
        url: 'https://openrouter.ai/api/v1',
      });
      mockFetch.mockResolvedValueOnce(okJson({ data: [] }));
      await p.listModels();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer sk-or-test');
      expect(options.headers['HTTP-Referer']).toBeTruthy();
    });

    it('adds x-api-key for anthropic', async () => {
      const p = new LlmProvider({
        ...BASE_SETTINGS,
        provider: 'anthropic',
        apiKey: 'ant-key',
      });
      mockFetch.mockResolvedValueOnce(okJson({ data: [] }));
      await p.listModels();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['x-api-key']).toBe('ant-key');
      expect(options.headers['anthropic-version']).toBeTruthy();
    });

    it('adds Bearer token for llama.cpp', async () => {
      const p = new LlmProvider({ ...BASE_SETTINGS, apiKey: 'local-key' });
      mockFetch.mockResolvedValueOnce(okJson({ data: [] }));
      await p.listModels();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer local-key');
    });

    it('adds no auth headers when apiKey is empty', async () => {
      const p = new LlmProvider({ ...BASE_SETTINGS, apiKey: '' });
      mockFetch.mockResolvedValueOnce(okJson({ data: [] }));
      await p.listModels();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });
  });

  // ─── getEndpoint — /v1 dedup ─────────────────────────────────────────────

  describe('getEndpoint() — /v1 deduplication', () => {
    it('does not duplicate /v1 prefix', async () => {
      const p = new LlmProvider({ ...BASE_SETTINGS, url: 'http://localhost:8080/v1' });
      mockFetch.mockResolvedValueOnce(okJson({ data: [] }));
      await p.listModels();

      const [url] = mockFetch.mock.calls[0];
      expect(url).not.toContain('/v1/v1');
      expect(url).toContain('/v1/models');
    });
  });

  // ─── updateSettings ──────────────────────────────────────────────────────

  describe('updateSettings()', () => {
    it('updates model and reflects in next request', async () => {
      provider.updateSettings({ model: 'new-model' });
      expect(provider.getSettings().model).toBe('new-model');
    });
  });
});
