import type { UnlistenFn } from "@tauri-apps/api/event";

/**
 * Type-safe wrapper around Tauri's invoke.
 * All Tauri commands must be registered in the backend (src-tauri/src/lib.rs).
 * The Tauri API is imported dynamically so the module also loads outside Tauri
 * (plain browser dev server, E2E tests) — calls reject when no IPC bridge exists.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

/**
 * Type-safe wrapper around Tauri's event listener.
 */
export async function listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  const { listen: tauriListen } = await import("@tauri-apps/api/event");
  return tauriListen<T>(event, (e) => {
    handler(e.payload);
  });
}

// ─── Command type definitions ───────────────────────────────────────────────

/** greet command: returns a greeting string */
export type GreetArgs = { name: string };
export type GreetResult = string;

/** get_app_version command: returns the app version string */
export type GetAppVersionResult = string;

/** git_diff command: runs git diff in the given directory */
export type GitDiffArgs = { cwd: string; args?: string[] };
export type GitDiffResult = string;

// ─── Event type definitions ─────────────────────────────────────────────────

/** backend://ready event: emitted when the Tauri backend finishes setup */
export type BackendReadyPayload = void;

// ─── OpenCode command type definitions ──────────────────────────────────────

/** detect_opencode command: detects the opencode binary path */
export type DetectOpencodeArgs = { customPath?: string };
export type DetectOpencodeResult = string;

/** spawn_opencode command: spawns an opencode SDK server */
export type SpawnOpencodeArgs = {
  cwd: string;
  port?: number;
  customBinaryPath?: string;
};
export type SpawnOpencodeResult = {
  pid: number | null;
  port: number;
  binary_path: string;
  config: {
    cwd: string;
    port: number;
    hostname: string;
    cors: string[];
    custom_binary_path: string | null;
    mdns: boolean;
  };
};

/** stop_opencode command: stops the running opencode process */
export type StopOpencodeResult = void;

/** get_opencode_status command: returns process status */
export type GetOpencodeStatusResult = {
  pid: number | null;
  is_alive: boolean;
  restart_count: number;
};

/** check_opencode_health command: checks server health */
export type CheckOpencodeHealthArgs = { baseUrl: string };
export type CheckOpencodeHealthResult = {
  status: 'healthy' | 'unhealthy' | 'down' | 'unknown';
  consecutive_failures: number;
  needs_reconnect: boolean;
};
