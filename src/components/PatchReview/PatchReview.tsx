import { useEffect, useState } from 'react';
import { invoke } from '@/lib/ipc';
import { useAgent } from '@/lib/agent';
import type { PendingPatch } from '@/lib/agent/types';
import { parseUnifiedDiff } from '@/lib/agent/patchUtils';
import { DiffViewer, type DiffMode } from '@/components/DiffViewer';
import { GitDiffOutput } from '@/components/GitDiff';
import styles from './PatchReview.module.css';

export interface PatchReviewProps {
  readonly patch: PendingPatch;
  readonly onResolve: (id: string, status: 'approved' | 'rejected') => void;
  readonly onEditExternal?: (patch: PendingPatch) => void;
}

type ViewMode = 'viewer' | 'git';

const STATUS_BADGE: Record<PendingPatch['status'], string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

/**
 * Review UI for a single patch: react-diff-viewer-continued with optional
 * toggle to raw `git diff` output, plus Approve / Reject / Edit-externally.
 */
export function PatchReview({ patch, onResolve, onEditExternal }: PatchReviewProps) {
  const { cwd } = useAgent();
  const [viewMode, setViewMode] = useState<ViewMode>('viewer');
  const [diffMode, setDiffMode] = useState<DiffMode>('unified');
  const [gitDiff, setGitDiff] = useState<string | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);

  const parsed = parseUnifiedDiff(patch.patch);

  // Lazily load git diff when toggled
  useEffect(() => {
    if (viewMode !== 'git' || gitDiff !== null) return;
    let cancelled = false;
    invoke<string>('git_diff', { cwd, args: ['--', patch.file] })
      .then((out) => {
        if (!cancelled) setGitDiff(out);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setGitError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, gitDiff, patch.file, cwd]);

  const resolved = patch.status !== 'pending';

  function renderDiffArea() {
    if (viewMode === 'viewer') {
      return (
        <DiffViewer
          oldContent={parsed.oldContent}
          newContent={parsed.newContent}
          mode={diffMode}
          leftTitle="Original"
          rightTitle="Patched"
        />
      );
    }
    if (gitError) {
      return (
        <div className={styles.fallback}>
          <p>git diff unavailable: {gitError}</p>
          <GitDiffOutput raw={patch.patch} />
        </div>
      );
    }
    return <GitDiffOutput raw={gitDiff ?? patch.patch} />;
  }

  const containerClass = resolved
    ? `${styles.container} ${styles.resolved}`
    : styles.container;
  const fileStatusClass = `${styles.fileStatus} ${styles['fs_' + parsed.fileStatus]}`;
  const statusBadgeClass = `${styles.statusBadge} ${styles['sb_' + patch.status]}`;
  const viewerToggleClass = viewMode === 'viewer' ? styles.toggleActive : '';
  const gitToggleClass = viewMode === 'git' ? styles.toggleActive : '';
  const unifiedToggleClass = diffMode === 'unified' ? styles.toggleActive : '';
  const splitToggleClass = diffMode === 'split' ? styles.toggleActive : '';

  return (
    <section className={containerClass} aria-label={`Patch review for ${patch.file}`}>
      <header className={styles.header}>
        <div className={styles.fileInfo}>
          <span className={fileStatusClass}>{parsed.fileStatus}</span>
          <span className={styles.filePath} title={patch.file}>
            {patch.file}
          </span>
        </div>

        <div className={styles.controls}>
          <fieldset className={styles.toggle} aria-label="Diff view mode">
            <button
              type="button"
              className={viewerToggleClass}
              onClick={() => setViewMode('viewer')}
            >
              Diff viewer
            </button>
            <button
              type="button"
              className={gitToggleClass}
              onClick={() => setViewMode('git')}
            >
              Git diff
            </button>
          </fieldset>

          {viewMode === 'viewer' && (
            <fieldset className={styles.toggle} aria-label="Diff layout">
              <button
                type="button"
                className={unifiedToggleClass}
                onClick={() => setDiffMode('unified')}
              >
                Unified
              </button>
              <button
                type="button"
                className={splitToggleClass}
                onClick={() => setDiffMode('split')}
              >
                Split
              </button>
            </fieldset>
          )}

          <span className={statusBadgeClass}>{STATUS_BADGE[patch.status]}</span>
        </div>
      </header>

      <div className={styles.diffArea}>{renderDiffArea()}</div>

      <footer className={styles.actions}>
        <button
          type="button"
          className={styles.approve}
          onClick={() => onResolve(patch.id, 'approved')}
          disabled={resolved}
        >
          ✓ Approve
        </button>
        <button
          type="button"
          className={styles.reject}
          onClick={() => onResolve(patch.id, 'rejected')}
          disabled={resolved}
        >
          ✗ Reject
        </button>
        {onEditExternal && (
          <button
            type="button"
            className={styles.edit}
            onClick={() => onEditExternal(patch)}
          >
            ✎ Edit externally
          </button>
        )}
      </footer>
    </section>
  );
}
