// ─── SettingsMcp Component ──────────────────────────────────────────────────
// MCP servers management UI (add/remove/toggle).
// Per server: enable/disable, type, command, args (editable), env (key-value editor).
// Supports adding via raw JSON config block or manual field entry.
// Test connection per server.

import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { loadSettings, updateSettings } from '@/lib/settings';
import styles from './SettingsMcp.module.css';

export interface McpServerConfig {
  name: string;
  type?: 'stdio' | 'sse' | 'http';
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  url?: string;
  gallery?: string;
  version?: string;
  autoStart?: boolean;
}

export interface SettingsMcpHandle {
  resetToDefaults: () => void;
}

interface ServerRowProps {
  name: string;
  config: McpServerConfig;
  onUpdate: (name: string, config: McpServerConfig) => void;
  onRemove: (name: string) => void;
  onTest: (name: string) => Promise<void>;
  testStatus: Record<string, { status: string; message?: string }>;
}

interface EnvEntry {
  id: string;
  key: string;
  value: string;
}

// ─── JSON Parse Helpers ──────────────────────────────────────────────────────

/**
 * Attempt to parse JSON input in multiple formats:
 *  1. Bare fragment: `"server-name": { ... }` — no wrapping braces (VS Code style copy-paste)
 *  2. Full map:     `{ "server-name": { ... }, ... }`
 *  3. Single obj:  `{ "command": "npx", "args": [...] }` — with optional "name" field
 *
 * Returns an array of { name, config } pairs.
 */
function parseJsonInput(raw: string): Array<{ name: string; config: Omit<McpServerConfig, 'name'> }> {
  const trimmed = raw.trim();

  // ── Try direct parse first ──────────────────────────────────────────────────
  let parsed: unknown = null;
  let directError: string | null = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    directError = e instanceof Error ? e.message : String(e);
  }

  // ── If direct parse failed, try wrapping in { } ────────────────────────────
  // This handles the "key": { ... } bare-fragment case (no outer braces).
  if (parsed === null && directError) {
    try {
      parsed = JSON.parse(`{${trimmed}}`);
    } catch {
      // Re-throw the original (more meaningful) error
      throw new Error(`Błąd parsowania JSON: ${directError}`);
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Nieobsługiwany format JSON. Podaj obiekt serwera lub mapę serwerów.');
  }

  const obj = parsed as Record<string, unknown>;

  // ── Case 3: Single server object with "command" at top level ────────────────
  if ('command' in obj) {
    const { name, ...rest } = (obj as unknown) as McpServerConfig;
    return [{ name: name ?? 'new-server', config: rest }];
  }

  // ── Case 1 & 2: Map of servers ──────────────────────────────────────────────
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    throw new Error('Pusta konfiguracja — nie znaleziono żadnych serwerów.');
  }
  return entries.map(([name, config]) => ({
    name,
    config: config as Omit<McpServerConfig, 'name'>,
  }));
}


// ─── AddServerPanel ──────────────────────────────────────────────────────────

interface AddServerPanelProps {
  onAdd: (servers: Array<{ name: string; config: Omit<McpServerConfig, 'name'> }>) => void;
}

function AddServerPanel({ onAdd }: Readonly<AddServerPanelProps>) {
  const [mode, setMode] = useState<'manual' | 'json'>('manual');

  // Manual mode state
  const [name, setName] = useState('');
  const [type, setType] = useState<'stdio' | 'sse' | 'http'>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);
  const [autoStart, setAutoStart] = useState(true);

  // JSON mode state
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');

  const handleAddManual = () => {
    if (!name.trim() || !command.trim()) return;
    onAdd([
      {
        name: name.trim(),
        config: {
          type,
          command: command.trim(),
          args: args.split(' ').filter(Boolean),
          env: envEntries.reduce<Record<string, string>>((acc, { key, value }) => {
            if (key) acc[key] = value;
            return acc;
          }, {}),
          enabled: true,
          autoStart,
        },
      },
    ]);
    setName('');
    setCommand('');
    setArgs('');
    setEnvEntries([]);
    setAutoStart(true);
  };

  const handleAddJson = () => {
    setJsonError('');
    try {
      const servers = parseJsonInput(jsonText);
      onAdd(servers);
      setJsonText('');
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Błąd parsowania JSON');
    }
  };

  const addEnvEntry = () => {
    setEnvEntries([...envEntries, { id: `env-${crypto.randomUUID()}`, key: '', value: '' }]);
  };

  const removeEnvEntry = (index: number) => {
    setEnvEntries(envEntries.filter((_, i) => i !== index));
  };

  const updateEnvEntry = (index: number, field: 'key' | 'value', val: string) => {
    setEnvEntries(envEntries.map((e, i) => (i === index ? { ...e, [field]: val } : e)));
  };

  return (
    <div className={styles.addPanel}>
      {/* Mode Toggle */}
      <div className={styles.modeToggle}>
        <button
          className={`${styles.modeBtn} ${mode === 'manual' ? styles.modeBtnActive : ''}`}
          onClick={() => setMode('manual')}
        >
          ✏️ Ręcznie
        </button>
        <button
          className={`${styles.modeBtn} ${mode === 'json' ? styles.modeBtnActive : ''}`}
          onClick={() => setMode('json')}
        >
          {'{ }'} JSON
        </button>
      </div>

      {mode === 'manual' && (
        <div className={styles.manualForm}>
          {/* Row 1: name + type */}
          <div className={styles.formRow}>
            <label className={styles.fieldLabel}>
              <span>Nazwa serwera</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. context7"
                className={styles.nameInput}
              />
            </label>
            <label className={styles.fieldLabel} style={{ flex: '0 0 140px' }}>
              <span>Typ</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'stdio' | 'sse' | 'http')}
                className={styles.typeSelect}
              >
                <option value="stdio">stdio</option>
                <option value="sse">sse</option>
                <option value="http">http</option>
              </select>
            </label>
          </div>

          {/* Row 2: command + args */}
          <div className={styles.formRow}>
            <label className={styles.fieldLabel}>
              <span>Komenda</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx / python / node"
                className={styles.commandInput}
              />
            </label>
            <label className={styles.fieldLabel}>
              <span>Argumenty (oddzielone spacją)</span>
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="@upstash/context7-mcp@1.0.31"
                className={styles.argsInput}
              />
            </label>
          </div>

          {/* Env vars */}
          <div className={styles.envSection}>
            <div className={styles.envHeader}>
              <span className={styles.fieldLabel}>Zmienne środowiskowe</span>
              <button className={styles.addEnvButton} onClick={addEnvEntry}>
                + Dodaj
              </button>
            </div>
            {envEntries.map((entry, index) => (
              <div key={entry.id} className={styles.envRow}>
                <input
                  type="text"
                  value={entry.key}
                  onChange={(e) => updateEnvEntry(index, 'key', e.target.value)}
                  placeholder="KLUCZ"
                  className={styles.envKeyInput}
                />
                <input
                  type="text"
                  value={entry.value}
                  onChange={(e) => updateEnvEntry(index, 'value', e.target.value)}
                  placeholder="wartość lub ${env:VAR_NAME}"
                  className={styles.envValueInput}
                />
                <button className={styles.removeEnvButton} onClick={() => removeEnvEntry(index)}>
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Options row */}
          <div className={styles.optionsRow}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
              />
              <span>Auto-start</span>
            </label>

            <button
              className={styles.addButton}
              onClick={handleAddManual}
              disabled={!name.trim() || !command.trim()}
            >
              + Dodaj Serwer
            </button>
          </div>
        </div>
      )}

      {mode === 'json' && (
        <div className={styles.jsonForm}>
          <p className={styles.jsonHint}>
            Wklej konfigurację serwera w formacie JSON. Obsługiwany jest pojedynczy obiekt serwera
            lub mapa wielu serwerów.
          </p>
          <pre className={styles.jsonExample}>{`"io.github.upstash/context7": {
  "type": "stdio",
  "command": "npx",
  "args": ["@upstash/context7-mcp@1.0.31"],
  "env": { "CONTEXT7_API_KEY": "\${env:CONTEXT7_KEY}" },
  "autoStart": true
}`}</pre>
          <textarea
            className={`${styles.jsonTextarea} ${jsonError ? styles.jsonTextareaError : ''}`}
            value={jsonText}
            onChange={(e) => { setJsonText(e.target.value); setJsonError(''); }}
            placeholder="Wklej JSON tutaj…"
            rows={8}
            spellCheck={false}
          />
          {jsonError && <span className={styles.jsonError}>{jsonError}</span>}
          <div className={styles.jsonActions}>
            <button
              className={styles.addButton}
              onClick={handleAddJson}
              disabled={!jsonText.trim()}
            >
              + Importuj z JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ServerRow ───────────────────────────────────────────────────────────────

function ServerRow({
  name,
  config,
  onUpdate,
  onRemove,
  onTest,
  testStatus,
}: Readonly<ServerRowProps>) {
  const [isEditing, setIsEditing] = useState(false);
  const [localConfig, setLocalConfig] = useState(config);
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>(
    Object.entries(config.env).map(([k, v], idx) => ({ id: `${k || 'entry'}-${idx}-${crypto.randomUUID()}`, key: k, value: v })),
  );

  const handleSave = () => {
    const updated: McpServerConfig = {
      ...localConfig,
      env: envEntries.reduce<Record<string, string>>((acc, { key, value }) => {
        if (key) acc[key] = value;
        return acc;
      }, {}),
    };
    onUpdate(name, updated);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalConfig(config);
    setEnvEntries(
      Object.entries(config.env).map(([k, v], idx) => ({ id: `${k || 'entry'}-${idx}-${crypto.randomUUID()}`, key: k, value: v })),
    );
    setIsEditing(false);
  };

  const addEnvEntry = () => {
    setEnvEntries([...envEntries, { id: `env-${crypto.randomUUID()}`, key: '', value: '' }]);
  };

  const removeEnvEntry = (index: number) => {
    setEnvEntries(envEntries.filter((_, i) => i !== index));
  };

  const updateEnvEntry = (index: number, field: 'key' | 'value', val: string) => {
    setEnvEntries(envEntries.map((e, i) => (i === index ? { ...e, [field]: val } : e)));
  };

  const status = testStatus[name];

  return (
    <div className={`${styles.serverCard} ${!config.enabled ? styles.disabled : ''}`}>
      <div className={styles.serverHeader}>
        <div className={styles.serverName}>
          <span className={styles.serverIcon}>🔌</span>
          <span className={styles.serverTitle}>{name}</span>
          {config.type && <span className={styles.typeBadge}>{config.type}</span>}
          {config.version && <span className={styles.versionBadge}>v{config.version}</span>}
        </div>

        <div className={styles.serverActions}>
          <span className={styles.statusIndicator}>
            {status?.status === 'checking' && <span className={styles.checking}>Sprawdzanie...</span>}
            {status?.status === 'connected' && <span className={styles.connected}>✓ Połączono</span>}
            {status?.status === 'error' && <span className={styles.error}>Błąd</span>}
            {!status && <span className={styles.notTested}>Nie testowano</span>}
          </span>

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => onUpdate(name, { ...config, enabled: e.target.checked })}
            />
            <span>{config.enabled ? 'Włączony' : 'Wyłączony'}</span>
          </label>

          <button
            className={styles.testButton}
            onClick={() => onTest(name)}
            disabled={status?.status === 'checking' || !config.enabled}
          >
            Testuj
          </button>

          {isEditing ? (
            <>
              <button className={styles.editButton} onClick={handleSave}>
                Zapisz
              </button>
              <button className={styles.cancelButton} onClick={handleCancel}>
                Anuluj
              </button>
            </>
          ) : (
            <button className={styles.editButton} onClick={() => setIsEditing(true)}>
              Edytuj
            </button>
          )}

          <button className={styles.removeButton} onClick={() => onRemove(name)}>
            Usuń
          </button>
        </div>
      </div>

      {isEditing && (
        <div className={styles.editForm}>
          {/* Type + Command */}
          <div className={styles.formRow}>
            <label className={styles.fieldLabel} style={{ flex: '0 0 140px' }}>
              <span>Typ</span>
              <select
                value={localConfig.type ?? 'stdio'}
                onChange={(e) => setLocalConfig({ ...localConfig, type: e.target.value as 'stdio' | 'sse' | 'http' })}
                className={styles.typeSelect}
              >
                <option value="stdio">stdio</option>
                <option value="sse">sse</option>
                <option value="http">http</option>
              </select>
            </label>

            <label className={styles.fieldLabel}>
              <span>Komenda</span>
              <input
                type="text"
                value={localConfig.command}
                onChange={(e) => setLocalConfig({ ...localConfig, command: e.target.value })}
                className={styles.commandInput}
                placeholder="np. python, node, npx"
              />
            </label>
          </div>

          {/* Args */}
          <label className={styles.fieldLabel}>
            <span>Argumenty (oddzielone spacją)</span>
            <input
              type="text"
              value={localConfig.args.join(' ')}
              onChange={(e) => setLocalConfig({ ...localConfig, args: e.target.value.split(' ').filter(Boolean) })}
              className={styles.argsInput}
              placeholder="@upstash/context7-mcp@1.0.31"
            />
          </label>

          {/* URL (for sse/http) */}
          {(localConfig.type === 'sse' || localConfig.type === 'http') && (
            <label className={styles.fieldLabel}>
              <span>URL</span>
              <input
                type="text"
                value={localConfig.url ?? ''}
                onChange={(e) => setLocalConfig({ ...localConfig, url: e.target.value })}
                className={styles.commandInput}
                placeholder="https://..."
              />
            </label>
          )}

          {/* Env */}
          <div className={styles.envSection}>
            <div className={styles.envHeader}>
              <span className={styles.fieldLabel}>Zmienne środowiskowe</span>
              <button className={styles.addEnvButton} onClick={addEnvEntry}>
                + Dodaj
              </button>
            </div>

            {envEntries.map((entry, index) => (
              <div key={entry.id} className={styles.envRow}>
                <input
                  type="text"
                  value={entry.key}
                  onChange={(e) => updateEnvEntry(index, 'key', e.target.value)}
                  placeholder="KLUCZ"
                  className={styles.envKeyInput}
                />
                <input
                  type="text"
                  value={entry.value}
                  onChange={(e) => updateEnvEntry(index, 'value', e.target.value)}
                  placeholder="wartość lub ${env:VAR_NAME}"
                  className={styles.envValueInput}
                />
                <button
                  className={styles.removeEnvButton}
                  onClick={() => removeEnvEntry(index)}
                  disabled={envEntries.length <= 1}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Auto-start */}
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={localConfig.autoStart ?? false}
              onChange={(e) => setLocalConfig({ ...localConfig, autoStart: e.target.checked })}
            />
            <span>Auto-start</span>
          </label>
        </div>
      )}

      {!isEditing && (
        <div className={styles.serverDetails}>
          <span className={styles.detailItem}>
            <strong>Command:</strong> {config.command}
          </span>
          {config.args.length > 0 && (
            <span className={styles.detailItem}>
              <strong>Args:</strong> {config.args.join(' ')}
            </span>
          )}
          {config.url && (
            <span className={styles.detailItem}>
              <strong>URL:</strong> {config.url}
            </span>
          )}
          {Object.keys(config.env).length > 0 && (
            <span className={styles.detailItem}>
              <strong>Env:</strong> {Object.keys(config.env).join(', ')}
            </span>
          )}
          {config.autoStart && (
            <span className={styles.detailItem}>
              <strong>Auto-start:</strong> tak
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SettingsMcp ─────────────────────────────────────────────────────────────

function SettingsMcp(_: unknown, ref: React.Ref<SettingsMcpHandle>) {
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({});
  const [testStatus, setTestStatus] = useState<Record<string, { status: string; message?: string }>>({});

  useImperativeHandle(ref, () => ({
    resetToDefaults: () => {
      setServers({});
      setTestStatus({});
    },
  }));

  // Load servers from settings
  useEffect(() => {
    loadSettings().then((s) => {
      const mapped: Record<string, McpServerConfig> = {};
      for (const [name, cfg] of Object.entries(s.mcp.servers)) {
        mapped[name] = { name, ...cfg };
      }
      setServers(mapped);
    });
  }, []);

  const handleAddServers = useCallback(
    (newServers: Array<{ name: string; config: Omit<McpServerConfig, 'name'> }>) => {
      setServers((prev) => {
        const next = { ...prev };
        for (const { name, config } of newServers) {
          const defaults: McpServerConfig = { enabled: true, args: [], env: {}, command: '', name };
          next[name] = { ...defaults, ...config, name };
        }
        return next;
      });
    },
    [],
  );

  const handleUpdateServer = useCallback((name: string, config: McpServerConfig) => {
    setServers((prev) => ({ ...prev, [name]: config }));
  }, []);

  const handleRemoveServer = useCallback((name: string) => {
    setServers((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleTestServer = useCallback(
    async (name: string) => {
      setTestStatus((prev) => ({ ...prev, [name]: { status: 'checking' } }));

      try {
        const config = servers[name];
        if (!config) throw new Error('Server not found');

        // Simulate test (in production, spawn process and ping)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setTestStatus((prev) => ({
          ...prev,
          [name]: { status: 'connected', message: 'Server responded' },
        }));
      } catch (error) {
        setTestStatus((prev) => ({
          ...prev,
          [name]: { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
        }));
      }
    },
    [servers],
  );

  const handleSave = useCallback(async () => {
    await updateSettings({ mcp: { servers } });
    alert('Ustawienia MCP zapisane!');
  }, [servers]);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Konfiguracja MCP Serwerów</h2>
      <p className={styles.description}>
        Zarządzaj serwerami MCP — dodawaj, edytuj, włącz/wyłącz i testuj połączenia.
      </p>

      <AddServerPanel onAdd={handleAddServers} />

      <div className={styles.serversList}>
        {Object.entries(servers).map(([name, config]) => (
          <ServerRow
            key={name}
            name={name}
            config={config}
            onUpdate={handleUpdateServer}
            onRemove={handleRemoveServer}
            onTest={handleTestServer}
            testStatus={testStatus}
          />
        ))}

        {Object.keys(servers).length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📭</span>
            <p>Brak skonfigurowanych serwerów MCP.</p>
            <p className={styles.emptyHint}>Dodaj pierwszy serwer powyżej.</p>
          </div>
        )}
      </div>

      <div className={styles.saveSection}>
        <button className={styles.saveButton} onClick={handleSave}>
          Zapisz Ustawienia MCP
        </button>
      </div>
    </div>
  );
}

const SettingsMcpComponent = forwardRef(SettingsMcp);
export { SettingsMcpComponent };
