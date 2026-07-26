// ─── Agent Context ──────────────────────────────────────────────────────────
// Central state for Agent UI: sessions, messages (with streaming), tool calls,
// pending patches, SSE wiring, connection status.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  OpencodeClient,
  OpencodeEventStream,
  type OpencodeEvent,
  type Session,
  type MessageEnvelope,
  type Part,
  type SseStatus,
} from '@/lib/opencode';
import type { UiMessage, PendingPatch } from './types';

// ─── State ──────────────────────────────────────────────────────────────────

interface AgentState {
  sessions: Session[];
  activeSessionId: string | null;
  /** Messages per session id. */
  messages: Record<string, UiMessage[]>;
  patches: PendingPatch[];
  sseStatus: SseStatus;
  error: string | null;
  /** Total tokens used in active session (from latest assistant message). */
  tokens: { input: number; output: number };
  /** Cost in credits (if provided by API). */
  cost: number;
  /** Active (pending/running) tool call count in active session. */
  activeToolCalls: number;
  /** Whether assistant is currently generating (any streaming message). */
  generating: boolean;
}

const initialState: AgentState = {
  sessions: [],
  activeSessionId: null,
  messages: {},
  patches: [],
  sseStatus: 'disconnected',
  error: null,
  tokens: { input: 0, output: 0 },
  cost: 0,
  activeToolCalls: 0,
  generating: false,
};

// ─── Actions ────────────────────────────────────────────────────────────────

type Action =
  | { type: 'sessions.loaded'; sessions: Session[] }
  | { type: 'session.created'; session: Session }
  | { type: 'session.deleted'; id: string }
  | { type: 'session.select'; id: string | null }
  | { type: 'messages.loaded'; sessionId: string; envelopes: MessageEnvelope[] }
  | { type: 'message.upsert'; sessionId: string; message: UiMessage }
  | { type: 'part.upsert'; sessionId: string; messageId: string; part: Part }
  | { type: 'part.remove'; sessionId: string; messageId: string; partId: string }
  | { type: 'patch.add'; patch: PendingPatch }
  | { type: 'patch.resolve'; id: string; status: 'approved' | 'rejected' }
  | { type: 'sse.status'; status: SseStatus }
  | { type: 'error'; error: string | null }
  | { type: 'usage'; tokens: { input: number; output: number }; cost: number };

function reducer(state: AgentState, action: Action): AgentState {
  switch (action.type) {
    case 'sessions.loaded':
      return { ...state, sessions: action.sessions };
    case 'session.created':
      return {
        ...state,
        sessions: [action.session, ...state.sessions],
        activeSessionId: action.session.id,
      };
    case 'session.deleted': {
      const sessions = state.sessions.filter((s) => s.id !== action.id);
      const messages = { ...state.messages };
      delete messages[action.id];
      return {
        ...state,
        sessions,
        messages,
        activeSessionId:
          state.activeSessionId === action.id
            ? (sessions[0]?.id ?? null)
            : state.activeSessionId,
      };
    }
    case 'session.select':
      return { ...state, activeSessionId: action.id, error: null };
    case 'messages.loaded': {
      const messages: UiMessage[] = action.envelopes.map((env) => ({
        id: env.info.id,
        role: env.info.role,
        parts: env.parts,
        streaming: env.info.time.completed == null && env.info.role === 'assistant',
        time: env.info.time,
      }));
      // Queue patch parts from loaded messages (not only SSE-driven ones),
      // so patches survive a session reload.
      const loadedPatches = action.envelopes.flatMap((env) =>
        env.parts
          .filter((p): p is Extract<Part, { type: 'patch' }> => p.type === 'patch')
          .map((p) => ({
            id: p.id,
            messageID: env.info.id,
            sessionID: env.info.sessionID,
            file: p.file,
            patch: p.patch,
            status: 'pending' as const,
          })),
      );
      const patches = [...state.patches];
      for (const p of loadedPatches) {
        if (!patches.some((existing) => existing.id === p.id)) patches.push(p);
      }
      return {
        ...state,
        messages: { ...state.messages, [action.sessionId]: messages },
        patches,
        ...deriveSessionStats(messages),
      };
    }
    case 'message.upsert': {
      const list = state.messages[action.sessionId] ?? [];
      const idx = list.findIndex((m) => m.id === action.message.id);
      const next =
        idx >= 0
          ? list.map((m, i) => (i === idx ? action.message : m))
          : [...list, action.message];
      return {
        ...state,
        messages: { ...state.messages, [action.sessionId]: next },
        ...deriveSessionStats(next),
      };
    }
    case 'part.upsert': {
      const list = state.messages[action.sessionId] ?? [];
      const next = list.map((m) => {
        if (m.id !== action.messageId) return m;
        const pIdx = m.parts.findIndex((p) => p.id === action.part.id);
        const parts =
          pIdx >= 0
            ? m.parts.map((p, i) => (i === pIdx ? action.part : p))
            : [...m.parts, action.part];
        return { ...m, parts };
      });
      return {
        ...state,
        messages: { ...state.messages, [action.sessionId]: next },
        ...deriveSessionStats(next),
      };
    }
    case 'part.remove': {
      const list = state.messages[action.sessionId] ?? [];
      const next = list.map((m) =>
        m.id === action.messageId
          ? { ...m, parts: m.parts.filter((p) => p.id !== action.partId) }
          : m,
      );
      return {
        ...state,
        messages: { ...state.messages, [action.sessionId]: next },
      };
    }
    case 'patch.add':
      if (state.patches.some((p) => p.id === action.patch.id)) return state;
      return { ...state, patches: [...state.patches, action.patch] };
    case 'patch.resolve':
      return {
        ...state,
        patches: state.patches.map((p) =>
          p.id === action.id ? { ...p, status: action.status } : p,
        ),
      };
    case 'sse.status':
      return { ...state, sseStatus: action.status };
    case 'error':
      return { ...state, error: action.error };
    case 'usage':
      return { ...state, tokens: action.tokens, cost: action.cost };
    default:
      return state;
  }
}

function deriveSessionStats(messages: UiMessage[]): Partial<AgentState> {
  let activeToolCalls = 0;
  let generating = false;
  for (const m of messages) {
    if (m.streaming) generating = true;
    for (const p of m.parts) {
      if (p.type === 'tool' && (p.state.status === 'pending' || p.state.status === 'running')) {
        activeToolCalls++;
      }
    }
  }
  return { activeToolCalls, generating };
}

// ─── Context ────────────────────────────────────────────────────────────────

export interface AgentContextValue {
  state: AgentState;
  client: OpencodeClient;
  /** Working directory of the OpenCode server. */
  cwd: string;
  createSession: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  cancelGeneration: () => Promise<void>;
  resolvePatch: (id: string, status: 'approved' | 'rejected') => void;
  resolveAllPatches: (status: 'approved' | 'rejected') => void;
  refreshSessions: () => Promise<void>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export interface AgentProviderProps {
  readonly baseUrl: string;
  /** Working directory of the spawned OpenCode server (used for git commands). */
  readonly cwd?: string;
  readonly children: ReactNode;
}

export function AgentProvider({ baseUrl, cwd = '.', children }: AgentProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [client] = useState(() => new OpencodeClient({ baseUrl }));
  const clientRef = useRef(client);
  const streamRef = useRef<OpencodeEventStream | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ─── SSE event handling ──────────────────────────────────────────────

  const handleEvent = useCallback((event: OpencodeEvent) => {
    const props = event.properties as Record<string, unknown>;
    switch (event.type) {
      case 'message.updated': {
        const info = props.info as MessageEnvelope['info'];
        const current = stateRef.current;
        const existing = (current.messages[info.sessionID] ?? []).find(
          (m) => m.id === info.id,
        );
        const message: UiMessage = {
          id: info.id,
          role: info.role,
          parts: existing?.parts ?? [],
          streaming: info.time.completed == null && info.role === 'assistant',
          time: info.time,
        };
        dispatch({ type: 'message.upsert', sessionId: info.sessionID, message });
        dispatch({
          type: 'usage',
          tokens: { input: info.tokens.input, output: info.tokens.output },
          cost: info.cost,
        });
        break;
      }
      case 'message.part.updated': {
        const part = props.part as Part;
        const sessionId = (part as { sessionID?: string }).sessionID;
        const messageId = (part as { messageID?: string }).messageID;
        if (!sessionId || !messageId) return;
        dispatch({ type: 'part.upsert', sessionId, messageId, part });
        if (part.type === 'patch') {
          dispatch({
            type: 'patch.add',
            patch: {
              id: part.id,
              messageID: messageId,
              sessionID: sessionId,
              file: part.file,
              patch: part.patch,
              status: 'pending',
            },
          });
        }
        break;
      }
      case 'message.part.removed': {
        const part = props.part as Part;
        const sessionId = (part as { sessionID?: string }).sessionID;
        const messageId = (part as { messageID?: string }).messageID;
        if (!sessionId || !messageId) return;
        dispatch({ type: 'part.remove', sessionId, messageId, partId: part.id });
        break;
      }
      case 'session.updated': {
        const info = props.info as Session;
        const sessions = stateRef.current.sessions.map((s) =>
          s.id === info.id ? info : s,
        );
        dispatch({ type: 'sessions.loaded', sessions });
        break;
      }
      case 'session.deleted': {
        const info = props.info as Session | undefined;
        if (info?.id) dispatch({ type: 'session.deleted', id: info.id });
        break;
      }
      case 'session.error': {
        const err = props.error as string | undefined;
        dispatch({ type: 'error', error: err ?? 'OpenCode session error' });
        break;
      }
      default:
        break;
    }
  }, []);

  // ─── SSE lifecycle ───────────────────────────────────────────────────

  useEffect(() => {
    const stream = new OpencodeEventStream({
      url: clientRef.current.getEventStreamUrl(),
      onEvent: handleEvent,
      onStatusChange: (status) => dispatch({ type: 'sse.status', status }),
      reconnectDelay: 3000,
      maxReconnectAttempts: 10,
    });
    streamRef.current = stream;
    stream.connect();
    return () => {
      stream.disconnect();
      streamRef.current = null;
    };
  }, [handleEvent]);

  // ─── Session operations ──────────────────────────────────────────────

  const refreshSessions = useCallback(async () => {
    try {
      const sessions = await clientRef.current.listSessions();
      dispatch({ type: 'sessions.loaded', sessions });
      const current = stateRef.current;
      if (!current.activeSessionId && sessions.length > 0) {
        dispatch({ type: 'session.select', id: sessions[0].id });
      }
    } catch (e) {
      dispatch({
        type: 'error',
        error: e instanceof Error ? e.message : 'Failed to load sessions',
      });
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  // Load messages when active session changes
  useEffect(() => {
    const id = state.activeSessionId;
    if (!id) return;
    if (state.messages[id]) return; // already loaded
    let cancelled = false;
    clientRef.current
      .getMessages(id)
      .then((envelopes) => {
        if (!cancelled) {
          dispatch({ type: 'messages.loaded', sessionId: id, envelopes });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          dispatch({
            type: 'error',
            error: e instanceof Error ? e.message : 'Failed to load messages',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.activeSessionId, state.messages]);

  const createSession = useCallback(async () => {
    try {
      const { id } = await clientRef.current.createSession();
      const session = await clientRef.current.getSession(id);
      dispatch({ type: 'session.created', session });
    } catch (e) {
      dispatch({
        type: 'error',
        error: e instanceof Error ? e.message : 'Failed to create session',
      });
    }
  }, []);

  const selectSession = useCallback(async (id: string) => {
    dispatch({ type: 'session.select', id });
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await clientRef.current.deleteSession(id);
      dispatch({ type: 'session.deleted', id });
    } catch (e) {
      dispatch({
        type: 'error',
        error: e instanceof Error ? e.message : 'Failed to delete session',
      });
    }
  }, []);

  const renameSession = useCallback(async (_id: string, _title: string) => {
    // OpenCode generates titles automatically; there is no rename endpoint.
    // Keep as a no-op placeholder for future SDK support.
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const sessionId = stateRef.current.activeSessionId;
    if (!sessionId || !text.trim()) return;
    dispatch({ type: 'error', error: null });
    try {
      await clientRef.current.chat(sessionId, {
        parts: [{ type: 'text', text: text.trim() }],
      });
    } catch (e) {
      dispatch({
        type: 'error',
        error: e instanceof Error ? e.message : 'Failed to send message',
      });
    }
  }, []);

  const cancelGeneration = useCallback(async () => {
    const sessionId = stateRef.current.activeSessionId;
    if (!sessionId) return;
    try {
      await clientRef.current.abortSession(sessionId);
    } catch (e) {
      dispatch({
        type: 'error',
        error: e instanceof Error ? e.message : 'Failed to cancel generation',
      });
    }
  }, []);

  const resolvePatch = useCallback(
    (id: string, status: 'approved' | 'rejected') => {
      dispatch({ type: 'patch.resolve', id, status });
    },
    [],
  );

  const resolveAllPatches = useCallback((status: 'approved' | 'rejected') => {
    for (const p of stateRef.current.patches) {
      if (p.status === 'pending') {
        dispatch({ type: 'patch.resolve', id: p.id, status });
      }
    }
  }, []);

  const value = useMemo<AgentContextValue>(
    () => ({
      state,
      client,
      cwd,
      createSession,
      selectSession,
      deleteSession,
      renameSession,
      sendMessage,
      cancelGeneration,
      resolvePatch,
      resolveAllPatches,
      refreshSessions,
    }),
    [
      state,
      client,
      cwd,
      createSession,
      selectSession,
      deleteSession,
      renameSession,
      sendMessage,
      cancelGeneration,
      resolvePatch,
      resolveAllPatches,
      refreshSessions,
    ],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return ctx;
}
