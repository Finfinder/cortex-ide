// ─── useOpencodeHealth Hook ─────────────────────────────────────────────────
// Manages OpenCode server health monitoring and SSE reconnection.

import { useCallback, useEffect, useRef, useState } from 'react';
import { OpencodeClient } from './client';
import { OpencodeEventStream } from './sse';
import type { OpencodeEvent, SseStatus } from './index';
import type { HealthCheckResult } from './types';

export interface UseOpencodeHealthOptions {
  /** Base URL of the OpenCode server */
  baseUrl: string;
  /** Health check interval in milliseconds (default: 5000) */
  healthIntervalMs?: number;
  /** Whether to auto-connect the SSE stream */
  autoConnectSse?: boolean;
  /** Callback for SSE events */
  onEvent?: (event: OpencodeEvent) => void;
  /** Maximum reconnect attempts for SSE (default: 10) */
  maxReconnectAttempts?: number;
  /** Reconnect delay in milliseconds (default: 3000) */
  reconnectDelayMs?: number;
}

export interface UseOpencodeHealthResult {
  /** Current health status */
  health: HealthCheckResult;
  /** Whether the health check is currently running */
  isChecking: boolean;
  /** SSE connection status */
  sseStatus: SseStatus;
  /** Number of SSE reconnect attempts */
  sseReconnectCount: number;
  /** Manually trigger a health check */
  checkNow: () => Promise<void>;
  /** Connect the SSE stream */
  connectSse: () => void;
  /** Disconnect the SSE stream */
  disconnectSse: () => void;
}

/**
 * Hook for monitoring OpenCode server health and managing SSE connection.
 *
 * Features:
 * - Periodic health pings (configurable interval)
 * - SSE event stream with auto-reconnect
 * - Status indicators for UI
 * - Manual check trigger
 *
 * Usage:
 * ```tsx
 * const { health, sseStatus, checkNow } = useOpencodeHealth({
 *   baseUrl: 'http://127.0.0.1:4096',
 *   onEvent: (event) => console.log(event.type),
 * });
 * ```
 */
export function useOpencodeHealth(
  options: UseOpencodeHealthOptions,
): UseOpencodeHealthResult {
  const {
    baseUrl,
    healthIntervalMs = 5000,
    autoConnectSse = false,
    onEvent,
    maxReconnectAttempts = 10,
    reconnectDelayMs = 3000,
  } = options;

  const [health, setHealth] = useState<HealthCheckResult>({
    status: 'unknown',
    consecutive_failures: 0,
    needs_reconnect: false,
  });
  const [isChecking, setIsChecking] = useState(false);
  const [sseStatus, setSseStatus] = useState<SseStatus>('disconnected');
  const [sseReconnectCount, setSseReconnectCount] = useState(0);

  const clientRef = useRef<OpencodeClient | null>(null);
  const streamRef = useRef<OpencodeEventStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Initialize client
  useEffect(() => {
    mountedRef.current = true;
    clientRef.current = new OpencodeClient({ baseUrl });
    return () => {
      mountedRef.current = false;
    };
  }, [baseUrl]);

  // Health check function
  const checkNow = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;

    setIsChecking(true);
    try {
      const response = await client.health();
      if (response.ok) {
        setHealth({
          status: 'healthy',
          consecutive_failures: 0,
          needs_reconnect: false,
        });
      } else {
        setHealth((prev) => {
          const failures = prev.consecutive_failures + 1;
          return {
            status: failures >= 3 ? 'down' : 'unhealthy',
            consecutive_failures: failures,
            needs_reconnect: failures >= 3,
          };
        });
      }
    } catch {
      setHealth((prev) => {
        const failures = prev.consecutive_failures + 1;
        return {
          status: failures >= 3 ? 'down' : 'unhealthy',
          consecutive_failures: failures,
          needs_reconnect: failures >= 3,
        };
      });
    } finally {
      if (mountedRef.current) {
        setIsChecking(false);
      }
    }
  }, []);

  // Periodic health check
  useEffect(() => {
    // Initial check — deferred to avoid synchronous setState within the effect
    // body (react-hooks/set-state-in-effect). checkNow itself is async.
    const initial = setTimeout(checkNow, 0);

    intervalRef.current = setInterval(checkNow, healthIntervalMs);

    return () => {
      clearTimeout(initial);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkNow, healthIntervalMs]);

  // SSE connection management
  const connectSse = useCallback(() => {
    if (!clientRef.current || streamRef.current) return;

    const stream = new OpencodeEventStream({
      url: clientRef.current.getEventStreamUrl(),
      onEvent: (event) => {
        onEvent?.(event);
      },
      onStatusChange: (status) => {
        if (mountedRef.current) {
          setSseStatus(status);
          if (status === 'connected') {
            setSseReconnectCount(0);
          }
        }
      },
      maxReconnectAttempts,
      reconnectDelay: reconnectDelayMs,
    });

    streamRef.current = stream;
    stream.connect();
  }, [onEvent, maxReconnectAttempts, reconnectDelayMs]);

  const disconnectSse = useCallback(() => {
    streamRef.current?.disconnect();
    streamRef.current = null;
    setSseStatus('disconnected');
  }, []);

  // Auto-connect SSE if enabled
  useEffect(() => {
    if (autoConnectSse && health.status === 'healthy') {
      connectSse();
    }
    return () => {
      disconnectSse();
    };
  }, [autoConnectSse, health.status, connectSse, disconnectSse]);

  // Track SSE reconnect count
  useEffect(() => {
    const interval = setInterval(() => {
      if (streamRef.current) {
        setSseReconnectCount(streamRef.current.reconnectCount);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    health,
    isChecking,
    sseStatus,
    sseReconnectCount,
    checkNow,
    connectSse,
    disconnectSse,
  };
}
