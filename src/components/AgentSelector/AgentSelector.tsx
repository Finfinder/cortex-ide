import { useMemo, useState } from 'react';
import { PREDEFINED_AGENTS, getEffectiveModel, DEFAULT_MODEL, type ModelConfig } from '@/lib/opencode/config';
import styles from './AgentSelector.module.css';

export interface AgentSelectorProps {
  value: string;
  onChange: (agentName: string, model?: ModelConfig) => void;
  /** Dropdown opens upward (for bottom-of-screen placement). Default: downward. */
  position?: 'top' | 'bottom';
}

/**
 * Agent dropdown with per-agent config summary (model, thinking effort,
 * description). Default agent: software-engineer.
 */
export function AgentSelector({ value, onChange, position = 'bottom' }: Readonly<AgentSelectorProps>) {
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

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Select agent"
      >
        <span className={styles.triggerLabel}>⊗ {value}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={`${styles.dropdown} ${position === 'top' ? styles.dropdownTop : ''}`} role="listbox" aria-label="Agents">
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
                    const model = a.model ? getEffectiveModel(a, DEFAULT_MODEL) : undefined;
                    onChange(a.name, model);
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

    </div>
  );
}
