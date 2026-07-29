// ─── Settings Store ──────────────────────────────────────────────────────────
// Persistent settings with Zod schema validation and defaults.
// All infrastructure endpoints are configurable — zero hardcoded URLs.

import { z } from 'zod';
import { invoke } from '@/lib/ipc';
import { MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS, DEFAULT_BATCH_SIZE } from './constants';
import { validateUrl } from './utils/urlValidator';

// ─── Infrastructure Schema (SEC-6: Timeout Validation) ──────────────────────

export const QdrantSettingsSchema = z.object({
  url: z.url().default('http://localhost:6333'),
  apiKey: z.string().optional(),
  timeout: z.number().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
});

export type QdrantSettings = z.infer<typeof QdrantSettingsSchema>;

export const BgeM3SettingsSchema = z.object({
  url: z.url().default('http://localhost:8081'),
  model: z.string().default('bge-m3'),
  timeout: z.number().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
  batchSize: z.number().positive().default(DEFAULT_BATCH_SIZE),
});

export type BgeM3Settings = z.infer<typeof BgeM3SettingsSchema>;

export const LlmSettingsSchema = z.object({
  url: z.string().default('http://127.0.0.1:4096'),
  model: z.string().default('opencode/north-mini-code-free'),
  apiKey: z.string().optional(),
  provider: z.enum(['opencode', 'mlx', 'llama.cpp', 'openrouter', 'modelark', 'nvidia-nim', 'openai', 'anthropic', 'custom']).default('opencode'),
  timeout: z.number().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_LLM_TIMEOUT_MS),
  extraHeaders: z.record(z.string(), z.string()).default({}),
  extraParams: z.record(z.string(), z.unknown()).default({}),
});

export type LlmSettings = z.infer<typeof LlmSettingsSchema>;

export const LlmModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  contextSize: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  cost: z.string().optional(),
  enabled: z.boolean().default(true),
});

export type LlmModel = z.infer<typeof LlmModelSchema>;

export const LlmProviderConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(['opencode', 'mlx', 'llama.cpp', 'openrouter', 'modelark', 'nvidia-nim', 'openai', 'anthropic', 'custom']).default('opencode'),
  url: z.string().default('http://127.0.0.1:4096'),
  apiKey: z.string().optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_LLM_TIMEOUT_MS),
  models: z.array(LlmModelSchema).default([]),
});

export type LlmProviderConfig = z.infer<typeof LlmProviderConfigSchema>;

export const LlmProvidersSettingsSchema = z.object({
  providers: z.array(LlmProviderConfigSchema).default([]),
});

export type LlmProvidersSettings = z.infer<typeof LlmProvidersSettingsSchema>;

export const InfraSettingsSchema = z.object({
  qdrant: QdrantSettingsSchema,
  bgeM3: BgeM3SettingsSchema,
  llm: LlmSettingsSchema,
});

export type InfraSettings = z.infer<typeof InfraSettingsSchema>;

// ─── MCP Schema ─────────────────────────────────────────────────────────────

export const McpServerSchema = z.object({
  type: z.enum(['stdio', 'sse', 'http']).optional(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
  url: z.string().optional(),
  gallery: z.string().optional(),
  version: z.string().optional(),
  autoStart: z.boolean().optional(),
});

export type McpServer = z.infer<typeof McpServerSchema>;

export const McpSettingsSchema = z.object({
  servers: z.record(z.string(), McpServerSchema).default({}),
});

export type McpSettings = z.infer<typeof McpSettingsSchema>;

// ─── OpenCode Schema ────────────────────────────────────────────────────────

export const OpenCodeSettingsSchema = z.object({
  binaryPath: z.string().optional(),
  port: z.number().default(4096),
  workspaceDir: z.string().optional(),
});

export type OpenCodeSettings = z.infer<typeof OpenCodeSettingsSchema>;

// ─── Full Settings Schema ───────────────────────────────────────────────────

export const SettingsSchema = z.object({
  version: z.number().default(1),
  infra: InfraSettingsSchema,
  mcp: McpSettingsSchema,
  llmProviders: LlmProvidersSettingsSchema.default({ providers: [] }),
  opencode: OpenCodeSettingsSchema,
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  autoIndex: z.boolean().default(true),
  maxConcurrentEmbeddings: z.number().positive().default(5),
});

export type Settings = z.infer<typeof SettingsSchema>;

// ─── Default Settings ───────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  infra: {
    qdrant: {
      url: 'http://localhost:6333',
      timeout: DEFAULT_TIMEOUT_MS,
    },
    bgeM3: {
      url: 'http://localhost:8081',
      model: 'bge-m3',
      timeout: DEFAULT_TIMEOUT_MS,
      batchSize: DEFAULT_BATCH_SIZE,
    },
    llm: {
      url: 'http://127.0.0.1:4096',
      model: 'opencode/north-mini-code-free',
      provider: 'opencode',
      timeout: DEFAULT_LLM_TIMEOUT_MS,
      extraHeaders: {},
      extraParams: {},
    },
  },
  mcp: {
    servers: {},
  },
  llmProviders: {
    providers: [
      {
        id: 'opencode',
        name: 'OpenCode',
        provider: 'opencode',
        url: 'http://127.0.0.1:4096',
        enabled: true,
        timeout: DEFAULT_LLM_TIMEOUT_MS,
        models: [
          { id: 'opencode/big-pickle', name: 'opencode/big-pickle', contextSize: '128K', capabilities: ['Tools', 'Code'], enabled: true },
          { id: 'opencode/deepseek-v4-flash-free', name: 'opencode/deepseek-v4-flash-free', contextSize: '128K', capabilities: ['Tools', 'Code'], enabled: true },
          { id: 'opencode/laguna-s-2.1-free', name: 'opencode/laguna-s-2.1-free', contextSize: '128K', capabilities: ['Tools', 'Code'], enabled: true },
          { id: 'opencode/ling-3.0-flash-free', name: 'opencode/ling-3.0-flash-free', contextSize: '128K', capabilities: ['Tools', 'Code'], enabled: true },
          { id: 'opencode/mimo-v2.5-free', name: 'opencode/mimo-v2.5-free', contextSize: '128K', capabilities: ['Tools', 'Code'], enabled: true },
          { id: 'opencode/nemotron-3-ultra-free', name: 'opencode/nemotron-3-ultra-free', contextSize: '128K', capabilities: ['Tools', 'Code'], enabled: true },
          { id: 'opencode/north-mini-code-free', name: 'opencode/north-mini-code-free', contextSize: '128K', capabilities: ['Tools', 'Code'], enabled: true },
        ],
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        provider: 'openrouter',
        url: 'https://openrouter.ai/api/v1',
        enabled: true,
        timeout: DEFAULT_LLM_TIMEOUT_MS,
        models: [
          { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', contextSize: '200K', capabilities: ['Tools', 'Vision', 'Code'], enabled: true },
          { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextSize: '1M', capabilities: ['Tools', 'Vision', 'Code'], enabled: true },
          { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', contextSize: '128K', capabilities: ['Tools', 'Code'], enabled: true },
        ],
      },
      {
        id: 'llama.cpp',
        name: 'Ollama / llama.cpp',
        provider: 'llama.cpp',
        url: 'http://localhost:8080',
        enabled: false,
        timeout: DEFAULT_LLM_TIMEOUT_MS,
        models: [],
      },
    ],
  },
  opencode: {
    port: 4096,
  },
  theme: 'system',
  autoIndex: true,
  maxConcurrentEmbeddings: 5,
};

// ─── Settings Store Implementation ──────────────────────────────────────────

const SETTINGS_KEY = 'cortex-settings';

/** SEC-2: Check if settings contain sensitive API keys */
export function hasUnencryptedSecrets(settings: Settings): boolean {
  if (settings.infra?.qdrant?.apiKey || settings.infra?.llm?.apiKey) return true;
  if (settings.llmProviders?.providers?.some((p) => p.apiKey)) return true;
  return false;
}

/** Load settings from Tauri store (or localStorage in dev). */
export async function loadSettings(): Promise<Settings> {
  let settings: Settings = DEFAULT_SETTINGS;
  try {
    // Try Tauri store first
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load(SETTINGS_KEY);
    const data = await store.get(SETTINGS_KEY);
    if (data && typeof data === 'object') {
      const parsed = SettingsSchema.safeParse(data);
      if (parsed.success) {
        settings = parsed.data;
      } else {
        console.error('[Settings] Validation error, using defaults:', parsed.error.message);
      }
    }
  } catch {
    // Tauri store not available (dev mode), try localStorage
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = SettingsSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          settings = parsed.data;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  if (settings.llmProviders?.providers) {
    void syncOpencodeConfig(settings.llmProviders.providers);
  }

  return settings;
}

let lastSyncedConfig: string | null = null;

/** Sync custom LLM provider credentials into OpenCode global config (~/.config/opencode/opencode.jsonc). */
export async function syncOpencodeConfig(providers: LlmProviderConfig[]): Promise<void> {
  try {
    const providerMap: Record<string, { options: { apiKey: string; baseURL?: string } }> = {};
    for (const p of providers) {
      if (p.enabled && p.apiKey && p.provider !== 'opencode') {
        let validUrl: string | undefined;
        if (p.url) {
          try {
            validUrl = validateUrl(p.url);
          } catch {
            console.warn(`[syncOpencodeConfig] Skipping invalid URL for provider ${p.provider}: "${p.url}"`);
            continue;
          }
        }
        providerMap[p.provider] = {
          options: {
            apiKey: p.apiKey,
            baseURL: validUrl,
          },
        };
      }
    }

    const configContent = JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        provider: providerMap,
      },
      null,
      2,
    );

    if (configContent === lastSyncedConfig) {
      return;
    }
    lastSyncedConfig = configContent;

    try {
      await invoke('save_opencode_config', { content: configContent });
    } catch {
      // Fallback for Vite dev server mode
      await fetch('/api/save-opencode-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: configContent,
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[Settings] Failed to sync OpenCode config:', e);
  }
}

/** Save settings to Tauri store (or localStorage in dev). */
export async function saveSettings(settings: Settings): Promise<void> {
  const toSave = SettingsSchema.parse(settings); // Validate before saving
  if (toSave.llmProviders?.providers) {
    void syncOpencodeConfig(toSave.llmProviders.providers);
  }
  
  try {
    // Try Tauri store first
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load(SETTINGS_KEY);
    await store.set(SETTINGS_KEY, toSave);
    await store.save();
  } catch {
    // Fallback to localStorage for dev mode (SEC-2 Warning logged if unencrypted secrets present)
    if (hasUnencryptedSecrets(toSave)) {
      console.warn('[Security Warning] API keys are stored in unencrypted browser localStorage (dev mode).');
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave));
  }
}

/** Reset settings to defaults. */
export async function resetSettings(): Promise<Settings> {
  await saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

/** Update a specific settings field. */
export async function updateSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const updated = { ...current, ...partial };
  await saveSettings(updated);
  return updated;
}
