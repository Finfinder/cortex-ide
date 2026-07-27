import { memo } from 'react';
import { useAgent } from '@/lib/agent';
import styles from './StatusBar.module.css';

const SSE_LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
};

/**
 * Bottom status bar: OpenCode connection, token usage, cost, active tool calls.
 */
export const StatusBar = memo(function StatusBar() {
  const { state, backendReady } = useAgent();
  const { sseStatus, tokens, cost, activeToolCalls } = state;

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

  const statusLabel = SSE_LABEL[sseStatus] ?? 'Disconnected';

  return (
    <footer className={styles.bar} aria-label="Status">
      <output
        className={`${styles.item} ${styles['sse_' + sseStatus]}`}
        aria-label={`OpenCode connection: ${statusLabel}`}
      >
        ● {statusLabel}
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
