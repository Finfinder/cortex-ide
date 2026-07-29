// ─── SettingsLlmProviders Component ──────────────────────────────────────────
// LLM Providers management UI with collapsible groups, model lists,
// provider filtering, test connection, add/remove models & providers.

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { loadSettings, updateSettings, DEFAULT_SETTINGS, type LlmProviderConfig, type LlmModel } from '@/lib/settings';
import { LlmProvider } from '@/lib/llm/provider';
import { DEFAULT_PROVIDER_URLS, DEFAULT_PROVIDER_NAMES } from '@/lib/constants';
import styles from './SettingsLlmProviders.module.css';

export interface SettingsLlmProvidersHandle {
  resetToDefaults: () => void;
}

export interface ProviderConnectionStatus {
  status: 'checking' | 'connected' | 'error' | 'disabled' | 'untested';
  message?: string;
  modelCount?: number;
}

export { DEFAULT_PROVIDER_URLS, DEFAULT_PROVIDER_NAMES };

function getProviderIcon(providerType: string): string {
  switch (providerType) {
    case 'opencode':
      return '🚀';
    case 'mlx':
      return '💻';
    case 'llama.cpp':
      return '🦙';
    case 'openrouter':
      return '🌐';
    case 'anthropic':
      return '⚡';
    case 'openai':
      return '🤖';
    default:
      return '🔌';
  }
}

function SettingsLlmProviders(_: unknown, ref: React.Ref<SettingsLlmProvidersHandle>) {
  const [providers, setProviders] = useState<LlmProviderConfig[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [testStatuses, setTestStatuses] = useState<Record<string, ProviderConnectionStatus>>({});

  // Add New Provider State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderType, setNewProviderType] = useState<LlmProviderConfig['provider']>('opencode');
  const [newProviderUrl, setNewProviderUrl] = useState('http://127.0.0.1:4096');
  const [newProviderApiKey, setNewProviderApiKey] = useState('');

  // Editing Provider State
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editProviderForm, setEditProviderForm] = useState<Partial<LlmProviderConfig>>({});

  // Adding Model State per provider
  const [addingModelForProviderId, setAddingModelForProviderId] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [newModelContextSize, setNewModelContextSize] = useState('128K');
  const [newModelCapabilities, setNewModelCapabilities] = useState('Tools, Vision');

  useImperativeHandle(ref, () => ({
    resetToDefaults: () => {
      setProviders(DEFAULT_SETTINGS.llmProviders.providers);
      setTestStatuses({});
    },
  }));

  useEffect(() => {
    loadSettings().then((s) => {
      if (s.llmProviders?.providers && s.llmProviders.providers.length > 0) {
        setProviders(s.llmProviders.providers);
      } else {
        setProviders(DEFAULT_SETTINGS.llmProviders.providers);
      }
    });
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleProvider = (id: string, enabled: boolean) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled } : p))
    );
  };

  const handleToggleModel = (providerId: string, modelId: string, enabled: boolean) => {
    setProviders((prev) =>
      prev.map((p) => {
        if (p.id !== providerId) return p;
        return {
          ...p,
          models: p.models.map((m) => (m.id === modelId ? { ...m, enabled } : m)),
        };
      })
    );
  };

  const handleRemoveProvider = (id: string) => {
    if (confirm('Czy na pewno chcesz usunąć tego dostawcę LLM?')) {
      setProviders((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleRemoveModel = (providerId: string, modelId: string) => {
    setProviders((prev) =>
      prev.map((p) => {
        if (p.id !== providerId) return p;
        return {
          ...p,
          models: p.models.filter((m) => m.id !== modelId),
        };
      })
    );
  };

  const handleTestProvider = async (provider: LlmProviderConfig) => {
    setTestStatuses((prev) => ({ ...prev, [provider.id]: { status: 'checking' } }));
    try {
      const client = new LlmProvider({
        url: provider.url,
        provider: provider.provider,
        apiKey: provider.apiKey,
        timeout: provider.timeout || 10000,
        model: provider.models[0]?.id || '',
        extraHeaders: {},
        extraParams: {},
      });

      const result = await client.testConnection();
      if (result.success) {
        setTestStatuses((prev) => ({
          ...prev,
          [provider.id]: { status: 'connected', message: 'Połączono pomyślnie' },
        }));
      } else {
        setTestStatuses((prev) => ({
          ...prev,
          [provider.id]: { status: 'error', message: result.error || 'Nie można połączyć' },
        }));
      }
    } catch (error) {
      setTestStatuses((prev) => ({
        ...prev,
        [provider.id]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    }
  };

  const handleFetchModels = async (provider: LlmProviderConfig) => {
    setTestStatuses((prev) => ({ ...prev, [provider.id]: { status: 'checking' } }));
    try {
      const client = new LlmProvider({
        url: provider.url,
        provider: provider.provider,
        apiKey: provider.apiKey,
        timeout: provider.timeout || 10000,
        model: '',
        extraHeaders: {},
        extraParams: {},
      });

      const remoteModels = await client.listModels();
      if (remoteModels.length > 0) {
        const fetchedList: LlmModel[] = remoteModels.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          contextSize: '128K',
          capabilities: ['Tools'],
          enabled: true,
        }));

        setProviders((prev) =>
          prev.map((p) => {
            if (p.id !== provider.id) return p;
            const existingIds = new Set(p.models.map((m) => m.id));
            const merged = [...p.models];
            fetchedList.forEach((fm) => {
              if (!existingIds.has(fm.id)) merged.push(fm);
            });
            return { ...p, models: merged };
          })
        );

        setTestStatuses((prev) => ({
          ...prev,
          [provider.id]: {
            status: 'connected',
            message: `Pobrano ${remoteModels.length} modeli`,
            modelCount: remoteModels.length,
          },
        }));
      } else {
        setTestStatuses((prev) => ({
          ...prev,
          [provider.id]: { status: 'error', message: 'Brak zwróconych modeli z /v1/models' },
        }));
      }
    } catch (error) {
      setTestStatuses((prev) => ({
        ...prev,
        [provider.id]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Błąd pobierania modeli',
        },
      }));
    }
  };

  const handleAddProvider = () => {
    if (!newProviderName.trim()) return;

    const id = newProviderName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36);
    const newProv: LlmProviderConfig = {
      id,
      name: newProviderName.trim(),
      provider: newProviderType,
      url: newProviderUrl.trim() || 'http://localhost:8080',
      apiKey: newProviderApiKey.trim() || undefined,
      enabled: true,
      timeout: 10000,
      models: [],
    };

    setProviders((prev) => [...prev, newProv]);
    setExpandedIds((prev) => ({ ...prev, [id]: true }));

    // Reset Form
    setNewProviderName('');
    setNewProviderUrl('http://localhost:8080');
    setNewProviderApiKey('');
    setShowAddForm(false);
  };

  const handleSaveEditProvider = (id: string) => {
    const updated = providers.map((p) => (p.id === id ? { ...p, ...editProviderForm } : p));
    setProviders(updated);
    setEditingProviderId(null);
    setEditProviderForm({});
    void updateSettings({ llmProviders: { providers: updated } });
  };

  const handleAddModelToProvider = (providerId: string) => {
    if (!newModelName.trim()) return;

    const newModel: LlmModel = {
      id: newModelName.trim(),
      name: newModelName.trim(),
      contextSize: newModelContextSize.trim() || '128K',
      capabilities: newModelCapabilities.split(',').map((c) => c.trim()).filter(Boolean),
      enabled: true,
    };

    setProviders((prev) =>
      prev.map((p) => {
        if (p.id !== providerId) return p;
        return { ...p, models: [...p.models, newModel] };
      })
    );

    setAddingModelForProviderId(null);
    setNewModelName('');
  };

  const handleSaveAll = async () => {
    await updateSettings({ llmProviders: { providers } });
    alert('Ustawienia Dostawców LLM zostały pomyślnie zapisane!');
  };

  // Filter providers
  const filteredProviders = providers.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchName = p.name.toLowerCase().includes(q);
    const matchProvider = p.provider.toLowerCase().includes(q);
    const matchModel = p.models.some(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
    return matchName || matchProvider || matchModel;
  });

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Dostawcy LLM</h2>
      <p className={styles.description}>
        Zarządzaj połączeniami do dostawców sztucznej inteligencji (local, cloud, API). Konfiguruj dedykowane modele, klucze i parametry.
      </p>

      <div className={styles.toolbar}>
        <input
          type="search"
          placeholder="Szukaj dostawców i modeli..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
        <button
          className={styles.addButton}
          onClick={() => setShowAddForm((v) => !v)}
        >
          <span>+</span> Dodaj Dostawcę
        </button>
      </div>

      {/* Add New Provider Form */}
      {showAddForm && (
        <div className={styles.addFormCard}>
          <h3 className={styles.formTitle}>Dodaj Nowego Dostawcę LLM</h3>
          <div className={styles.formGrid}>
            <label className={styles.fieldLabel}>
              <span>Nazwa Dostawcy</span>
              <input
                type="text"
                placeholder="np. Local Ollama, Custom Proxy"
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
                className={styles.input}
              />
            </label>

            <label className={styles.fieldLabel}>
              <span>Typ Providera</span>
              <select
                value={newProviderType}
                onChange={(e) => {
                  const selectedType = e.target.value as LlmProviderConfig['provider'];
                  setNewProviderType(selectedType);
                  if (DEFAULT_PROVIDER_URLS[selectedType]) {
                    setNewProviderUrl(DEFAULT_PROVIDER_URLS[selectedType]);
                  }
                  if (!newProviderName || Object.values(DEFAULT_PROVIDER_NAMES).includes(newProviderName)) {
                    setNewProviderName(DEFAULT_PROVIDER_NAMES[selectedType] || '');
                  }
                }}
                className={styles.select}
              >
                <option value="opencode">OpenCode</option>
                <option value="llama.cpp">llama.cpp / Ollama</option>
                <option value="mlx">MLX (macOS)</option>
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI</option>
                <option value="custom">Custom Endpoint</option>
              </select>
            </label>

            <label className={styles.fieldLabel}>
              <span>Base URL</span>
              <input
                type="url"
                placeholder={DEFAULT_PROVIDER_URLS[newProviderType] || 'http://localhost:8080'}
                value={newProviderUrl}
                onChange={(e) => setNewProviderUrl(e.target.value)}
                className={styles.input}
              />
            </label>

            <label className={styles.fieldLabel}>
              <span>API Key (opcjonalnie)</span>
              <input
                type="password"
                placeholder="sk-..."
                value={newProviderApiKey}
                onChange={(e) => setNewProviderApiKey(e.target.value)}
                className={styles.input}
              />
            </label>
          </div>

          <div className={styles.formActions}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowAddForm(false)}>
              Anuluj
            </button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleAddProvider}>
              Zapisz Dostawcę
            </button>
          </div>
        </div>
      )}

      {/* Providers List */}
      <div className={styles.providersList}>
        {filteredProviders.map((provider) => {
          const isExpanded = !!expandedIds[provider.id];
          const isEditing = editingProviderId === provider.id;
          const status = testStatuses[provider.id];
          const icon = getProviderIcon(provider.provider);

          return (
            <div
              key={provider.id}
              className={`${styles.providerCard} ${!provider.enabled ? styles.disabled : ''}`}
            >
              {/* Header / Group Summary */}
              <div
                className={styles.providerHeader}
                onClick={() => toggleExpand(provider.id)}
              >
                <div className={styles.providerHeaderLeft}>
                  <span className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}>
                    ▶
                  </span>
                  <span className={styles.providerIcon}>{icon}</span>
                  <span className={styles.providerTitle}>{provider.name}</span>
                  <span className={styles.providerTypeBadge}>{provider.provider}</span>
                </div>

                <div
                  className={styles.providerHeaderRight}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className={styles.statusBadge}>
                    {status?.status === 'checking' && <span className={styles.checking}>Sprawdzanie...</span>}
                    {status?.status === 'connected' && <span className={styles.connected}>✓ {status.message || 'Połączono'}</span>}
                    {status?.status === 'error' && <span className={styles.error}>Błąd: {status.message}</span>}
                    {!status && <span className={styles.notTested}>Nie testowano</span>}
                  </span>

                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={(e) => handleToggleProvider(provider.id, e.target.checked)}
                    />
                    <span>{provider.enabled ? 'Włączony' : 'Wyłączony'}</span>
                  </label>

                  <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={() => handleTestProvider(provider)}
                    disabled={status?.status === 'checking' || !provider.enabled}
                  >
                    Testuj
                  </button>

                  <button
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => handleFetchModels(provider)}
                    disabled={status?.status === 'checking' || !provider.enabled}
                  >
                    Pobierz modele
                  </button>

                  <button
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => {
                      if (isEditing) {
                        setEditingProviderId(null);
                      } else {
                        setEditingProviderId(provider.id);
                        setEditProviderForm(provider);
                      }
                    }}
                  >
                    {isEditing ? 'Zamknij' : '⚙️ Edytuj'}
                  </button>

                  <button
                    className={`${styles.btn} ${styles.btnDanger}`}
                    onClick={() => handleRemoveProvider(provider.id)}
                  >
                    Usuń
                  </button>
                </div>
              </div>

              {/* Edit Provider Panel */}
              {isEditing && (
                <div className={styles.providerBody}>
                  <div className={styles.formGrid}>
                    <label className={styles.fieldLabel}>
                      <span>Nazwa Dostawcy</span>
                      <input
                        type="text"
                        value={editProviderForm.name || ''}
                        onChange={(e) => setEditProviderForm({ ...editProviderForm, name: e.target.value })}
                        className={styles.input}
                      />
                    </label>

                    <label className={styles.fieldLabel}>
                      <span>Base URL</span>
                      <input
                        type="url"
                        value={editProviderForm.url || ''}
                        onChange={(e) => setEditProviderForm({ ...editProviderForm, url: e.target.value })}
                        className={styles.input}
                      />
                    </label>

                    <label className={styles.fieldLabel}>
                      <span>API Key</span>
                      <input
                        type="password"
                        value={editProviderForm.apiKey || ''}
                        onChange={(e) => setEditProviderForm({ ...editProviderForm, apiKey: e.target.value })}
                        className={styles.input}
                        placeholder="Brak klucza"
                      />
                    </label>

                    <label className={styles.fieldLabel}>
                      <span>Timeout (ms)</span>
                      <input
                        type="number"
                        value={editProviderForm.timeout || 10000}
                        onChange={(e) => setEditProviderForm({ ...editProviderForm, timeout: Number(e.target.value) })}
                        className={styles.input}
                      />
                    </label>
                  </div>

                  <div className={styles.formActions}>
                    <button
                      className={`${styles.btn} ${styles.btnSecondary}`}
                      onClick={() => setEditingProviderId(null)}
                    >
                      Anuluj
                    </button>
                    <button
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => handleSaveEditProvider(provider.id)}
                    >
                      Zapisz Zmiany
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded Content: Models Table */}
              {isExpanded && !isEditing && (
                <div className={styles.providerBody}>
                  <div className={styles.urlInfo}>Endpoint: {provider.url}</div>

                  {provider.models.length === 0 ? (
                    <div className={styles.noModels}>
                      Brak zdefiniowanych modeli dla tego dostawcy. Kliknij <strong>Pobierz modele</strong> lub dodaj model poniżej.
                    </div>
                  ) : (
                    <table className={styles.modelsTable}>
                      <thead>
                        <tr>
                          <th>Nazwa / ID Modelu</th>
                          <th>Rozmiar Kontekstu</th>
                          <th>Możliwości</th>
                          <th>Koszt</th>
                          <th style={{ textAlign: 'right' }}>Stan & Akcje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {provider.models.map((model) => (
                          <tr key={model.id}>
                            <td>
                              <div className={styles.modelNameCell}>
                                <span className={styles.modelIcon}>👁️</span>
                                <span>{model.name}</span>
                              </div>
                            </td>
                            <td>
                              <span className={styles.contextBadge}>{model.contextSize || 'N/A'}</span>
                            </td>
                            <td>
                              <div className={styles.capabilitiesList}>
                                {model.capabilities.map((cap) => (
                                  <span key={cap} className={styles.capabilityBadge}>
                                    {cap}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <span className={styles.costCell}>{model.cost || '-'}</span>
                            </td>
                            <td>
                              <div className={styles.modelActions}>
                                <label className={styles.toggleLabel}>
                                  <input
                                    type="checkbox"
                                    checked={model.enabled !== false}
                                    onChange={(e) =>
                                      handleToggleModel(provider.id, model.id, e.target.checked)
                                    }
                                  />
                                </label>
                                <button
                                  className={`${styles.btn} ${styles.btnDanger}`}
                                  onClick={() => handleRemoveModel(provider.id, model.id)}
                                >
                                  ×
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Add Model section */}
                  {addingModelForProviderId === provider.id ? (
                    <div className={styles.addModelRow}>
                      <input
                        type="text"
                        placeholder="Nazwa/ID modelu (np. gpt-4o)"
                        value={newModelName}
                        onChange={(e) => setNewModelName(e.target.value)}
                        className={styles.input}
                        style={{ flex: 2 }}
                      />
                      <input
                        type="text"
                        placeholder="Kontekst (np. 128K)"
                        value={newModelContextSize}
                        onChange={(e) => setNewModelContextSize(e.target.value)}
                        className={styles.input}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="text"
                        placeholder="Tagi (np. Tools, Vision)"
                        value={newModelCapabilities}
                        onChange={(e) => setNewModelCapabilities(e.target.value)}
                        className={styles.input}
                        style={{ flex: 1 }}
                      />
                      <button
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => handleAddModelToProvider(provider.id)}
                      >
                        Dodaj
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSecondary}`}
                        onClick={() => setAddingModelForProviderId(null)}
                      >
                        Anuluj
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: '12px' }}>
                      <button
                        className={`${styles.btn} ${styles.btnSecondary}`}
                        onClick={() => {
                          setAddingModelForProviderId(provider.id);
                          setNewModelName('');
                        }}
                      >
                        + Dodaj Model Ręcznie
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredProviders.length === 0 && (
          <div className={styles.noModels} style={{ padding: '32px' }}>
            Nie znaleziono dostawców spełniających kryteria wyszukiwania.
          </div>
        )}
      </div>

      <div className={styles.saveSection}>
        <button className={styles.saveButton} onClick={handleSaveAll}>
          Zapisz Ustawienia Dostawców LLM
        </button>
      </div>
    </div>
  );
}

const SettingsLlmProvidersComponent = forwardRef(SettingsLlmProviders);
export { SettingsLlmProvidersComponent };
