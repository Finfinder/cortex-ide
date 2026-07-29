// ─── MCP Permissions (Deny-First) ─────────────────────────────────────────────
// Permissions modal ("MCP tool X wants to do Y. Allow? [Allow] [Deny] [Always allow?])
// Audit log to ~/.agent-ide/audit.log
// Scope: filesystem (paths), network (domains), exec (commands).

import { appendFile, mkdir, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PermissionScope = 'filesystem' | 'network' | 'exec';

export interface PermissionRequest {
  id: string;
  serverName: string;
  toolName: string;
  scope: PermissionScope;
  target: string;
  description: string;
  timestamp: number;
}

export interface PermissionDecision {
  requestId: string;
  allowed: boolean;
  alwaysAllow: boolean;
  timestamp: number;
  reason?: string;
}

export interface AuditLogEntry {
  id: string;
  requestId: string;
  serverName: string;
  toolName: string;
  scope: PermissionScope;
  target: string;
  decision: 'allow' | 'deny' | 'always_allow';
  timestamp: number;
}

const AUDIT_DIR = join(process.env.HOME || process.env.USERPROFILE || '.', '.agent-ide');
const AUDIT_LOG_FILE = join(AUDIT_DIR, 'audit.log');

// In-memory decisions cache (always-allow entries)
const alwaysAllowCache: Map<string, true> = new Map();

// ERR-2: In-memory audit buffer fallback for write errors / retries
const pendingAuditEntries: AuditLogEntry[] = [];

// BUG-1: Simple async mutex lock to prevent race conditions during concurrent permission checks
class AsyncLock {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        if (this.queue.length > 0) {
          const next = this.queue.shift();
          next?.();
        } else {
          this.locked = false;
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
      } else {
        this.queue.push(() => resolve(release));
      }
    });
  }
}

const permissionLock = new AsyncLock();

// ─── Permission Checker ─────────────────────────────────────────────────────

/** Check if a request is always-allowed. */
export function isAlwaysAllowed(request: PermissionRequest): boolean {
  return alwaysAllowCache.has(getCacheKey(request));
}

/** Cache an always-allow decision. */
export function cacheAlwaysAllow(request: PermissionRequest): void {
  alwaysAllowCache.set(getCacheKey(request), true);
}

/** Generate a cache key for a request. */
function getCacheKey(request: PermissionRequest): string {
  return `${request.serverName}:${request.toolName}:${request.target}`;
}

/**
 * Check permissions for an MCP tool call (Thread-safe via AsyncLock - BUG-1).
 * Returns { allowed: true } if allowed (including always-allow).
 * Returns { allowed: false, request } if a modal is needed.
 */
export async function checkPermissions(request: Omit<PermissionRequest, 'id' | 'timestamp'>): Promise<
  { allowed: true } | { allowed: false; request: PermissionRequest }
> {
  const release = await permissionLock.acquire();
  try {
    const tempRequest: PermissionRequest = {
      ...request,
      id: '',
      timestamp: Date.now(),
    };

    if (isAlwaysAllowed(tempRequest)) {
      return { allowed: true };
    }

    const id = `perm-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const fullRequest: PermissionRequest = {
      ...request,
      id,
      timestamp: Date.now(),
    };

    return { allowed: false, request: fullRequest };
  } finally {
    release();
  }
}

/**
 * Apply a user's decision (allow/deny/always-allow).
 * Also writes to audit log (Thread-safe - BUG-1).
 */
export async function applyDecision(
  request: PermissionRequest,
  decision: 'allow' | 'deny' | 'always_allow',
  reason?: string,
): Promise<PermissionDecision> {
  const release = await permissionLock.acquire();
  try {
    const permissionDecision: PermissionDecision = {
      requestId: request.id,
      allowed: decision === 'allow' || decision === 'always_allow',
      alwaysAllow: decision === 'always_allow',
      timestamp: Date.now(),
      reason,
    };

    if (decision === 'always_allow') {
      cacheAlwaysAllow(request);
    }

    await writeAuditLog({
      id: `audit-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      requestId: request.id,
      serverName: request.serverName,
      toolName: request.toolName,
      scope: request.scope,
      target: request.target,
      decision: decision === 'always_allow' ? 'always_allow' : decision,
      timestamp: Date.now(),
    });

    return permissionDecision;
  } finally {
    release();
  }
}

// ─── Audit Log (ERR-2: Buffer Fallback & Retry) ──────────────────────────────

/** Flush buffered pending entries if file is available. */
async function flushPendingAuditLog(): Promise<void> {
  if (pendingAuditEntries.length === 0) return;

  try {
    if (!existsSync(AUDIT_DIR)) {
      mkdir(AUDIT_DIR, { recursive: true }, () => {});
    }

    const entriesToFlush = [...pendingAuditEntries];
    const logData = entriesToFlush.map((e) => JSON.stringify(e) + '\n').join('');

    appendFile(AUDIT_LOG_FILE, logData, (err) => {
      if (!err) {
        // Remove flushed entries from pending queue
        pendingAuditEntries.splice(0, entriesToFlush.length);
      }
    });
  } catch {
    // Keep in buffer for next flush attempt
  }
}

/** Write an entry to the audit log file with fallback buffer (ERR-2). */
async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  pendingAuditEntries.push(entry);
  await flushPendingAuditLog();
}

/** Read all audit log entries including in-memory buffered entries (ERR-2). */
export async function readAuditLog(): Promise<AuditLogEntry[]> {
  const fileEntries: AuditLogEntry[] = [];

  try {
    if (existsSync(AUDIT_LOG_FILE)) {
      const raw = readFileSync(AUDIT_LOG_FILE, 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      fileEntries.push(...lines.map((line) => JSON.parse(line)));
    }
  } catch {
    // Ignore read errors
  }

  // Combine persisted file entries with unpersisted buffer entries
  return [...fileEntries, ...pendingAuditEntries];
}

/** Clear the audit log. */
export async function clearAuditLog(): Promise<void> {
  pendingAuditEntries.length = 0;
  try {
    if (existsSync(AUDIT_LOG_FILE)) {
      writeFileSync(AUDIT_LOG_FILE, '');
    }
  } catch {
    // Ignore clear errors
  }
}

/** Filter audit log entries by server name. */
export async function getAuditLogByServer(serverName: string): Promise<AuditLogEntry[]> {
  const allEntries = await readAuditLog();
  return allEntries.filter((e) => e.serverName === serverName);
}

/** Filter audit log entries by date range. */
export async function getAuditLogByDate(from: number, to: number): Promise<AuditLogEntry[]> {
  const allEntries = await readAuditLog();
  return allEntries.filter((e) => e.timestamp >= from && e.timestamp <= to);
}
