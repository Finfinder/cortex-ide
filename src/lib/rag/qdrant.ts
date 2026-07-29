// ─── Qdrant Client (RAG) ────────────────────────────────────────────────────
// REST API client for Qdrant vector database.
// All endpoints loaded from settings — zero hardcoded URLs.

import type { QdrantSettings } from '../settings';
import { validateUrl } from '../utils/urlValidator';
import { checkEndpointHealth } from '../utils/healthCheck';

export interface Point {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

export interface SearchResponse {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
}

export class QdrantClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private activeAbortControllers: Set<AbortController> = new Set();

  constructor(settings: QdrantSettings) {
    // SEC-3: Validate base URL against SSRF
    this.baseUrl = validateUrl(settings.url).replace(/\/+$/, '');
    this.apiKey = settings.apiKey;
    this.timeout = settings.timeout;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Api-Key'] = this.apiKey;
    }
    return headers;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = validateUrl(`${this.baseUrl}${path}`);
    const controller = new AbortController();
    this.activeAbortControllers.add(controller);

    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.headers(),
          ...options?.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text().catch(() => response.statusText);
        throw new Error(`Qdrant API error ${response.status}: ${error}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
      this.activeAbortControllers.delete(controller);
    }
  }

  /** Check if Qdrant is available (SMELL-1). */
  async health(): Promise<{ status: string; version?: string }> {
    const primary = await checkEndpointHealth(this.baseUrl, '/', {
      headers: this.headers(),
      timeoutMs: this.timeout,
    });

    if (primary.status !== 'unavailable') {
      return { status: primary.status, version: primary.version };
    }

    const fallback = await checkEndpointHealth(this.baseUrl, '/healthz', {
      headers: this.headers(),
      timeoutMs: this.timeout,
    });

    if (fallback.status !== 'unavailable') {
      return { status: fallback.version || fallback.status };
    }

    throw new Error(`Qdrant health check failed: ${primary.error || 'Unavailable'}`);
  }

  /** List all collections. */
  async listCollections(): Promise<{ collections: string[] }> {
    return this.request('/collections');
  }

  /** Create a new collection. */
  async createCollection(
    collectionName: string,
    vectorSize: number,
    distance?: 'Cosine' | 'Euclid' | 'Dot',
  ): Promise<{ result: true; status: string }> {
    const name = encodeURIComponent(collectionName);
    return this.request(`/collections/${name}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: distance || 'Cosine',
        },
      }),
    });
  }

  /** Check if collection exists. */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const { collections } = await this.listCollections();
      return collections.includes(collectionName);
    } catch {
      return false;
    }
  }

  /** Upsert points to a collection. */
  async upsert(
    collectionName: string,
    points: Point[],
  ): Promise<{ result: true; status: string }> {
    const name = encodeURIComponent(collectionName);
    return this.request(`/collections/${name}/points`, {
      method: 'PUT',
      body: JSON.stringify({ points }),
    });
  }

  /** Search similar vectors in a collection. */
  async search(
    collectionName: string,
    vector: number[],
    limit?: number,
    params?: Record<string, unknown>,
  ): Promise<SearchResponse[]> {
    const name = encodeURIComponent(collectionName);
    const result = await this.request<{ result: SearchResponse[] }>(
      `/collections/${name}/points/search`,
      {
        method: 'POST',
        body: JSON.stringify({ vector, limit, params }),
      },
    );
    return result.result;
  }

  /** Delete a point from a collection. */
  async delete(
    collectionName: string,
    pointId: string | number,
  ): Promise<{ result: true }> {
    const name = encodeURIComponent(collectionName);
    const id = encodeURIComponent(String(pointId));
    return this.request(`/collections/${name}/points/${id}`, {
      method: 'DELETE',
    });
  }

  /** Delete all points from a collection. */
  async deleteCollection(collectionName: string): Promise<{ result: true }> {
    const name = encodeURIComponent(collectionName);
    return this.request(`/collections/${name}`, {
      method: 'DELETE',
    });
  }

  /** Get point by ID. */
  async getPoint(
    collectionName: string,
    pointId: string | number,
  ): Promise<{ result: Point }> {
    const name = encodeURIComponent(collectionName);
    const id = encodeURIComponent(String(pointId));
    return this.request(`/collections/${name}/points/${id}`);
  }

  /** List all points in a collection (with pagination). */
  async listPoints(
    collectionName: string,
    offset?: string,
    limit?: number,
  ): Promise<{ result: Point[] }> {
    const name = encodeURIComponent(collectionName);
    const params = new URLSearchParams();
    if (offset) {
      params.set('offset', offset);
    }
    params.set('limit', String(limit || 100));

    return this.request(`/collections/${name}/points?${params.toString()}`);
  }

  /** RES-2: Abort pending fetch requests and clean up controllers. */
  dispose(): void {
    for (const controller of this.activeAbortControllers) {
      controller.abort();
    }
    this.activeAbortControllers.clear();
  }
}
