import { useEffect, useRef, useState } from 'react';
import { useAgent } from '@/lib/agent';
import styles from './ErrorBanner.module.css';

export interface ErrorBannerProps {
  onRetry?: () => void;
}

/** Delay before showing "Lost Connection" — filters out brief SSE reconnect flickers. */
const SSE_ERROR_DEBOUNCE_MS = 4000;

/**
 * Top banner for OpenCode errors (crash, timeout, session error) with retry.
 */
export function ErrorBanner({ onRetry }: Readonly<ErrorBannerProps>) {
  const { state, refreshSessions, backendReady } = useAgent();
  const { error, sseStatus } = state;

  // Debounce sseStatus === 'error' to avoid flashing during brief reconnects
  const [debouncedSseError, setDebouncedSseError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sseStatus === 'error') {
      timerRef.current ??= setTimeout(() => setDebouncedSseError(true), SSE_ERROR_DEBOUNCE_MS);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDebouncedSseError(false);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sseStatus]);

  // Don't show errors while backend is still initializing
  if (!backendReady) return null;
  // Show immediately for explicit errors, debounced for SSE connection errors
  if (!error && !debouncedSseError) return null;

  const message = error ?? 'Lost connection to OpenCode server.';

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.text}>⚠ {message}</span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.retry}
          onClick={() => (onRetry ? onRetry() : void refreshSessions())}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
