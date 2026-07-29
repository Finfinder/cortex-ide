import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SETTINGS,
  QdrantSettingsSchema,
  BgeM3SettingsSchema,
  LlmSettingsSchema,
  SettingsSchema,
  hasUnencryptedSecrets,
  loadSettings,
  saveSettings,
} from './settings';

describe('Settings Store & Schema Validation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Zod Schema Timeout Bounds (SEC-6)', () => {
    it('accepts default valid timeouts', () => {
      const qdrant = QdrantSettingsSchema.parse({ url: 'http://localhost:6333', timeout: 5000 });
      expect(qdrant.timeout).toBe(5000);

      const bge = BgeM3SettingsSchema.parse({ url: 'http://localhost:8081', timeout: 10000 });
      expect(bge.timeout).toBe(10000);

      const llm = LlmSettingsSchema.parse({ url: 'http://localhost:4096', timeout: 15000 });
      expect(llm.timeout).toBe(15000);
    });

    it('rejects timeout below 1000ms (SEC-6)', () => {
      expect(() =>
        QdrantSettingsSchema.parse({ url: 'http://localhost:6333', timeout: 500 }),
      ).toThrow();

      expect(() =>
        BgeM3SettingsSchema.parse({ url: 'http://localhost:8081', timeout: 0 }),
      ).toThrow();
    });

    it('rejects timeout above 60000ms (SEC-6)', () => {
      expect(() =>
        QdrantSettingsSchema.parse({ url: 'http://localhost:6333', timeout: 100000 }),
      ).toThrow();

      expect(() =>
        LlmSettingsSchema.parse({ url: 'http://localhost:4096', timeout: Infinity }),
      ).toThrow();
    });
  });

  describe('Unencrypted Secrets Warning Helper (SEC-2)', () => {
    it('returns false for default settings without API keys', () => {
      expect(hasUnencryptedSecrets(DEFAULT_SETTINGS)).toBe(false);
    });

    it('returns true when infra settings contain API key', () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        infra: {
          ...DEFAULT_SETTINGS.infra,
          qdrant: { ...DEFAULT_SETTINGS.infra.qdrant, apiKey: 'secret-qdrant-key' },
        },
      };
      expect(hasUnencryptedSecrets(customSettings)).toBe(true);
    });

    it('returns true when LLM provider settings contain API key', () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        llmProviders: {
          providers: [
            {
              id: 'custom',
              name: 'Custom Provider',
              provider: 'custom' as const,
              url: 'http://localhost:8080',
              apiKey: 'sk-1234567890',
              enabled: true,
              timeout: 10000,
              models: [],
            },
          ],
        },
      };
      expect(hasUnencryptedSecrets(customSettings)).toBe(true);
    });
  });

  describe('loadSettings and saveSettings', () => {
    it('returns default settings when store is empty', async () => {
      const settings = await loadSettings();
      expect(settings.version).toBe(1);
      expect(settings.infra.qdrant.url).toBe('http://localhost:6333');
    });

    it('persists and loads updated settings safely', async () => {
      const updated = {
        ...DEFAULT_SETTINGS,
        infra: {
          ...DEFAULT_SETTINGS.infra,
          qdrant: {
            url: 'http://localhost:6334',
            timeout: 8000,
          },
        },
      };

      await saveSettings(updated);
      const loaded = await loadSettings();
      expect(loaded.infra.qdrant.url).toBe('http://localhost:6334');
      expect(loaded.infra.qdrant.timeout).toBe(8000);
    });
  });
});
