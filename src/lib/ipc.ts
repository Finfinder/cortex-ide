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

// ─── Event type definitions ─────────────────────────────────────────────────


