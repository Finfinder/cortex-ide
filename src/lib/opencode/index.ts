export { OpencodeClient, OpencodeClientError } from './client';
export type { ClientConfig } from './client';

export { OpencodeEventStream, parseSseBuffer } from './sse';
export type { EventCallback, StatusCallback, SseStatus, SseConfig } from './sse';

export {
  DEFAULT_COMPACTION,
  DEFAULT_MODEL,
  DEFAULT_AGENT_TOOLS,
  DEFAULT_OPENCODE_SETTINGS,
  PREDEFINED_AGENTS,
  getEffectiveModel,
  getEffectiveCompaction,
} from './config';
export type {
  CompactionMode,
  CompactionConfig,
  ModelConfig,
  AgentConfig,
  McpServerConfig,
  AgentTools,
  OpencodeSettings,
} from './config';

export type * from './types';

export { useOpencodeHealth } from './useOpencodeHealth';
export type { UseOpencodeHealthOptions, UseOpencodeHealthResult } from './useOpencodeHealth';
