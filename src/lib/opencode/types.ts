// ─── OpenCode SDK API Types ─────────────────────────────────────────────────
// Based on OpenCode SDK server REST API (serve command)

// ─── Session ────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  slug?: string;
  projectID?: string;
  directory?: string;
  path?: string;
  title?: string;
  agent?: string;
  model?: { id: string; providerID: string; variant?: string };
  cost: number;
  tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
  summary?: { additions: number; deletions: number; files: number };
  version?: string;
  time: { created: number; updated: number };
}

/** GET /session returns Session[] directly (not wrapped in an object) */
export type SessionListResponse = Session[];

/** DELETE /session/:id returns boolean true */
export type SessionDeleteResponse = boolean;

/** POST /session/:id/abort returns boolean true */
export type SessionAbortResponse = boolean;

// ─── Message ────────────────────────────────────────────────────────────────

export interface MessageInfo {
  id: string;
  sessionID: string;
  parentID?: string;
  role: 'user' | 'assistant' | 'system';
  mode?: string;
  agent?: string;
  path?: { cwd: string; root: string };
  cost: number;
  tokens: { total: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } };
  modelID?: string;
  providerID?: string;
  finish?: string;
  time: { created: number; completed?: number };
}

/** A message envelope as returned by the API: { info, parts } */
export interface MessageEnvelope {
  info: MessageInfo;
  parts: Part[];
}

/** GET /session/:id/message returns MessageEnvelope[] */
export type MessageListResponse = MessageEnvelope[];

/** POST /session/:id/message returns MessageEnvelope */
export type ChatResponse = MessageEnvelope;

export interface ChatMessage {
  modelID?: string;
  providerID?: string;
  parts: MessagePart[];
  system?: string;
  tools?: Record<string, boolean>;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'file'; path: string; content?: string };

// ─── Part (response) ────────────────────────────────────────────────────────

export type Part =
  | TextPart
  | FilePart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart;

export interface TextPart {
  id: string;
  messageID: string;
  sessionID: string;
  text: string;
  type: 'text';
  synthetic?: boolean;
  time?: { created: number };
}

export interface FilePart {
  id: string;
  messageID: string;
  sessionID: string;
  path: string;
  content?: string;
  type: 'file';
}

export interface ToolPart {
  id: string;
  callID: string;
  messageID: string;
  sessionID: string;
  state: ToolState;
  tool: string;
  type: 'tool';
}

export type ToolState =
  | ToolStatePending
  | ToolStateRunning
  | ToolStateCompleted
  | ToolStateError;

export interface ToolStatePending {
  status: 'pending';
}

export interface ToolStateRunning {
  status: 'running';
  time: { start: number };
  input?: unknown;
  metadata?: Record<string, unknown>;
  title?: string;
}

export interface ToolStateCompleted {
  input: Record<string, unknown>;
  metadata: Record<string, unknown>;
  output: string;
  status: 'completed';
  time: { start: number; end: number };
  title: string;
}

export interface ToolStateError {
  error: string;
  input: Record<string, unknown>;
  status: 'error';
  time: { start: number; end: number };
}

export interface StepStartPart {
  id: string;
  messageID: string;
  sessionID: string;
  type: 'step-start';
}

export interface StepFinishPart {
  id: string;
  cost: number;
  messageID: string;
  sessionID: string;
  tokens: { input: number; output: number };
  type: 'step-finish';
}

export interface SnapshotPart {
  id: string;
  messageID: string;
  sessionID: string;
  type: 'snapshot';
  content: string;
}

export interface PatchPart {
  id: string;
  messageID: string;
  sessionID: string;
  type: 'patch';
  file: string;
  patch: string;
}

// ─── Events (SSE) ───────────────────────────────────────────────────────────

export type EventType =
  | 'message.updated'
  | 'message.removed'
  | 'message.part.updated'
  | 'message.part.removed'
  | 'permission.updated'
  | 'session.updated'
  | 'session.deleted'
  | 'session.idle'
  | 'session.error'
  | 'file.edited'
  | 'file.watcher.updated'
  | 'storage.write'
  | 'installation.updated'
  | 'lsp.client.diagnostics'
  | 'ide.installed';

export interface OpencodeEvent {
  type: EventType;
  properties: Record<string, unknown>;
}

export interface EventMessageUpdated extends OpencodeEvent {
  type: 'message.updated';
  properties: { info: MessageInfo };
}

export interface EventMessagePartUpdated extends OpencodeEvent {
  type: 'message.part.updated';
  properties: { part: Part };
}

export interface EventPermissionUpdated extends OpencodeEvent {
  type: 'permission.updated';
  properties: {
    id: string;
    sessionID: string;
    title: string;
    time: { created: number };
    metadata: Record<string, unknown>;
  };
}

export interface EventSessionIdle extends OpencodeEvent {
  type: 'session.idle';
  properties: { sessionID: string };
}

export interface EventSessionError extends OpencodeEvent {
  type: 'session.error';
  properties: {
    sessionID?: string;
    error?: string;
  };
}

export interface EventSessionUpdated extends OpencodeEvent {
  type: 'session.updated';
  properties: { info: Session };
}

export interface EventFileEdited extends OpencodeEvent {
  type: 'file.edited';
  properties: { file: string };
}

// ─── Health ─────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version?: string;
}

// ─── Spawn (Tauri IPC) ──────────────────────────────────────────────────────

export interface SpawnHandle {
  pid: number | null;
  port: number;
  binary_path: string;
  config: SpawnConfig;
}

export interface SpawnConfig {
  cwd: string;
  port: number;
  hostname: string;
  cors: string[];
  custom_binary_path: string | null;
  mdns: boolean;
}

export interface OpencodeStatus {
  pid: number | null;
  is_alive: boolean;
  restart_count: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'down' | 'unknown';
  consecutive_failures: number;
  needs_reconnect: boolean;
}
