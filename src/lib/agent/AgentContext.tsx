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
import { listen } from '@/lib/ipc';
import type { UiMessage, PendingPatch } from './types';

// ─── Debug logging (browser console) ──────────────────────────────────────

function debugLog(...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.log('[AgentContext]', ...args);
  }
}

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
        // Clear any stale error when messages are flowing
        error: null,
        ...deriveSessionStats(next),
      };
    }
    case 'part.upsert': {
      const list = state.messages[action.sessionId] ?? [];
      const msgIdx = list.findIndex((m) => m.id === action.messageId);
      // If the message doesn't exist yet (race condition: part.updated before message.updated),
      // create a placeholder so the part can be attached
      if (msgIdx < 0) {
        const part = action.part;
        const placeholder: UiMessage = {
          id: action.messageId,
          role: ((part as { role?: string }).role as UiMessage['role']) ?? 'assistant',
          parts: [action.part],
          streaming: true,
          time: { created: Date.now() },
        };
        return {
          ...state,
          messages: { ...state.messages, [action.sessionId]: [...list, placeholder] },
          error: null,
          ...deriveSessionStats([...list, placeholder]),
        };
      }
      const next = list.map((m, i) => {
        if (i !== msgIdx) return m;
        const pIdx = m.parts.findIndex((p) => p.id === action.part.id);
        const parts =
          pIdx >= 0
            ? m.parts.map((p, pi) => (pi === pIdx ? action.part : p))
            : [...m.parts, action.part];
        return { ...m, parts };
      });
      return {
        ...state,
        messages: { ...state.messages, [action.sessionId]: next },
        error: null,
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
      debugLog('[Reducer] sse.status:', action.status, '(prev:', state.sseStatus, ')');
      // Only update sseStatus — do NOT clear `error`. Explicit API errors
      // (500, network failure) must persist until retry or a successful
      // operation clears them. SSE reconnection is handled separately by
      // `debouncedSseError` in ErrorBanner (debounced 4s), which clears
      // automatically when sseStatus leaves 'error'.
      return { ...state, sseStatus: action.status };
    case 'error':
      debugLog('[Reducer] error:', action.error, '(prev:', state.error, ')');
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
  /** Whether the Tauri backend has emitted the ready event. */
  backendReady: boolean;
  createSession: (model?: { id: string; providerID: string }) => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  sendMessage: (text: string, model?: { modelID?: string; providerID?: string }) => Promise<void>;
  cancelGeneration: () => Promise<void>;
  resolvePatch: (id: string, status: 'approved' | 'rejected') => void;
  resolveAllPatches: (status: 'approved' | 'rejected') => void;
  refreshSessions: () => Promise<void>;
}

export const AgentContext = createContext<AgentContextValue | null>(null);

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
  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
      console.trace('[AgentContext] refreshSessions error:', e);
      dispatch({
        type: 'error',
        error: e instanceof Error ? e.message : 'Failed to load sessions',
      });
    }
  }, []);

  // ─── Wait for Tauri backend ready ────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let unlistenReady: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const setup = async () => {
      try {
        // Listen for errors first
        unlistenError = await listen<string>('backend://error', (msg) => {
          if (!cancelled) {
            console.trace('[AgentContext] backend://error event:', msg);
            dispatch({ type: 'error', error: msg });
          }
        });

        // Guard: unmount may have happened while awaiting the promise
        if (cancelled) {
          unlistenError();
          unlistenError = null;
          return;
        }

        // Then wait for ready
        unlistenReady = await listen<undefined>('backend://ready', () => {
          if (!cancelled) {
            if (fallbackTimer) clearTimeout(fallbackTimer);
            setBackendReady(true);
            void refreshSessions();
          }
        });

        // Guard: unmount may have happened while awaiting the promise
        if (cancelled) {
          unlistenReady();
          unlistenReady = null;
          return;
        }

        // Fallback: if the ready event was emitted before we registered the
        // listener (race condition), auto-start after 30 seconds.
        // The backend now waits for OpenCode to be healthy before emitting
        // ready, which can take 10-15 seconds.
        fallbackTimer = setTimeout(() => {
          if (!cancelled) {
            console.log('[AgentContext] backend://ready fallback timeout — starting anyway');
            setBackendReady(true);
            void refreshSessions();
          }
        }, 30000);
      } catch {
        // Not running inside Tauri — fall back to immediate start
        if (!cancelled) {
          setBackendReady(true);
          void refreshSessions();
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unlistenReady?.();
      unlistenError?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── SSE event handling ──────────────────────────────────────────────

  const handleMessageUpdated = useCallback((props: Record<string, unknown>) => {
    const info = props.info as MessageEnvelope['info'];
    const current = stateRef.current;
    const existing = (current.messages[info.sessionID] ?? []).find(
      (m) => m.id === info.id,
    );
    const preservedParts = existing?.parts && existing.parts.length > 0
      ? existing.parts
      : [];
    const infoParts = (info as { parts?: Part[] }).parts;
    const finalParts = infoParts && infoParts.length > 0 ? infoParts : preservedParts;
    const message: UiMessage = {
      id: info.id,
      role: info.role,
      parts: finalParts,
      streaming: info.time.completed == null && info.role === 'assistant',
      time: info.time,
    };
    dispatch({ type: 'message.upsert', sessionId: info.sessionID, message });
    dispatch({
      type: 'usage',
      tokens: { input: info.tokens.input, output: info.tokens.output },
      cost: info.cost,
    });
  }, []);

  const handlePartUpdated = useCallback((props: Record<string, unknown>) => {
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
  }, []);

  const handlePartRemoved = useCallback((props: Record<string, unknown>) => {
    const part = props.part as Part;
    const sessionId = (part as { sessionID?: string }).sessionID;
    const messageId = (part as { messageID?: string }).messageID;
    if (!sessionId || !messageId) return;
    dispatch({ type: 'part.remove', sessionId, messageId, partId: part.id });
  }, []);

  const handleEvent = useCallback((event: OpencodeEvent) => {
    debugLog(`[SSE-Handler] event=${event.type}`, event.properties);

    const props = event.properties as Record<string, unknown>;
    switch (event.type) {
      case 'message.updated':
        handleMessageUpdated(props);
        break;
      case 'message.part.updated':
        handlePartUpdated(props);
        break;
      case 'message.part.removed':
        handlePartRemoved(props);
        break;
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
        // OpenCode emits session.error for transient issues (rate limits,
        // model unavailability, etc.) during normal operation. These are
        // not connection errors -- the SSE status already handles real
        // connectivity problems. Log for debugging but don't show a banner.
        console.debug('[SSE-Handler] session.error (suppressed):', props.error);
        break;
      }
      default:
        break;
    }
  }, [handleMessageUpdated, handlePartUpdated, handlePartRemoved]);

  // ─── SSE lifecycle ───────────────────────────────────────────────────

  useEffect(() => {
    if (!backendReady) return;
    debugLog('Connecting SSE stream');

    let wasConnected = false;

    const stream = new OpencodeEventStream({
      url: clientRef.current.getEventStreamUrl(),
      onEvent: handleEvent,
      onStatusChange: (status) => {
        debugLog(`SSE status change: ${status}`);
        if (status === 'error') {
          console.trace('[AgentContext] SSE onStatusChange -> error');
        }
        dispatch({ type: 'sse.status', status });

        // When SSE reconnects after a disconnection, refresh messages to
        // catch any events that were missed during the reconnection gap.
        if (status === 'connected' && wasConnected) {
          debugLog('SSE reconnected — refreshing messages');
          const current = stateRef.current;
          const id = current.activeSessionId;
          if (id) {
            clientRef.current
              .getMessages(id)
              .then((envelopes) => {
                dispatch({ type: 'messages.loaded', sessionId: id, envelopes });
              })
              .catch((e) => {
                console.trace('[AgentContext] post-reconnect getMessages error:', e);
              });
          }
        }
        if (status === 'connected') {
          wasConnected = true;
        }
      },
      reconnectDelay: 3000,
      maxReconnectAttempts: 10,
    });
    streamRef.current = stream;
    stream.connect();
    return () => {
      debugLog('Disconnecting SSE stream');
      stream.disconnect();
      streamRef.current = null;
    };
  }, [handleEvent, backendReady]);

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
          console.trace('[AgentContext] getMessages error:', e);
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

  const createSession = useCallback(async (model?: { id: string; providerID: string }) => {
    try {
      const { id } = await clientRef.current.createSession(model);
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

  const sendMessage = useCallback(async (text: string, _model?: { modelID?: string; providerID?: string }) => {
    const sessionId = stateRef.current.activeSessionId;
    if (!sessionId || !text.trim()) return;
    dispatch({ type: 'error', error: null });
    debugLog('sendMessage: cleared error, sending:', text.substring(0, 50));

    // Create optimistic user message immediately so UI shows it right away
    const ts = Date.now();
    const userMessage: UiMessage = {
      id: `user-${ts}-${ts.toString(36)}`,
      role: 'user',
      parts: [{ type: 'text', id: `ptxt-${ts}`, text: text.trim(), messageID: `user-${ts}-${ts.toString(36)}`, sessionID: sessionId }],
      streaming: false,
      time: { created: ts },
    };
    dispatch({ type: 'message.upsert', sessionId, message: userMessage });

    try {
      // OpenCode 1.18.8 ignores modelID/providerID in message body;
      // the model must be set on the session at creation time.
      const response = await clientRef.current.chat(sessionId, {
        parts: [{ type: 'text', text: text.trim() }],
      });

      // Use the HTTP response as a fallback: only upsert the assistant message
      // if SSE hasn't already delivered it. This prevents race conditions where
      // the HTTP response (which may have empty parts initially) overwrites
      // parts that SSE already streamed.
      const existing = (stateRef.current.messages[sessionId] ?? []).find(
        (m) => m.id === response.info.id,
      );
      if (!existing) {
        const assistantMessage: UiMessage = {
          id: response.info.id,
          role: response.info.role,
          parts: response.parts,
          streaming: response.info.time.completed == null && response.info.role === 'assistant',
          time: response.info.time,
        };
        dispatch({ type: 'message.upsert', sessionId, message: assistantMessage });
      }
    } catch (e) {
      console.trace('[AgentContext] sendMessage error:', e);
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
      backendReady,
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
      backendReady,
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
