import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Type-safe wrapper around Tauri's invoke.
 * All Tauri commands must be registered in the backend (src-tauri/src/lib.rs).
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

/**
 * Type-safe wrapper around Tauri's event listener.
 */
export async function listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return tauriListen<T>(event, (event) => {
    handler(event.payload);
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
