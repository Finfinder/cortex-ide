// ─── OpenCode SSE Event Stream ──────────────────────────────────────────────
// SSE (Server-Sent Events) streaming client for the OpenCode /event endpoint.
// Uses fetch + ReadableStream for cross-platform compatibility (no EventSource in Tauri WebView).

import type { OpencodeEvent, EventType } from './types';
import { validateUrl } from '../utils/urlValidator';

/** Callback for SSE events. */
export type EventCallback = (event: OpencodeEvent) => void;

/** Callback for connection status changes. */
export type StatusCallback = (status: SseStatus) => void;

/** Connection status of the SSE stream. */
export type SseStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Configuration for the SSE stream. */
export interface SseConfig {
  /** URL of the SSE endpoint (e.g., "http://127.0.0.1:4096/event") */
  url: string;
  /** Callback for each parsed event */
  onEvent: EventCallback;
  /** Callback for connection status changes */
  onStatusChange?: StatusCallback;
  /** Reconnect delay in milliseconds (default: 3000) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts (default: Infinity) */
  maxReconnectAttempts?: number;
  /** AbortSignal for external cancellation */
  signal?: AbortSignal;
}

/**
 * SSE stream manager for the OpenCode event endpoint.
 *
 * Handles:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Event parsing (SSE protocol: `event:`, `data:`, `id:`)
 * - Automatic reconnection with configurable delay
 * - Status callbacks for UI indicators
 *
 * Usage:
 * ```ts
 * const stream = new OpencodeEventStream({
 *   url: 'http://127.0.0.1:4096/event',
 *   onEvent: (event) => console.log(event.type, event.properties),
 *   onStatusChange: (status) => console.log('SSE:', status),
 * });
 * stream.connect();
 * // later:
 * stream.disconnect();
 * ```
 */
export class OpencodeEventStream {
  private readonly config: Required<Omit<SseConfig, 'signal'>> & Pick<SseConfig, 'signal'>;
  private abortController: AbortController | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: SseStatus = 'disconnected';
  /** When true, errors during reconnect won't change status to 'error' (silent mode). */
  private _silentReconnect = false;

  constructor(config: SseConfig) {
    this.config = {
      url: config.url,
      onEvent: config.onEvent,
      onStatusChange: config.onStatusChange ?? (() => {}),
      reconnectDelay: config.reconnectDelay ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? Infinity,
      signal: config.signal,
    };
  }

  /** Current connection status. */
  get status(): SseStatus {
    return this._status;
  }

  /** Number of reconnect attempts since last successful connection. */
  get reconnectCount(): number {
    return this.reconnectAttempts;
  }

  /** Start the SSE connection. */
  connect(): void {
    if (this._status === 'connecting' || this._status === 'connected') {
      return;
    }
    this.startConnection();
  }

  /** Disconnect and stop reconnection attempts. */
  disconnect(): void {
    this.clearReconnectTimer();
    this.abortController?.abort();
    this.abortController = null;
    this.reconnectAttempts = 0;
    this._silentReconnect = false;
    this.setStatus('disconnected');
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private setStatus(status: SseStatus): void {
    if (this._status !== status) {
      if (status === 'error') {
        console.trace('[SSE] setStatus -> error (prev:', this._status, ')');
      }
      this._status = status;
      this.config.onStatusChange(status);
    }
  }

  private async startConnection(silent = false): Promise<void> {
    // Only show 'connecting' status on initial connect or after an error.
    // Silent reconnects (stream ended normally) keep the 'connected' status
    // to avoid UI flicker during the brief reconnection gap.
    if (!silent || this._status !== 'connected') {
      this.setStatus('connecting');
    }

    this.abortController?.abort();
    this.abortController = new AbortController();

    // Combine with external signal if provided
    const signal = this.config.signal
      ? combineSignals(this.config.signal, this.abortController.signal)
      : this.abortController.signal;

    try {
      const url = validateUrl(this.config.url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('SSE response has no readable body');
      }

      this.setStatus('connected');
      this.reconnectAttempts = 0;
      this._silentReconnect = false;

      await this.readStream(response.body, signal);
    } catch (error) {
      if (signal.aborted) {
        // Intentional disconnect, don't reconnect
        return;
      }
      console.error('[SSE] Connection error:', error);

      // During silent reconnect, don't show error status to avoid UI flicker
      if (!this._silentReconnect) {
        this.setStatus('error');
      }
      this.scheduleReconnect(this._silentReconnect);
    }
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Stream ended normally — OpenCode closes the SSE connection after
          // sending events (HTTP/1.1 without persistent keep-alive). This is
          // expected behavior, NOT an error. Reconnect silently without
          // changing the status to 'disconnected' to avoid UI flicker.
          console.debug('[SSE] Stream ended normally, reconnecting silently');
          this.scheduleReconnect(true);
          return;
        }

        if (signal.aborted) {
          reader.cancel();
          return;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.debug('[SSE] Raw chunk:', JSON.stringify(chunk.substring(0, 200)));
        buffer += chunk;

        // Parse complete SSE messages from buffer
        const { events, remaining } = parseSseBuffer(buffer);
        buffer = remaining;

        if (events.length > 0) {
          console.log(`[SSE] Parsed ${events.length} event(s)`);
        }

        for (const event of events) {
          this.config.onEvent(event);
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        console.error('[SSE] Read error:', error);
        if (!this._silentReconnect) {
          this.setStatus('error');
        }
        this.scheduleReconnect(this._silentReconnect);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private scheduleReconnect(silent = false): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setStatus('disconnected');
      this._silentReconnect = false;
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay;
    this._silentReconnect = silent;

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startConnection(silent);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ─── SSE Parser ────────────────────────────────────────────────────────────

interface ParsedSseResult {
  events: OpencodeEvent[];
  remaining: string;
}

/**
 * Parse a buffer of SSE text into individual events.
 *
 * SSE format:
 * ```
 * event: message.updated
 * data: {"properties":{"info":{...}}}
 *
 * ```
 *
 * Returns parsed events and any remaining incomplete data.
 */
export function parseSseBuffer(buffer: string): ParsedSseResult {
  const events: OpencodeEvent[] = [];
  let remaining = buffer;

  // Split on double newline (event boundary)
  while (true) {
    const boundaryIndex = remaining.indexOf('\n\n');
    if (boundaryIndex === -1) {
      break;
    }

    const eventBlock = remaining.substring(0, boundaryIndex);
    remaining = remaining.substring(boundaryIndex + 2);

    const event = parseSseEvent(eventBlock);
    if (event) {
      events.push(event);
    }
  }

  return { events, remaining };
}

/**
 * Parse a single SSE event block into an OpencodeEvent.
 */
function parseSseEvent(block: string): OpencodeEvent | null {
  let eventType: string | undefined;
  let data: string | undefined;

  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) {
      eventType = line.substring(7).trim();
    } else if (line.startsWith('data: ')) {
      data = line.substring(6).trim();
    } else if (line.startsWith('event:')) {
      eventType = line.substring(6).trim();
    } else if (line.startsWith('data:')) {
      data = line.substring(5).trim();
    }
  }

  if (!data) {
    console.debug('[SSE Parser] No data in event block:', block.substring(0, 100));
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    // OpenCode embeds the event type in the JSON payload as "type".
    // Fall back to the SSE "event:" header if present, then the JSON "type".
    const type = eventType ?? parsed.type;
    if (!type) {
      console.debug('[SSE Parser] No event type in:', JSON.stringify(parsed).substring(0, 200));
      return null;
    }
    // OpenCode wraps event-specific data in a "properties" key.
    // Unwrap it so the event shape is { type, properties: <actual data> }.
    const properties = parsed.properties ?? parsed;
    console.log(`[SSE Parser] Parsed event: ${type}`, Object.keys(properties));
    return {
      type: type as EventType,
      properties,
    };
  } catch {
    // Malformed JSON - skip this event
    console.error('[SSE Parser] Failed to parse JSON:', data.substring(0, 200));
    return null;
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
