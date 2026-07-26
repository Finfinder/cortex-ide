import { useAgent } from '@/lib/agent';
import type { PendingPatch } from '@/lib/agent/types';
import { PatchReview } from './PatchReview';
import styles from './PatchQueue.module.css';

export interface PatchQueueProps {
  readonly onEditExternal?: (patch: PendingPatch) => void;
}

/**
 * Queue of pending patches with batch approve/reject. Reviewed one by one.
 */
export function PatchQueue({ onEditExternal }: PatchQueueProps) {
  const { state, resolvePatch, resolveAllPatches } = useAgent();
  const pending = state.patches.filter((p) => p.status === 'pending');
  const done = state.patches.filter((p) => p.status !== 'pending');

  if (state.patches.length === 0) return null;

  return (
    <aside className={styles.queue} aria-label="Patch review queue">
      <header className={styles.header}>
        <h2 className={styles.heading}>
          Patches ({pending.length} pending)
        </h2>
        {pending.length > 1 && (
          <div className={styles.batch}>
            <button
              type="button"
              className={styles.approveAll}
              onClick={() => resolveAllPatches('approved')}
            >
              Approve all
            </button>
            <button
              type="button"
              className={styles.rejectAll}
              onClick={() => resolveAllPatches('rejected')}
            >
              Reject all
            </button>
          </div>
        )}
      </header>

      <div className={styles.items}>
        {[...pending, ...done].map((p) => (
          <PatchReview
            key={p.id}
            patch={p}
            onResolve={resolvePatch}
            onEditExternal={onEditExternal}
          />
        ))}
      </div>
    </aside>
  );
}
