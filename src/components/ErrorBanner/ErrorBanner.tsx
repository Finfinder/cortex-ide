import { useAgent } from '@/lib/agent';
import styles from './ErrorBanner.module.css';

export interface ErrorBannerProps {
  onRetry?: () => void;
}

/**
 * Top banner for OpenCode errors (crash, timeout, session error) with retry.
 */
export function ErrorBanner({ onRetry }: ErrorBannerProps) {
  const { state, refreshSessions } = useAgent();
  const { error, sseStatus } = state;

  if (!error && sseStatus !== 'error') return null;

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
