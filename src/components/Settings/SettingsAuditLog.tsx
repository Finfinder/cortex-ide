// ─── Audit Log Panel ─────────────────────────────────────────────────────────
// Read-only view of MCP permission decisions.
// Colorized by decision: allow (green), deny (red), always_allow (amber).
// Supports filter by server / decision / date range and "Clear log" action.

import { useState, useEffect, useCallback } from 'react';
import type { AuditLogEntry } from '@/lib/mcp/permissions';
import styles from './SettingsAuditLog.module.css';

// ─── Safe log reader ─────────────────────────────────────────────────────────

async function loadAuditLog(): Promise<AuditLogEntry[]> {
  try {
    const { readAuditLog } = await import('@/lib/mcp/permissions');
    return await readAuditLog();
  } catch {
    return [];
  }
}

async function clearLog(): Promise<void> {
  try {
    const { clearAuditLog } = await import('@/lib/mcp/permissions');
    await clearAuditLog();
  } catch {
    // no-op in browser env
  }
}

// ─── Badge ───────────────────────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: AuditLogEntry['decision'] }) {
  const label =
    decision === 'allow' ? '✓ Zezwolono' :
    decision === 'always_allow' ? '★ Zawsze' :
    '✕ Odmówiono';

  return (
    <span
      className={`${styles.badge} ${
        decision === 'allow' ? styles.allow :
        decision === 'always_allow' ? styles.alwaysAllow :
        styles.deny
      }`}
    >
      {label}
    </span>
  );
}

// ─── Scope badge ─────────────────────────────────────────────────────────────

function ScopeBadge({ scope }: { scope: AuditLogEntry['scope'] }) {
  const icon = scope === 'filesystem' ? '📁' : scope === 'network' ? '🌐' : '⚡';
  return <span className={styles.scope}>{icon} {scope}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SettingsAuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterServer, setFilterServer] = useState('');
  const [filterDecision, setFilterDecision] = useState<'' | AuditLogEntry['decision']>('');
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const log = await loadAuditLog();
    setEntries(log.reverse()); // newest first
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleClear = async () => {
    if (!confirm('Wyczyścić cały audit log? Tej operacji nie można cofnąć.')) return;
    setClearing(true);
    await clearLog();
    setEntries([]);
    setClearing(false);
  };

  // ─── Filter & derive ───────────────────────────────────────────────────────

  const servers = [...new Set(entries.map((e) => e.serverName))].sort();

  const visible = entries.filter((e) => {
    if (filterServer && e.serverName !== filterServer) return false;
    if (filterDecision && e.decision !== filterDecision) return false;
    return true;
  });

  const stats = {
    allow: entries.filter((e) => e.decision === 'allow').length,
    deny: entries.filter((e) => e.decision === 'deny').length,
    always: entries.filter((e) => e.decision === 'always_allow').length,
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Audit Log MCP</h2>
          <p className={styles.description}>
            Historia decyzji uprawnień MCP — zezwolenia i odmowy per narzędzie.
          </p>
        </div>
        <button
          className={styles.refreshButton}
          onClick={refresh}
          disabled={loading}
          title="Odśwież"
        >
          ↻
        </button>
      </div>

      {/* Stats row */}
      <div className={styles.stats}>
        <span className={`${styles.statChip} ${styles.statAllow}`}>
          ✓ {stats.allow} zezw.
        </span>
        <span className={`${styles.statChip} ${styles.statDeny}`}>
          ✕ {stats.deny} odmów
        </span>
        <span className={`${styles.statChip} ${styles.statAlways}`}>
          ★ {stats.always} zawsze
        </span>
        <span className={styles.statTotal}>{entries.length} łącznie</span>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
          value={filterServer}
          onChange={(e) => setFilterServer(e.target.value)}
          aria-label="Filtr serwera"
          id="audit-filter-server"
        >
          <option value="">Wszystkie serwery</option>
          {servers.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className={styles.filterSelect}
          value={filterDecision}
          onChange={(e) => setFilterDecision(e.target.value as '' | AuditLogEntry['decision'])}
          aria-label="Filtr decyzji"
          id="audit-filter-decision"
        >
          <option value="">Wszystkie decyzje</option>
          <option value="allow">✓ Zezwolono</option>
          <option value="deny">✕ Odmówiono</option>
          <option value="always_allow">★ Zawsze zezwalaj</option>
        </select>

        <button
          className={styles.clearButton}
          onClick={handleClear}
          disabled={entries.length === 0 || clearing}
          id="audit-clear-btn"
        >
          {clearing ? 'Czyszczenie…' : '🗑 Wyczyść log'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className={styles.empty}>Ładowanie…</div>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          {entries.length === 0
            ? 'Brak wpisów. Audit log jest pusty.'
            : 'Brak wyników dla wybranego filtru.'}
        </div>
      ) : (
        <div className={styles.tableWrapper} role="region" aria-label="Audit log MCP">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Czas</th>
                <th>Serwer</th>
                <th>Narzędzie</th>
                <th>Zakres</th>
                <th>Cel</th>
                <th>Decyzja</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id} className={styles.row}>
                  <td className={styles.time}>
                    {new Date(entry.timestamp).toLocaleTimeString('pl-PL', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                    <span className={styles.date}>
                      {new Date(entry.timestamp).toLocaleDateString('pl-PL')}
                    </span>
                  </td>
                  <td className={styles.server}>
                    <code>{entry.serverName}</code>
                  </td>
                  <td className={styles.tool}>
                    <code>{entry.toolName}</code>
                  </td>
                  <td>
                    <ScopeBadge scope={entry.scope} />
                  </td>
                  <td className={styles.target} title={entry.target}>
                    {entry.target.length > 40
                      ? `…${entry.target.slice(-38)}`
                      : entry.target}
                  </td>
                  <td>
                    <DecisionBadge decision={entry.decision} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
