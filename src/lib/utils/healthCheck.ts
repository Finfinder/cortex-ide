// ─── Health Checker Utility ──────────────────────────────────────────────────
// Shared utility for service availability checks (SMELL-1).
// Safe against incomplete mock Response objects in unit tests.

import { validateUrl } from './urlValidator';
import { DEFAULT_TIMEOUT_MS } from '../constants';

export interface HealthCheckOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HealthCheckResult {
  status: string;
  version?: string;
  model?: string;
  error?: string;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

/**
 * Perform a health check against a given base URL and endpoint path.
 * Safe against mock objects without response.json / response.headers (unit test safety).
 */
export async function checkEndpointHealth(
  baseUrl: string,
  path: string,
  options: HealthCheckOptions = {},
): Promise<HealthCheckResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  try {
    const fullUrl = validateUrl(`${cleanBase}${cleanPath}`);
    const response = await fetch(fullUrl, {
      headers: options.headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      let data: unknown = null;
      if (typeof response.json === 'function') {
        data = await response.json().catch(() => null);
      }

      let text = '';
      if (!data && typeof response.text === 'function') {
        text = await response.text().catch(() => '');
      }

      const record = isRecord(data) ? data : undefined;
      const title = typeof record?.title === 'string' ? record.title : undefined;
      const dataStatus = typeof record?.status === 'string' ? record.status : undefined;
      const version = typeof record?.version === 'string' ? record.version : undefined;
      const modelProp = typeof record?.model === 'string' ? record.model : undefined;

      let firstDataModel: string | undefined;
      if (Array.isArray(record?.data) && record.data.length > 0 && isRecord(record.data[0])) {
        const id = record.data[0].id;
        if (typeof id === 'string') {
          firstDataModel = id;
        }
      }

      const status = title || dataStatus || text.trim() || 'ok';
      const model = modelProp || firstDataModel;

      return {
        status,
        version,
        model,
      };
    }

    return { status: 'unavailable', error: `HTTP ${response.status}: ${response.statusText}` };
  } catch (error) {
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}
