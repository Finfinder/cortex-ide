// ─── Agent UI State Types ───────────────────────────────────────────────────
// View-model types for the Agent UI (chat, tool calls, patches).

import type { Part, ToolState } from '@/lib/opencode/types';

/** A single chat message in the UI. */
export interface UiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  /** Ordered parts as received from the API / SSE. */
  parts: Part[];
  /** Whether this message is currently streaming. */
  streaming: boolean;
  time: { created: number; completed?: number };
}

/** Pending patch awaiting review. */
export interface PendingPatch {
  id: string;
  messageID: string;
  sessionID: string;
  file: string;
  /** Unified diff text as produced by OpenCode. */
  patch: string;
  status: 'pending' | 'approved' | 'rejected';
}

/** Tool call status derived from ToolState. */
export type ToolCallStatus = ToolState['status'];

/** Agent definition shown in the agent selector. */
export interface AgentOption {
  name: string;
  description?: string;
  model?: string;
  provider?: string;
  thinkingEffort?: boolean;
}
