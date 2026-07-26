import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke, listen } from "./ipc";

// Mock @tauri-apps/api
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("ipc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invoke should call tauriInvoke with correct arguments", async () => {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    (tauriInvoke as ReturnType<typeof vi.fn>).mockResolvedValue("result");

    const result = await invoke("greet", { name: "test" });
    expect(result).toBe("result");
    expect(tauriInvoke).toHaveBeenCalledWith("greet", { name: "test" });
  });

  it("listen should call tauriListen with correct arguments", async () => {
    const { listen: tauriListen } = await import("@tauri-apps/api/event");
    (tauriListen as ReturnType<typeof vi.fn>).mockResolvedValue(() => {});

    const handler = vi.fn();
    await listen("backend://ready", handler);
    expect(tauriListen).toHaveBeenCalledWith("backend://ready", expect.any(Function));
  });
});
