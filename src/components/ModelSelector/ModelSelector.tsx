import { useMemo, useState } from 'react';
import { PREDEFINED_AGENTS, getEffectiveModel, DEFAULT_MODEL, type ModelConfig } from '@/lib/opencode/config';
import styles from './ModelSelector.module.css';

export interface ModelSelectorProps {
  value: ModelConfig;
  onChange: (model: ModelConfig) => void;
  /** Dropdown opens upward (for bottom-of-screen placement). Default: downward. */
  position?: 'top' | 'bottom';
}

/**
 * Model dropdown with per-provider grouping and search.
 */
export function ModelSelector({ value, onChange, position = 'bottom' }: Readonly<ModelSelectorProps>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  // Get all unique models from all agents' effective models + current value
  const allModels = useMemo(() => {
    const modelsMap = new Map<string, ModelConfig[]>(); // provider -> models

    // Add global default model as fallback
    const globalModel = PREDEFINED_AGENTS.find(a => a.name === 'global')?.model ?? DEFAULT_MODEL;

    // Collect models from all agents
    PREDEFINED_AGENTS.forEach(agent => {
      if (!agent.model) return;
      const effectiveModel = getEffectiveModel(agent, globalModel);
      if (!modelsMap.has(effectiveModel.provider)) {
        modelsMap.set(effectiveModel.provider, []);
      }
      // Avoid duplicates (compare both model and provider)
      const exists = modelsMap.get(effectiveModel.provider)?.some(m => m.model === effectiveModel.model && m.provider === effectiveModel.provider);
      if (!exists) {
        modelsMap.get(effectiveModel.provider)?.push(effectiveModel);
      }
    });

    // Ensure current value is in the list (handles session model changes)
    const hasValue = modelsMap.get(value.provider)?.some(m => m.model === value.model && m.provider === value.provider);
    if (!hasValue) {
      if (!modelsMap.has(value.provider)) {
        modelsMap.set(value.provider, []);
      }
      modelsMap.get(value.provider)?.push(value);
    }

    return Array.from(modelsMap.entries()).map(([provider, models]) => ({
      provider,
      models,
    }));
  }, [value]);

  // Filter models by query
  const filteredModels = useMemo(() => {
    if (!query.trim()) return allModels;
    const q = query.trim().toLowerCase();
    return allModels.map(group => ({
      ...group,
      models: group.models.filter(m => 
        m.model.toLowerCase().includes(q) || 
        (m.provider && m.provider.toLowerCase().includes(q))
      )
    })).filter(group => group.models.length > 0);
  }, [allModels, query]);

  const currentModelName = value.model;

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select model"
      >
        <span className={styles.triggerLabel}>{currentModelName}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={`${styles.dropdown} ${position === 'top' ? styles.dropdownTop : ''}`} role="listbox" aria-label="Models">
          <input
            type="search"
            className={styles.search}
            placeholder="Search models..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {filteredModels.length === 0 ? (
            <div className={styles.empty}>No models found.</div>
          ) : (
            filteredModels.map((group) => (
              <div key={group.provider} className={styles.group}>
                <div className={styles.groupHeader}>{group.provider}</div>
                <ul className={styles.list}>
                  {group.models.map((model) => (
                    <li key={`${model.provider}::${model.model}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={model.model === value.model && model.provider === value.provider}
                        className={`${styles.option} ${model.model === value.model && model.provider === value.provider ? styles.selected : ''}`}
                        onClick={() => {
                          onChange(model);
                          setOpen(false);
                        }}
                      >
                        <span className={styles.optionName}>{model.model}</span>
                        <span className={styles.optionProvider}>{model.provider}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}