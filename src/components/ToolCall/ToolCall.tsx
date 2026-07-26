import { memo, useState } from 'react';
import type { ToolPart } from '@/lib/opencode/types';
import styles from './ToolCall.module.css';

export interface ToolCallProps {
  part: ToolPart;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Done',
  error: 'Error',
};

/**
 * Displays a single tool call with collapsible args/result sections.
 */
export const ToolCall = memo(function ToolCall({ part }: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);
  const { state, tool } = part;
  const status = state.status;

  const title =
    state.status === 'running' || state.status === 'completed'
      ? state.title
      : undefined;
  const input = 'input' in state ? state.input : undefined;
  const output = state.status === 'completed' ? state.output : undefined;
  const error = state.status === 'error' ? state.error : undefined;

  return (
    <div
      className={`${styles.toolCall} ${styles[status] ?? ''}`}
      role="region"
      aria-label={`Tool call: ${tool}, status ${STATUS_LABEL[status] ?? status}`}
    >
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.chevron} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <span className={styles.name}>{tool}</span>
        {title && <span className={styles.title}>{title}</span>}
        <span className={`${styles.badge} ${styles[`badge_${status}`] ?? ''}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </button>

      {expanded && (
        <div className={styles.body}>
          {input !== undefined && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Arguments</h4>
              <pre className={styles.pre}>{formatJson(input)}</pre>
            </section>
          )}
          {output !== undefined && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Result</h4>
              <pre className={styles.pre}>{output}</pre>
            </section>
          )}
          {error !== undefined && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Error</h4>
              <pre className={`${styles.pre} ${styles.errorPre}`}>{error}</pre>
            </section>
          )}
        </div>
      )}
    </div>
  );
});
