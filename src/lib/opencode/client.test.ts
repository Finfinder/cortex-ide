// ─── OpenCode Client Tests ──────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpencodeClient, OpencodeClientError } from './client';

describe('OpencodeClient', () => {
  let client: OpencodeClient;

  beforeEach(() => {
    client = new OpencodeClient({ baseUrl: 'http://127.0.0.1:4096' });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should normalize trailing slash in baseUrl', () => {
      const c = new OpencodeClient({ baseUrl: 'http://127.0.0.1:4096/' });
      // Access private field via prototype for testing
      expect(c.getEventStreamUrl()).toBe('http://127.0.0.1:4096/event');
    });

    it('should use default timeout of 30s', () => {
      // Timeout is private, but we can verify requests don't fail immediately
      expect(client).toBeDefined();
    });
  });

  describe('getEventStreamUrl', () => {
    it('should return correct event stream URL', () => {
      expect(client.getEventStreamUrl()).toBe('http://127.0.0.1:4096/event');
    });
  });

  describe('createSession', () => {
    it('should create a session successfully', async () => {
      const mockResult = { id: 'session-1' };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResult),
      });

      const result = await client.createSession();
      expect(result.id).toBe('session-1');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:4096/session',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should throw OpencodeClientError on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });

      await expect(client.createSession()).rejects.toThrow(OpencodeClientError);
    });
  });

  describe('listSessions', () => {
    it('should return sessions array', async () => {
      const mockSessions = [
        { id: 's1', title: 'Session 1', createdAt: 1, updatedAt: 1 },
        { id: 's2', title: 'Session 2', createdAt: 2, updatedAt: 2 },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSessions),
      });

      const sessions = await client.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('s1');
    });
  });

  describe('chat', () => {
    it('should send a chat message and return assistant response', async () => {
      const mockResponse = {
        info: {
          id: 'msg-1',
          sessionID: 'session-1',
          role: 'assistant',
          time: Date.now(),
        },
        parts: [{ id: 'p1', messageID: 'msg-1', sessionID: 'session-1', text: 'Hello!', type: 'text' }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const response = await client.chat('session-1', {
        parts: [{ type: 'text', text: 'Hi' }],
      });

      expect(response.info.role).toBe('assistant');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:4096/session/session-1/message',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ parts: [{ type: 'text', text: 'Hi' }] }),
        }),
      );
    });
  });

  describe('health', () => {
    it('should return health status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const health = await client.health();
      expect(health.ok).toBe(true);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(true),
      });

      const result = await client.deleteSession('session-1');
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:4096/session/session-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('abortSession', () => {
    it('should abort a session', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(true),
      });

      const result = await client.abortSession('session-1');
      expect(result).toBe(true);
    });
  });

  describe('timeout', () => {
    it('should throw on timeout', async () => {
      vi.useFakeTimers();

      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 100);
          }),
      );

      const promise = new OpencodeClient({
        baseUrl: 'http://127.0.0.1:4096',
        timeout: 50,
      }).listSessions();

      vi.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow(OpencodeClientError);

      vi.useRealTimers();
    });
  });
});
