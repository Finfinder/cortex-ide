import { useMemo, useState, useEffect } from 'react';
import { DEFAULT_MODEL, type ModelConfig } from '@/lib/opencode/config';
import { DEFAULT_SETTINGS, loadSettings, type LlmProviderConfig } from '@/lib/settings';
import styles from './ModelSelector.module.css';

export interface ModelSelectorProps {
  value: ModelConfig;
  onChange: (model: ModelConfig) => void;
  /** Dropdown opens upward (for bottom-of-screen placement). Default: downward. */
  position?: 'top' | 'bottom';
  onOpenSettings?: () => void;
}

/**
 * Model dropdown with per-provider grouping and search.
 */
export function ModelSelector({ value, onChange, position = 'bottom' }: Readonly<ModelSelectorProps>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [customProviders, setCustomProviders] = useState<LlmProviderConfig[]>(
    DEFAULT_SETTINGS.llmProviders.providers,
  );

  // Load configured providers from settings
  useEffect(() => {
    loadSettings()
      .then((s) => {
        if (s.llmProviders?.providers) {
          setCustomProviders(s.llmProviders.providers);
        }
      })
      .catch(() => {});
  }, [open]);

  // Combine user configured models from settings
  const allModels = useMemo(() => {
    const modelsMap = new Map<string, ModelConfig[]>(); // provider group -> models

    // 1. Add models from configured providers in settings
    customProviders.forEach(prov => {
      if (prov.enabled === false) return;
      const groupKey = prov.name || prov.provider || prov.id;
      if (!modelsMap.has(groupKey)) {
        modelsMap.set(groupKey, []);
      }
      (prov.models || []).forEach(m => {
        if (m.enabled === false) return;
        const exists = modelsMap.get(groupKey)?.some(existing => existing.model === m.id);
        if (!exists) {
          modelsMap.get(groupKey)?.push({
            model: m.id,
            provider: prov.provider || prov.id,
            maxTokens: 8192,
            temperature: 0.7,
          });
        }
      });
    });

    // 2. Ensure current selected value is in the list
    const hasValue = Array.from(modelsMap.values()).some(models =>
      models.some(m => m.model === value.model)
    );
    if (!hasValue && value.model) {
      const enrichedModel = { ...DEFAULT_MODEL, ...value };
      const matchingProv = customProviders.find(p => p.id === value.provider || p.provider === value.provider);
      const groupKey = matchingProv?.name || value.provider || 'OpenCode';
      if (!modelsMap.has(groupKey)) {
        modelsMap.set(groupKey, []);
      }
      modelsMap.get(groupKey)?.push(enrichedModel);
    }

    return Array.from(modelsMap.entries()).map(([provider, models]) => ({
      provider,
      models,
    }));
  }, [value, customProviders]);

  // Filter models by query
  const filteredModels = useMemo(() => {
    if (!query.trim()) return allModels;
    const q = query.trim().toLowerCase();
    return allModels.map(group => ({
      ...group,
      models: group.models.filter(m => 
        m.model.toLowerCase().includes(q) || 
        m.provider?.toLowerCase().includes(q)
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
        aria-haspopup="true"
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
            <div className={styles.scrollContainer}>
              {filteredModels.map((group) => (
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}