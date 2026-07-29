// ─── SettingsInfra Component ────────────────────────────────────────────────
// Infrastructure settings UI with Qdrant, bge-m3, LLM configuration.
// Test connection button per service with status indicator.

import { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { updateSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { QdrantClient } from '@/lib/rag/qdrant';
import { BgeM3Client } from '@/lib/rag/embeddings';
import { DEFAULT_PROVIDER_URLS } from '@/lib/constants';
import styles from './SettingsInfra.module.css';

export interface ConnectionStatus {
  status: 'checking' | 'connected' | 'error' | 'disabled';
  message?: string;
  details?: Record<string, unknown>;
}

export interface SettingsInfraHandle {
  resetToDefaults: () => void;
}

interface ServiceCardProps {
  title: string;
  icon: string;
  settings: { url: string; enabled?: boolean; [key: string]: unknown };
  onChange: (key: string, value: unknown) => void;
  status: ConnectionStatus;
  onTest: () => Promise<void>;
  testLabel: string;
}

function ServiceCard({ title, icon, settings, onChange, status, onTest, testLabel }: Readonly<ServiceCardProps>) {
  const isEnabled = (settings.enabled as boolean) !== false;

  return (
    <div className={`${styles.card} ${!isEnabled ? styles.disabled : ''}`}>
      <div className={styles.cardHeader}>
        <span className={styles.icon}>{icon}</span>
        <h3 className={styles.cardTitle}>{title}</h3>
        <span className={styles.statusBadge}>
          {!isEnabled && <span className={styles.disabled}>Wyłączono</span>}
          {isEnabled && status.status === 'checking' && <span className={styles.checking}>Sprawdzanie...</span>}
          {isEnabled && status.status === 'connected' && <span className={styles.connected}>✓ Połączono</span>}
          {isEnabled && status.status === 'error' && <span className={styles.error}>( ) Błąd: {status.message}</span>}
          {isEnabled && (status.status === 'disabled' || status.status === 'untested') && <span className={styles.disabled}>Nie przetestowano</span>}
        </span>
      </div>

      <div className={styles.cardBody}>
        <label className={styles.fieldLabel}>
          <span>URL</span>
          <input
            type="url"
            value={settings.url as string}
            onChange={(e) => onChange('url', e.target.value)}
            className={styles.urlInput}
            disabled={!isEnabled}
          />
        </label>

        {'apiKey' in settings && (
          <label className={styles.fieldLabel}>
            <span>API Key</span>
            <input
              type="password"
              value={(settings.apiKey as string) || ''}
              onChange={(e) => onChange('apiKey', e.target.value)}
              className={styles.apiKeyInput}
              placeholder="Wpisz klucz API (opcjonalne)"
              disabled={!isEnabled}
            />
          </label>
        )}

        {'model' in settings && (
          <label className={styles.fieldLabel}>
            <span>Model</span>
            <input
              type="text"
              value={(settings.model as string) || ''}
              onChange={(e) => onChange('model', e.target.value)}
              className={styles.modelInput}
              disabled={!isEnabled}
            />
          </label>
        )}

        {'provider' in settings && (
          <label className={styles.fieldLabel}>
            <span>Provider</span>
            <select
              value={(settings.provider as string) || 'opencode'}
              onChange={(e) => {
                const selected = e.target.value;
                onChange('provider', selected);
                if (DEFAULT_PROVIDER_URLS[selected]) {
                  onChange('url', DEFAULT_PROVIDER_URLS[selected]);
                }
              }}
              className={styles.providerSelect}
              disabled={!isEnabled}
            >
              <option value="opencode">OpenCode</option>
              <option value="mlx">MLX (macOS)</option>
              <option value="llama.cpp">llama.cpp (Windows/CUDA)</option>
              <option value="openrouter">OpenRouter</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        )}

        {'timeout' in settings && (
          <label className={styles.fieldLabel}>
            <span>Timeout (ms)</span>
            <input
              type="number"
              value={(settings.timeout as number) || 5000}
              onChange={(e) => onChange('timeout', Number(e.target.value))}
              className={styles.timeoutInput}
              min={1000}
              max={60000}
              disabled={!isEnabled}
            />
          </label>
        )}

        {'batchSize' in settings && (
          <label className={styles.fieldLabel}>
            <span>Batch Size</span>
            <input
              type="number"
              value={(settings.batchSize as number) || 10}
              onChange={(e) => onChange('batchSize', Number(e.target.value))}
              className={styles.batchSizeInput}
              min={1}
              max={100}
              disabled={!isEnabled}
            />
          </label>
        )}
      </div>

      <div className={styles.cardFooter}>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onChange('enabled', e.target.checked)}
          />
          <span>{isEnabled ? 'Włączono' : 'Wyłączono'}</span>
        </label>

        <button
          className={styles.testButton}
          onClick={onTest}
          disabled={status.status === 'checking' || !isEnabled}
        >
          {testLabel}
        </button>
      </div>
    </div>
  );
}

function SettingsInfra(_: unknown, ref: React.Ref<SettingsInfraHandle>) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS.infra);
  const [qdrantStatus, setQdrantStatus] = useState<ConnectionStatus>({ status: 'disabled' });
  const [bgeM3Status, setBgeM3Status] = useState<ConnectionStatus>({ status: 'disabled' });

  useImperativeHandle(ref, () => ({
    resetToDefaults: () => {
      setSettings(DEFAULT_SETTINGS.infra);
      setQdrantStatus({ status: 'disabled' });
      setBgeM3Status({ status: 'disabled' });
    },
  }));

  const handleSettingChange = useCallback(async (section: 'qdrant' | 'bgeM3', key: string, value: unknown) => {
    const updated = {
      ...settings,
      [section]: { ...settings[section], [key]: value },
    };
    setSettings(updated);
    await updateSettings({ infra: updated });
  }, [settings]);

  const testQdrant = useCallback(async () => {
    setQdrantStatus({ status: 'checking' });
    const client = new QdrantClient(settings.qdrant);
    try {
      const result = await client.health();
      setQdrantStatus({ status: 'connected', details: result });
    } catch (error) {
      setQdrantStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      client.dispose();
    }
  }, [settings.qdrant]);

  const testBgeM3 = useCallback(async () => {
    setBgeM3Status({ status: 'checking' });
    const client = new BgeM3Client(settings.bgeM3);
    try {
      const result = await client.testEmbedding();
      if (result.success) {
        setBgeM3Status({ status: 'connected', details: { vectorSize: result.vectorSize } });
      } else {
        setBgeM3Status({ status: 'error', message: result.error });
      }
    } catch (error) {
      setBgeM3Status({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      client.dispose();
    }
  }, [settings.bgeM3]);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Konfiguracja Infrastruktury</h2>
      <p className={styles.description}>
        Skonfiguruj serwery wektorowe i embedding. Wszystkie endpointy są konfigurowalne — zero hardcoded adresów.
      </p>

      <div className={styles.grid}>
        <ServiceCard
          title="Qdrant"
          icon="🗄️"
          settings={settings.qdrant}
          onChange={(key, value) => handleSettingChange('qdrant', key, value)}
          status={qdrantStatus}
          onTest={testQdrant}
          testLabel="Testuj Połączenie"
        />

        <ServiceCard
          title="bge-m3 Embeddings"
          icon="📐"
          settings={settings.bgeM3}
          onChange={(key, value) => handleSettingChange('bgeM3', key, value)}
          status={bgeM3Status}
          onTest={testBgeM3}
          testLabel="Testuj Embedding"
        />
      </div>

      <div className={styles.saveSection}>
        <button
          className={styles.saveButton}
          onClick={async () => {
            await updateSettings({ infra: settings });
            alert('Ustawienia zapisane!');
          }}
        >
          Zapisz Ustawienia
        </button>
      </div>
    </div>
  );
}

const SettingsInfraComponent = forwardRef(SettingsInfra);
export { SettingsInfraComponent };
