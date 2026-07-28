// ─── OpenCode Configuration ─────────────────────────────────────────────────
// Configuration types for compaction, model selection, and agent settings.

import type { Session } from './types';


// ─── Compaction ─────────────────────────────────────────────────────────────

export type CompactionMode = 'auto' | 'prune' | 'reserved';

export interface CompactionConfig {
  /** Compaction mode:
   * - auto: OpenCode manages compaction automatically (default)
   * - prune: Remove old messages after threshold
   * - reserved: Keep reserved tokens (system prompt, last N messages)
   */
  mode: CompactionMode;

  /** Maximum number of messages to keep (for prune mode) */
  maxMessages?: number;

  /** Number of most recent messages to always keep (for reserved mode) */
  reservedMessages?: number;

  /** Reserved token budget for system prompt and recent context */
  reservedTokens?: number;

  /** Whether compaction is currently in progress */
  compacting?: boolean;
}

export const DEFAULT_COMPACTION: CompactionConfig = {
  mode: 'auto',
  maxMessages: 50,
  reservedMessages: 10,
  reservedTokens: 4096,
  compacting: false,
};

// ─── Model Configuration ────────────────────────────────────────────────────

export interface ModelConfig {
  /** Model ID (e.g., "gpt-4", "claude-3-opus", "qwen-2.5-3b") */
  model: string;

  /** Provider ID (e.g., "openai", "anthropic", "ollama") */
  provider: string;

  /** Small model for compaction/summarization tasks */
  smallModel?: string;

  /** Small model provider */
  smallModelProvider?: string;

  /** Maximum tokens for the model */
  maxTokens?: number;

  /** Temperature for generation */
  temperature?: number;
}

export const DEFAULT_MODEL: ModelConfig = {
  model: 'opencode/big-pickle',
  provider: 'opencode',
  smallModel: 'opencode/north-mini-code-free',
  smallModelProvider: 'opencode',
  maxTokens: 8192,
  temperature: 0.7,
};

// ─── Agent Configuration ────────────────────────────────────────────────────

export interface AgentConfig {
  /** Agent name (e.g., "architect", "code-reviewer", "test-writer") */
  name: string;

  /** Agent description */
  description?: string;

  /** System prompt for the agent */
  systemPrompt?: string;

  /** Model configuration (overrides global) */
  model?: ModelConfig;

  /** MCP server configurations */
  mcp?: McpServerConfig[];

  /** Compaction configuration (overrides global) */
  compaction?: CompactionConfig;

  /** Tools enabled for this agent */
  tools?: AgentTools;

  /** Whether this agent is enabled */
  enabled: boolean;
}

export interface McpServerConfig {
  /** MCP server name */
  name: string;

  /** Command to start the MCP server */
  command: string;

  /** Arguments for the command */
  args?: string[];

  /** Environment variables */
  env?: Record<string, string>;
}

export interface AgentTools {
  /** File search (grep, glob) */
  search?: boolean;

  /** File read/write/edit */
  edit?: boolean;

  /** Shell command execution */
  shell?: boolean;

  /** Git operations */
  git?: boolean;

  /** Web fetch */
  web?: boolean;

  /** LSP integration */
  lsp?: boolean;
}

export const DEFAULT_AGENT_TOOLS: AgentTools = {
  search: true,
  edit: true,
  shell: false,
  git: true,
  web: false,
  lsp: true,
};

// ─── Global Settings ────────────────────────────────────────────────────────

export interface OpencodeSettings {
  /** Custom path to the opencode binary */
  customBinaryPath?: string;

  /** Default port for the SDK server */
  port: number;

  /** Default hostname */
  hostname: string;

  /** Global model configuration */
  model: ModelConfig;

  /** Global compaction configuration */
  compaction: CompactionConfig;

  /** Per-agent configurations */
  agents: Record<string, AgentConfig>;

  /** Health check interval in milliseconds */
  healthCheckIntervalMs: number;

  /** Maximum reconnect attempts for SSE */
  maxReconnectAttempts: number;

  /** Reconnect delay in milliseconds */
  reconnectDelayMs: number;
}

export const DEFAULT_OPENCODE_SETTINGS: OpencodeSettings = {
  port: 4096,
  hostname: '127.0.0.1',
  model: DEFAULT_MODEL,
  compaction: DEFAULT_COMPACTION,
  agents: {},
  healthCheckIntervalMs: 5000,
  maxReconnectAttempts: 10,
  reconnectDelayMs: 3000,
};

// ─── Predefined Agents ──────────────────────────────────────────────────────

/** Predefined agent templates (from repo: 15 + 4 new agents) */
export const PREDEFINED_AGENTS: AgentConfig[] = [
  {
    name: 'architect',
    description: 'System architecture and design decisions',
    systemPrompt: 'You are a software architect. Focus on system design, patterns, and trade-offs.',
    model: { model: 'opencode/big-pickle', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode' },
    tools: { search: true, edit: false, shell: false, git: false, web: true, lsp: true },
    enabled: true,
  },
  {
    name: 'code-reviewer',
    description: 'Code review and quality analysis',
    systemPrompt: 'You are a code reviewer. Focus on code quality, best practices, and potential issues.',
    model: { model: 'opencode/big-pickle', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode' },
    tools: { search: true, edit: false, shell: false, git: true, web: false, lsp: true },
    enabled: true,
  },
  {
    name: 'test-writer',
    description: 'Test generation and coverage analysis',
    systemPrompt: 'You are a test engineer. Write comprehensive tests with good coverage.',
    model: { model: 'opencode/north-mini-code-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode' },
    tools: { search: true, edit: true, shell: true, git: false, web: false, lsp: true },
    enabled: true,
  },
  {
    name: 'debugger',
    description: 'Debugging and error analysis',
    systemPrompt: 'You are a debugging specialist. Analyze errors, trace issues, and suggest fixes.',
    model: { model: 'opencode/big-pickle', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode' },
    tools: { search: true, edit: true, shell: true, git: true, web: true, lsp: true },
    enabled: true,
  },
  {
    name: 'devops-engineer',
    description: 'CI/CD, infrastructure, and deployment',
    systemPrompt: 'You are a DevOps engineer. Focus on CI/CD, containers, and infrastructure.',
    tools: { search: true, edit: true, shell: true, git: true, web: true, lsp: false },
    enabled: false,
  },
  {
    name: 'security-auditor',
    description: 'Security analysis and vulnerability detection',
    systemPrompt: 'You are a security auditor. Identify vulnerabilities and suggest mitigations.',
    tools: { search: true, edit: false, shell: false, git: true, web: true, lsp: true },
    enabled: false,
  },
  {
    name: 'documentation-writer',
    description: 'Documentation and API reference generation',
    systemPrompt: 'You are a technical writer. Create clear, concise documentation.',
    tools: { search: true, edit: true, shell: false, git: false, web: true, lsp: true },
    enabled: false,
  },
  {
    name: 'refactorer',
    description: 'Code refactoring and modernization',
    systemPrompt: 'You are a refactoring specialist. Improve code structure without changing behavior.',
    tools: { search: true, edit: true, shell: false, git: true, web: false, lsp: true },
    enabled: false,
  },
  {
    name: 'performance-engineer',
    description: 'Performance optimization and profiling',
    systemPrompt: 'You are a performance engineer. Identify bottlenecks and optimize.',
    tools: { search: true, edit: true, shell: true, git: false, web: true, lsp: true },
    enabled: false,
  },
  {
    name: 'data-engineer',
    description: 'Database design, migrations, and queries',
    systemPrompt: 'You are a data engineer. Focus on database design, queries, and data pipelines.',
    tools: { search: true, edit: true, shell: true, git: false, web: false, lsp: true },
    enabled: false,
  },
  {
    name: 'frontend-developer',
    description: 'UI/UX implementation and component design',
    systemPrompt: 'You are a frontend developer. Focus on React, CSS, and component architecture.',
    tools: { search: true, edit: true, shell: false, git: false, web: true, lsp: true },
    enabled: false,
  },
  {
    name: 'backend-developer',
    description: 'API design and backend implementation',
    systemPrompt: 'You are a backend developer. Focus on APIs, services, and data access.',
    tools: { search: true, edit: true, shell: true, git: true, web: false, lsp: true },
    enabled: false,
  },
  {
    name: 'mobile-developer',
    description: 'Mobile app development (React Native, Flutter)',
    systemPrompt: 'You are a mobile developer. Focus on cross-platform mobile development.',
    tools: { search: true, edit: true, shell: true, git: true, web: true, lsp: true },
    enabled: false,
  },
  {
    name: 'ml-engineer',
    description: 'Machine learning and AI integration',
    systemPrompt: 'You are an ML engineer. Focus on model integration, pipelines, and inference.',
    tools: { search: true, edit: true, shell: true, git: false, web: true, lsp: false },
    enabled: false,
  },
  {
    name: 'general-assistant',
    description: 'General-purpose coding assistant',
    systemPrompt: 'You are a helpful coding assistant. Help with any programming task.',
    model: { model: 'opencode/north-mini-code-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode' },
    tools: { search: true, edit: true, shell: true, git: true, web: true, lsp: true },
    enabled: true,
  },
  // ─── New AI Agents ──────────────────────────────────────────────────────
  {
    name: 'researcher',
    description: 'Deep code research and knowledge gathering',
    systemPrompt: 'You are a research specialist. Analyze codebases, gather context from multiple sources, trace dependencies, identify patterns, and compile comprehensive reports. Focus on understanding how systems work before making recommendations.',
    model: { model: 'opencode/big-pickle', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode' },
    tools: { search: true, edit: false, shell: false, git: true, web: true, lsp: true },
    enabled: true,
  },
  {
    name: 'tester',
    description: 'Advanced testing and quality assurance',
    systemPrompt: 'You are a QA engineer. Write unit, integration, and e2e tests. Analyze test coverage, identify untested paths, create test fixtures, and ensure code reliability. Use appropriate testing frameworks and patterns.',
    model: { model: 'opencode/north-mini-code-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode' },
    tools: { search: true, edit: true, shell: true, git: false, web: false, lsp: true },
    enabled: true,
  },
  {
    name: 'translator',
    description: 'Code translation between languages and frameworks',
    systemPrompt: 'You are a code translator. Convert code between programming languages and frameworks while preserving logic, idioms, and best practices. Support TypeScript/JavaScript, Python, Go, Rust, Java, C#, and more.',
    model: { model: 'opencode/big-pickle', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode' },
    tools: { search: true, edit: true, shell: false, git: false, web: true, lsp: true },
    enabled: true,
  },
  {
    name: 'documenter',
    description: 'Comprehensive documentation generation',
    systemPrompt: 'You are a documentation specialist. Generate JSDoc/TSDoc comments, README files, API documentation, inline comments, and architecture docs. Write clear, concise documentation that explains WHY, not just WHAT.',
    model: { model: 'opencode/north-mini-code-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode' },
    tools: { search: true, edit: true, shell: false, git: false, web: true, lsp: true },
    enabled: true,
  },
];

/** All available models from opencode-config.json */
export const AVAILABLE_MODELS: ModelConfig[] = [
  { model: 'opencode/big-pickle', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode', maxTokens: 8192, temperature: 0.7 },
  { model: 'opencode/deepseek-v4-flash-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode', maxTokens: 8192, temperature: 0.7 },
  { model: 'opencode/laguna-s-2.1-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode', maxTokens: 8192, temperature: 0.7 },
  { model: 'opencode/ling-3.0-flash-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode', maxTokens: 8192, temperature: 0.7 },
  { model: 'opencode/mimo-v2.5-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode', maxTokens: 8192, temperature: 0.7 },
  { model: 'opencode/nemotron-3-ultra-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode', maxTokens: 8192, temperature: 0.7 },
  { model: 'opencode/north-mini-code-free', provider: 'opencode', smallModel: 'opencode/north-mini-code-free', smallModelProvider: 'opencode', maxTokens: 8192, temperature: 0.7 },
];

/**
 * Get the effective model config for an agent, falling back to global defaults.
 */
export function getEffectiveModel(
  agent: AgentConfig | undefined,
  globalModel: ModelConfig,
): ModelConfig {
  if (!agent?.model) {
    return globalModel;
  }
  return {
    ...globalModel,
    ...agent.model,
  };
}

/**
 * Convert a session model (from OpenCode API) to a ModelConfig.
 */
export function sessionModelToConfig(sessionModel: Session['model']): ModelConfig {
  if (!sessionModel) {
    return DEFAULT_MODEL;
  }
  return {
    // Use "provider/id" format (matching DEFAULT_MODEL) so split('/') logic
    // in App.tsx/SessionList.tsx produces correct id and providerID.
    model: `${sessionModel.providerID}/${sessionModel.id}`,
    provider: sessionModel.providerID,
    smallModel: DEFAULT_MODEL.smallModel,
    smallModelProvider: DEFAULT_MODEL.smallModelProvider,
    maxTokens: DEFAULT_MODEL.maxTokens,
    temperature: DEFAULT_MODEL.temperature,
  };
}

/**
 * Get the effective compaction config for an agent, falling back to global defaults.
 */
export function getEffectiveCompaction(
  agent: AgentConfig | undefined,
  globalCompaction: CompactionConfig,
): CompactionConfig {
  if (!agent?.compaction) {
    return globalCompaction;
  }
  return {
    ...globalCompaction,
    ...agent.compaction,
  };
}
