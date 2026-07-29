// ─── LLM Provider Abstraction ───────────────────────────────────────────────
// Unified interface over mlx/llama.cpp via OpenAI-compatible API.
// Provider switch via settings.infra.llm.provider — zero hardcoded endpoints.
// Hardened against duplicate /v1 endpoints (BUG-2) and SSRF (SEC-3).

import type { LlmSettings } from '../settings';
import { validateUrl } from '../utils/urlValidator';
import { checkEndpointHealth } from '../utils/healthCheck';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  extraParams?: Record<string, unknown>;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finishReason: string;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finishReason?: string;
  }>;
}

export type StreamHandler = (chunk: StreamChunk) => void;
export type ErrorHandler = (error: Error) => void;

export class LlmProvider {
  private settings: LlmSettings;

  constructor(settings: LlmSettings) {
    this.settings = { ...settings };
  }

  /** Update settings (e.g., after user changes config). */
  updateSettings(settings: Partial<LlmSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /** Get current settings. */
  getSettings(): LlmSettings {
    return { ...this.settings };
  }

  /** Build normalized endpoint URL preventing duplicate /v1 prefixes (BUG-2 & SEC-3). */
  private getEndpoint(path: string): string {
    let url = (this.settings.url || '').trim().replace(/\/+$/, '');
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    if (url.endsWith('/v1') && path.startsWith('/v1/')) {
      path = path.slice(3);
    }

    const fullUrl = `${url}${path}`;
    return validateUrl(fullUrl);
  }

  /** Check if the LLM service is available (SMELL-1 & SEC-3). */
  async health(): Promise<{ status: string; model?: string; provider?: string }> {
    try {
      if (this.settings.provider === 'opencode') {
        const endpoint = this.getEndpoint('/health');
        const result = await checkEndpointHealth(endpoint, '', {
          timeoutMs: this.settings.timeout,
        });
        if (result.status === 'ok' || result.status === 'available') {
          return { status: 'available', provider: 'opencode' };
        }
        return { status: 'unavailable' };
      }

      // Try health endpoint first
      const healthEndpoint = this.getEndpoint('/health');
      const healthResult = await checkEndpointHealth(healthEndpoint, '', {
        timeoutMs: Math.min(this.settings.timeout, 4000),
      });

      if (healthResult.status === 'ok' || healthResult.status === 'available') {
        return {
          status: 'available',
          model: healthResult.model,
          provider: this.settings.provider,
        };
      }

      // Fall back to OpenAI / OpenRouter /v1/models endpoint
      const modelsEndpoint = this.getEndpoint('/v1/models');
      const modelsResult = await checkEndpointHealth(modelsEndpoint, '', {
        headers: this.authHeaders(),
        timeoutMs: this.settings.timeout,
      });

      if (modelsResult.status === 'ok' || modelsResult.status === 'available') {
        return {
          status: 'available',
          model: modelsResult.model,
          provider: this.settings.provider,
        };
      }

      return { status: 'unavailable' };
    } catch {
      return { status: 'unavailable' };
    }
  }

  /** Send a chat completion request. */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const { messages, model, maxTokens, temperature, extraParams } = request;

    const body: Record<string, unknown> = {
      model: model || this.settings.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      ...this.settings.extraParams,
      ...extraParams,
    };

    const endpoint = this.getEndpoint('/v1/chat/completions');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.settings.timeout),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`LLM API error ${response.status}: ${error}`);
    }

    return response.json();
  }

  private parseSseLine(line: string, onChunk: StreamHandler): boolean {
    if (!line.startsWith('data: ')) return false;
    const data = line.slice(6);
    if (data === '[DONE]') return true;

    try {
      const chunk: StreamChunk = JSON.parse(data);
      onChunk(chunk);
    } catch {
      // Ignore parse errors for malformed chunks
    }
    return false;
  }

  /** Send a streaming chat completion request. */
  async chatCompletionStream(
    request: ChatCompletionRequest,
    onChunk: StreamHandler,
    onError?: ErrorHandler,
  ): Promise<void> {
    const { messages, model, maxTokens, temperature, extraParams } = request;

    const body: Record<string, unknown> = {
      model: model || this.settings.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      ...this.settings.extraParams,
      ...extraParams,
    };

    const endpoint = this.getEndpoint('/v1/chat/completions');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.settings.timeout),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      const errorObj = new Error(`LLM API error ${response.status}: ${error}`);
      onError?.(errorObj);
      throw errorObj;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (this.parseSseLine(line, onChunk)) return;
        }
      }
    } catch (error) {
      onError?.(error as Error);
      throw error;
    } finally {
      reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  /** List available models. */
  async listModels(): Promise<Array<{ id: string; name?: string; owner?: string }>> {
    try {
      const endpoint = this.getEndpoint('/v1/models');
      const response = await fetch(endpoint, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(this.settings.timeout),
      });

      if (!response.ok) {
        return [];
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return [];
      }

      const data = await response.json();
      return (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        owner: m.owner || (m.id && typeof m.id === 'string' ? m.id.split('/')[0] : undefined),
      }));
    } catch {
      return [];
    }
  }

  /** Test the LLM connection with a simple completion. */
  async testConnection(): Promise<{ success: boolean; model?: string; error?: string }> {
    try {
      const result = await this.health();
      if (result.status === 'available') {
        return { success: true, model: result.model };
      }
      return { success: false, error: 'Service unavailable' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /** Get authentication headers based on provider. */
  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const key = (this.settings.apiKey || '').trim();

    switch (this.settings.provider) {
      case 'openrouter':
        if (key) {
          headers['Authorization'] = `Bearer ${key}`;
        }
        headers['HTTP-Referer'] = 'https://cortex-ide.app';
        headers['X-Title'] = 'Cortex IDE';
        break;
      case 'openai':
        if (key) {
          headers['Authorization'] = `Bearer ${key}`;
        }
        break;
      case 'anthropic':
        if (key) {
          headers['x-api-key'] = key;
          headers['anthropic-version'] = '2023-06-01';
        }
        break;
      case 'modelark':
      case 'nvidia-nim':
      case 'mlx':
      case 'llama.cpp':
      case 'custom':
      default:
        if (key) {
          headers['Authorization'] = `Bearer ${key}`;
        }
        break;
    }

    return headers;
  }
}
