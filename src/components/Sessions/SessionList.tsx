import { useMemo, useState } from 'react';
import { useAgent } from '@/lib/agent';
import { toSessionModel, type ModelConfig } from '@/lib/opencode/config';
import styles from './SessionList.module.css';

/**
 * Sidebar session list: create, switch, delete, search.
 */
export function SessionList({ model }: { model?: ModelConfig }) {
  const { state, createSession, selectSession, deleteSession } = useAgent();
  const { sessions, activeSessionId } = state;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => (s.title ?? s.id).toLowerCase().includes(q));
  }, [sessions, query]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Sessions</h2>
        <button
          type="button"
          className={styles.newButton}
          onClick={() => {
            const modelArg = model ? toSessionModel(model) : undefined;
            void createSession(modelArg);
          }}
          aria-label="New session (Ctrl+N)"
          title="New session (Ctrl+N)"
        >
          +
        </button>
      </div>

      <input
        type="search"
        className={styles.search}
        placeholder="Search sessions"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search sessions"
      />

      <ul className={styles.list} role="listbox" aria-label="Sessions">
        {filtered.map((s) => {
          const active = s.id === activeSessionId;
          return (
            <li key={s.id} className={styles.item}>
              <div
                role="option"
                aria-selected={active}
                tabIndex={0}
                className={`${styles.sessionButton} ${active ? styles.active : ''}`}
                onClick={() => void selectSession(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void selectSession(s.id);
                  }
                }}
              >
                <span className={styles.title}>{s.title ?? 'Untitled session'}</span>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteSession(s.id);
                  }}
                  aria-label={`Delete session ${s.title ?? s.id}`}
                  title="Delete session"
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className={styles.emptyItem}>No sessions match your search.</li>
        )}
      </ul>
    </div>
  );
}
