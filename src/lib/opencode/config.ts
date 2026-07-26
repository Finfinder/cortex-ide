// ─── OpenCode Configuration ─────────────────────────────────────────────────
// Configuration types for compaction, model selection, and agent settings.

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
  model: 'gpt-4',
  provider: 'openai',
  smallModel: 'qwen-2.5-3b',
  smallModelProvider: 'ollama',
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

/** Predefined agent templates (from repo: 15 agents) */
export const PREDEFINED_AGENTS: AgentConfig[] = [
  {
    name: 'architect',
    description: 'System architecture and design decisions',
    systemPrompt: 'You are a software architect. Focus on system design, patterns, and trade-offs.',
    tools: { search: true, edit: false, shell: false, git: false, web: true, lsp: true },
    enabled: true,
  },
  {
    name: 'code-reviewer',
    description: 'Code review and quality analysis',
    systemPrompt: 'You are a code reviewer. Focus on code quality, best practices, and potential issues.',
    tools: { search: true, edit: false, shell: false, git: true, web: false, lsp: true },
    enabled: true,
  },
  {
    name: 'test-writer',
    description: 'Test generation and coverage analysis',
    systemPrompt: 'You are a test engineer. Write comprehensive tests with good coverage.',
    tools: { search: true, edit: true, shell: true, git: false, web: false, lsp: true },
    enabled: true,
  },
  {
    name: 'debugger',
    description: 'Debugging and error analysis',
    systemPrompt: 'You are a debugging specialist. Analyze errors, trace issues, and suggest fixes.',
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
    tools: { search: true, edit: true, shell: true, git: true, web: true, lsp: true },
    enabled: true,
  },
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
