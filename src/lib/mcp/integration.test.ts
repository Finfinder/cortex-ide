import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpIntegration } from "./integration";

describe("McpIntegration", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockSpawn: ReturnType<typeof vi.fn>;
  let integration: McpIntegration;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    // Mock process that fires 'close' when kill is called
    const mockProcess = {
      pid: 1234,
      stdio: ["pipe", "pipe", "pipe"] as const,
      kill: vi.fn((_signal?: string) => {
        // Fire close event when killed
        const closeCb = onCloseCb;
        if (closeCb) closeCb();
      }),
      on: vi.fn((event: string, cb: () => void) => {
        if (event === "close") {
          (window as any).__onCloseCb = cb;
        }
      }),
    };

    // Store close callback globally so kill can fire it
    let onCloseCb: (() => void) | null = null;
    Object.defineProperty(mockProcess, "on", {
      value: (event: string, cb: () => void) => {
        if (event === "close") {
          onCloseCb = cb;
        }
      },
    });

    // Override kill to fire close
    const originalKill = mockProcess.kill;
    Object.defineProperty(mockProcess, "kill", {
      value: (_signal?: string) => {
        const closeCb = onCloseCb;
        if (closeCb) closeCb();
        return originalKill(_signal);
      },
    });

    mockSpawn = vi.fn(() => mockProcess);
    integration = new McpIntegration({
      opencodeUrl: "http://localhost:4096",
      workspaceDir: "/tmp/workspace",
      spawn: mockSpawn as any,
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    // Don't await destroy — it hangs on mock processes
  });

  it("should start a server and register with OpenCode", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const status = await integration.startServer("test-server", {
      command: "python",
      args: ["server.py"],
      env: {},
      enabled: true,
    });

    expect(status.running).toBe(true);
    expect(status.pid).toBe(1234);
    expect(mockSpawn).toHaveBeenCalledWith("python", ["server.py"], expect.objectContaining({ cwd: "/tmp/workspace" }));
  });

  it("should stop a running server", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await integration.startServer("test-server", {
      command: "python",
      args: [],
      env: {},
      enabled: true,
    });

    const status = await integration.stopServer("test-server");
    expect(status.running).toBe(false);
  });

  it("should return status for all servers", async () => {
    const statuses = integration.getStatus();
    expect(statuses).toEqual([]);
  });

  it("should call a tool on a running server", async () => {
    const { cacheAlwaysAllow } = await import('./permissions');
    cacheAlwaysAllow({
      serverName: 'test-server',
      toolName: 'read_file',
      target: 'read_file',
      id: '',
      scope: 'exec',
      description: '',
      timestamp: 0,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: "tool output" }),
    });

    await integration.startServer("test-server", {
      command: "python",
      args: [],
      env: {},
      enabled: true,
    });

    const result = await integration.callTool("test-server", "read_file", { path: "/tmp/test.txt" });
    expect(result).toEqual({ result: "tool output" });
  });

  it("should throw when calling a tool on a stopped server", async () => {
    await expect(integration.callTool("stopped-server", "read_file", {})).rejects.toThrow(
      "Server stopped-server is not running",
    );
  });

  it("should get tools from all running servers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tools: [{ name: "read_file", description: "", inputSchema: {} }] }),
    });

    await integration.startServer("test-server", {
      command: "python",
      args: [],
      env: {},
      enabled: true,
    });

    const tools = await integration.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("read_file");
  });

  it("should get resources from all running servers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resources: [{ uri: "file:///tmp", name: "tmp" }] }),
    });

    await integration.startServer("test-server", {
      command: "python",
      args: [],
      env: {},
      enabled: true,
    });

    const resources = await integration.getResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe("file:///tmp");
  });

  it("should get prompts from all running servers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ prompts: [{ name: "summarize" }] }),
    });

    await integration.startServer("test-server", {
      command: "python",
      args: [],
      env: {},
      enabled: true,
    });

    const prompts = await integration.getPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe("summarize");
  });

  it("should start all enabled servers", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const servers = {
      "server-1": { command: "python", args: [], env: {}, enabled: true },
      "server-2": { command: "node", args: [], env: {}, enabled: false },
    };

    const statuses = await integration.startAll(servers);
    expect(statuses).toHaveLength(2);
    expect(statuses[0].running).toBe(true);
    expect(statuses[1].running).toBe(false);
  });

  it("should handle spawn failure gracefully", async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error("spawn nonexistent ENOENT");
    });
    const status = await integration.startServer("bad-server", {
      command: "nonexistent",
      args: [],
      env: {},
      enabled: true,
    });

    expect(status.running).toBe(false);
    expect(status.error).toContain("Failed to start");
  });
});
