// ─── OpenCode Config Tests ──────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COMPACTION,
  DEFAULT_MODEL,
  DEFAULT_OPENCODE_SETTINGS,
  PREDEFINED_AGENTS,
  getEffectiveModel,
  getEffectiveCompaction,
} from './config';
import type { AgentConfig, ModelConfig, CompactionConfig } from './config';

describe('DEFAULT_COMPACTION', () => {
  it('should have auto mode by default', () => {
    expect(DEFAULT_COMPACTION.mode).toBe('auto');
  });

  it('should have sensible defaults', () => {
    expect(DEFAULT_COMPACTION.maxMessages).toBe(50);
    expect(DEFAULT_COMPACTION.reservedMessages).toBe(10);
    expect(DEFAULT_COMPACTION.reservedTokens).toBe(4096);
    expect(DEFAULT_COMPACTION.compacting).toBe(false);
  });
});

describe('DEFAULT_MODEL', () => {
  it('should have opencode/big-pickle as default model', () => {
    expect(DEFAULT_MODEL.model).toBe('opencode/big-pickle');
    expect(DEFAULT_MODEL.provider).toBe('opencode');
  });

  it('should have small model configured', () => {
    expect(DEFAULT_MODEL.smallModel).toBe('opencode/north-mini-code-free');
    expect(DEFAULT_MODEL.smallModelProvider).toBe('opencode');
  });
});

describe('DEFAULT_OPENCODE_SETTINGS', () => {
  it('should use port 4096', () => {
    expect(DEFAULT_OPENCODE_SETTINGS.port).toBe(4096);
  });

  it('should use localhost', () => {
    expect(DEFAULT_OPENCODE_SETTINGS.hostname).toBe('127.0.0.1');
  });

  it('should have health check interval of 5s', () => {
    expect(DEFAULT_OPENCODE_SETTINGS.healthCheckIntervalMs).toBe(5000);
  });

  it('should have max reconnect attempts of 10', () => {
    expect(DEFAULT_OPENCODE_SETTINGS.maxReconnectAttempts).toBe(10);
  });
});

describe('PREDEFINED_AGENTS', () => {
  it('should have 19 agents', () => {
    expect(PREDEFINED_AGENTS).toHaveLength(19);
  });

  it('should have unique agent names', () => {
    const names = PREDEFINED_AGENTS.map((a) => a.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should have architect, code-reviewer, test-writer, researcher, tester, translator, documenter, and general-assistant enabled by default', () => {
    const enabledAgents = PREDEFINED_AGENTS.filter((a) => a.enabled);
    const enabledNames = enabledAgents.map((a) => a.name);
    expect(enabledNames).toContain('architect');
    expect(enabledNames).toContain('code-reviewer');
    expect(enabledNames).toContain('test-writer');
    expect(enabledNames).toContain('debugger');
    expect(enabledNames).toContain('general-assistant');
    expect(enabledNames).toContain('researcher');
    expect(enabledNames).toContain('tester');
    expect(enabledNames).toContain('translator');
    expect(enabledNames).toContain('documenter');
  });

  it('should have system prompts for all agents', () => {
    for (const agent of PREDEFINED_AGENTS) {
      expect(agent.systemPrompt).toBeTruthy();
      expect(agent.systemPrompt!.length).toBeGreaterThan(10);
    }
  });

  it('should have tools configured for all agents', () => {
    for (const agent of PREDEFINED_AGENTS) {
      expect(agent.tools).toBeDefined();
    }
  });
});

describe('getEffectiveModel', () => {
  const globalModel: ModelConfig = {
    model: 'gpt-4',
    provider: 'openai',
    smallModel: 'qwen-2.5-3b',
    smallModelProvider: 'ollama',
  };

  it('should return global model when agent has no model config', () => {
    const agent: AgentConfig = {
      name: 'test-agent',
      enabled: true,
    };

    const result = getEffectiveModel(agent, globalModel);
    expect(result.model).toBe('gpt-4');
    expect(result.provider).toBe('openai');
  });

  it('should return global model when agent is undefined', () => {
    const result = getEffectiveModel(undefined, globalModel);
    expect(result.model).toBe('gpt-4');
  });

  it('should override model when agent has custom config', () => {
    const agent: AgentConfig = {
      name: 'test-agent',
      enabled: true,
      model: {
        model: 'claude-3-opus',
        provider: 'anthropic',
      },
    };

    const result = getEffectiveModel(agent, globalModel);
    expect(result.model).toBe('claude-3-opus');
    expect(result.provider).toBe('anthropic');
    // Should inherit small model from global
    expect(result.smallModel).toBe('qwen-2.5-3b');
  });

  it('should fully override when agent has complete model config', () => {
    const agent: AgentConfig = {
      name: 'test-agent',
      enabled: true,
      model: {
        model: 'custom-model',
        provider: 'custom-provider',
        smallModel: 'custom-small',
        smallModelProvider: 'custom-small-provider',
        maxTokens: 4096,
        temperature: 0.5,
      },
    };

    const result = getEffectiveModel(agent, globalModel);
    expect(result.model).toBe('custom-model');
    expect(result.smallModel).toBe('custom-small');
    expect(result.maxTokens).toBe(4096);
    expect(result.temperature).toBe(0.5);
  });
});

describe('getEffectiveCompaction', () => {
  const globalCompaction: CompactionConfig = {
    mode: 'auto',
    maxMessages: 50,
    reservedMessages: 10,
    reservedTokens: 4096,
  };

  it('should return global compaction when agent has no config', () => {
    const agent: AgentConfig = {
      name: 'test-agent',
      enabled: true,
    };

    const result = getEffectiveCompaction(agent, globalCompaction);
    expect(result.mode).toBe('auto');
  });

  it('should return global compaction when agent is undefined', () => {
    const result = getEffectiveCompaction(undefined, globalCompaction);
    expect(result.mode).toBe('auto');
  });

  it('should override compaction mode', () => {
    const agent: AgentConfig = {
      name: 'test-agent',
      enabled: true,
      compaction: {
        mode: 'prune',
        maxMessages: 20,
      },
    };

    const result = getEffectiveCompaction(agent, globalCompaction);
    expect(result.mode).toBe('prune');
    expect(result.maxMessages).toBe(20);
    // Should inherit from global
    expect(result.reservedMessages).toBe(10);
  });
});
