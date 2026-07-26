import { useMemo, useState } from 'react';
import { PREDEFINED_AGENTS } from '@/lib/opencode/config';
import styles from './AgentSelector.module.css';

export interface AgentSelectorProps {
  value: string;
  onChange: (agentName: string) => void;
}

/**
 * Agent dropdown with per-agent config summary (model, thinking effort,
 * description). Default agent: software-engineer.
 */
export function AgentSelector({ value, onChange }: AgentSelectorProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const agents = useMemo(() => {
    const enabled = PREDEFINED_AGENTS.filter((a) => a.enabled !== false);
    const q = query.trim().toLowerCase();
    if (!q) return enabled;
    return enabled.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q),
    );
  }, [query]);

  const current = PREDEFINED_AGENTS.find((a) => a.name === value);

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select agent"
      >
        <span className={styles.triggerLabel}>⊗ {value}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox" aria-label="Agents">
          <input
            type="search"
            className={styles.search}
            placeholder="Search agents"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <ul className={styles.list}>
            {agents.map((a) => (
              <li key={a.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={a.name === value}
                  className={`${styles.option} ${a.name === value ? styles.selected : ''}`}
                  onClick={() => {
                    onChange(a.name);
                    setOpen(false);
                  }}
                >
                  <span className={styles.optionName}>{a.name}</span>
                  {a.model?.model && (
                    <span className={styles.optionModel}>{a.model.model}</span>
                  )}
                  {a.description && (
                    <span className={styles.optionDesc}>{a.description}</span>
                  )}
                </button>
              </li>
            ))}
            {agents.length === 0 && (
              <li className={styles.empty}>No agents match.</li>
            )}
          </ul>
        </div>
      )}

      {current?.description && (
        <p className={styles.description} title={current.description}>
          {current.description}
        </p>
      )}
    </div>
  );
}
