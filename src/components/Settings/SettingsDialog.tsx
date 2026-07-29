import { useState } from 'react';
import { SettingsMcpComponent } from './SettingsMcp';
import { SettingsInfraComponent } from './SettingsInfra';
import { SettingsLlmProvidersComponent } from './SettingsLlmProviders';
import { SettingsAuditLog } from './SettingsAuditLog';
import styles from './SettingsDialog.module.css';

type Tab = 'infra' | 'mcp' | 'llm-providers' | 'audit';

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [tab, setTab] = useState<Tab>('llm-providers');

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ustawienia"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Ustawienia</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Zamknij ustawienia"
          >
            ✕
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Ustawienia">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'llm-providers'}
            className={`${styles.tab} ${tab === 'llm-providers' ? styles.tabActive : ''}`}
            onClick={() => setTab('llm-providers')}
          >
            🧠 Dostawcy LLM
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mcp'}
            className={`${styles.tab} ${tab === 'mcp' ? styles.tabActive : ''}`}
            onClick={() => setTab('mcp')}
          >
            🔌 MCP
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'infra'}
            className={`${styles.tab} ${tab === 'infra' ? styles.tabActive : ''}`}
            onClick={() => setTab('infra')}
          >
            🤖 Infrastruktura
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'audit'}
            className={`${styles.tab} ${tab === 'audit' ? styles.tabActive : ''}`}
            onClick={() => setTab('audit')}
            id="settings-tab-audit"
          >
            📋 Audit Log
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'llm-providers' && <SettingsLlmProvidersComponent />}
          {tab === 'mcp' && <SettingsMcpComponent />}
          {tab === 'infra' && <SettingsInfraComponent />}
          {tab === 'audit' && <SettingsAuditLog />}
        </div>
      </div>
    </div>
  );
}
