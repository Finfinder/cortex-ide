import { memo, useEffect, useRef, useState } from 'react';
import { useAgent } from '@/lib/agent';
import styles from './StatusBar.module.css';

const SSE_LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
};

/** Delay before showing "Error" — filters out brief SSE reconnect flickers. */
const SSE_ERROR_DEBOUNCE_MS = 4000;

/**
 * Bottom status bar: OpenCode connection, token usage, cost, active tool calls.
 */
export const StatusBar = memo(function StatusBar() {
  const { state, backendReady } = useAgent();
  const { sseStatus, tokens, cost, activeToolCalls, generating } = state;

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

  // Show "Initializing..." while waiting for Tauri backend
  if (!backendReady) {
    return (
      <footer className={styles.bar} aria-label="Status">
        <output
          className={`${styles.item} ${styles.sse_connecting}`}
          aria-label="OpenCode connection: Initializing"
        >
          ● Initializing...
        </output>
      </footer>
    );
  }

  // Determine effective SSE status for display.
  // During chat (generating), show "Working…" instead of error to avoid confusion.
  // During the debounce period for errors, show "Connecting…" instead of "Error".
  let effectiveStatus: string = sseStatus;
  let effectiveLabel: string;

  if (generating && sseStatus === 'error') {
    effectiveStatus = 'working';
    effectiveLabel = 'Working…';
  } else if (sseStatus === 'error' && !debouncedSseError) {
    effectiveStatus = 'connecting';
    effectiveLabel = SSE_LABEL.connecting;
  } else {
    effectiveLabel = SSE_LABEL[sseStatus] ?? 'Disconnected';
  }

  return (
    <footer className={styles.bar} aria-label="Status">
      <output
        className={`${styles.item} ${styles['sse_' + effectiveStatus]}`}
        aria-label={`OpenCode connection: ${effectiveLabel}`}
      >
        ● {effectiveLabel}
      </output>

      <span className={styles.item} title="Tokens used (input / output)">
        ⬆ {tokens.input} ⬇ {tokens.output}
      </span>

      {cost > 0 && (
        <span className={styles.item} title="Session cost">
          $ {cost.toFixed(4)}
        </span>
      )}

      {activeToolCalls > 0 && (
        <span className={styles.item} aria-live="polite">
          ⚙ {activeToolCalls} tool{activeToolCalls > 1 ? 's' : ''} running
        </span>
      )}
    </footer>
  );
});
