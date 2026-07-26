// ─── OpenCode SDK HTTP Client ───────────────────────────────────────────────
// Type-safe fetch wrapper for the OpenCode REST API.
// Endpoints: /session, /session/:id/message, /session/:id/abort, /health

import type {
  Session,
  SessionListResponse,
  SessionDeleteResponse,
  SessionAbortResponse,
  ChatResponse,
  ChatMessage,
  MessageListResponse,
} from './types';

/** Configuration for the OpenCode HTTP client. */
export interface ClientConfig {
  /** Base URL of the OpenCode server (e.g., "http://127.0.0.1:4096") */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** AbortSignal for cancelling requests */
  signal?: AbortSignal;
}

/** Error thrown by the OpenCode client. */
export class OpencodeClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'OpencodeClientError';
  }
}

/**
 * Type-safe HTTP client for the OpenCode SDK server.
 *
 * Usage:
 * ```ts
 * const client = new OpencodeClient({ baseUrl: 'http://127.0.0.1:4096' });
 * const sessions = await client.listSessions();
 * const session = await client.createSession();
 * const response = await client.chat(session.id, { parts: [{ type: 'text', text: 'Hello' }] });
 * ```
 */
export class OpencodeClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly signal?: AbortSignal;

  constructor(config: ClientConfig) {
    // Normalize base URL (remove trailing slash)
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeout = config.timeout ?? 30_000;
    this.signal = config.signal;
  }

  // ─── Session Endpoints ──────────────────────────────────────────────────

  /** Create a new session. Returns just the session id. */
  async createSession(): Promise<{ id: string }> {
    return this.post<{ id: string }>('/session');
  }

  /** List all sessions. */
  async listSessions(): Promise<Session[]> {
    return this.get<SessionListResponse>('/session');
  }

  /** Get a specific session by ID. */
  async getSession(id: string): Promise<Session> {
    return this.get<Session>(`/session/${id}`);
  }

  /** Delete a session. Returns true on success. */
  async deleteSession(id: string): Promise<boolean> {
    return this.delete<SessionDeleteResponse>(`/session/${id}`);
  }

  /** Abort an ongoing operation in a session. Returns true on success. */
  async abortSession(id: string): Promise<boolean> {
    return this.post<SessionAbortResponse>(`/session/${id}/abort`);
  }

  /** Get messages for a session. */
  async getMessages(id: string): Promise<MessageListResponse> {
    return this.get<MessageListResponse>(`/session/${id}/message`);
  }

  /** Send a chat message to a session. */
  async chat(id: string, message: ChatMessage): Promise<ChatResponse> {
    return this.post<ChatResponse>(`/session/${id}/message`, message);
  }

  // ─── Health ─────────────────────────────────────────────────────────────

  /** Check server health. The /health endpoint returns HTML, so we just check if the server responds. */
  async health(): Promise<{ ok: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: this.signal,
      });
      return { ok: response.ok };
    } catch {
      return { ok: false };
    }
  }

  // ─── Event Stream URL ───────────────────────────────────────────────────

  /** Get the URL for the SSE event stream. */
  getEventStreamUrl(): string {
    return `${this.baseUrl}/event`;
  }

  // ─── Internal HTTP Methods ──────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Combine external signal with timeout signal
    const signal = this.signal
      ? combineSignals(this.signal, controller.signal)
      : controller.signal;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new OpencodeClientError(
          `OpenCode API error: ${response.status} ${response.statusText}`,
          response.status,
          text,
        );
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof OpencodeClientError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new OpencodeClientError('Request timed out or was aborted');
      }

      throw new OpencodeClientError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

/**
 * Combine two AbortSignals so that either one aborting triggers the combined signal.
 */
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    });
  }

  return controller.signal;
}
