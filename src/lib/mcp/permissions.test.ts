import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: actual,
    appendFile: vi.fn(),
    mkdir: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  return {
    ...actual,
    default: actual,
    join: vi.fn((...args: string[]) => args.join("/")),
  };
});

describe("Permissions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { existsSync, mkdir, appendFile } = await import("node:fs");
    (existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (mkdir as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {});
    (appendFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  });

  describe("checkPermissions", () => {
    it("should deny by default and return request", async () => {
      const { checkPermissions } = await import("./permissions");
      const result = await checkPermissions({
        scope: "filesystem",
        serverName: "test-server",
        toolName: "read_file",
        target: "/tmp/test.txt",
        description: "Read file",
      });

      expect(result.allowed).toBe(false);
      expect((result as any).request).toBeDefined();
      expect((result as any).request.scope).toBe("filesystem");
      expect((result as any).request.serverName).toBe("test-server");
    });

    it("should handle all permission scopes", async () => {
      const { checkPermissions } = await import("./permissions");
      const scopes: Array<"filesystem" | "network" | "exec"> = ["filesystem", "network", "exec"];

      for (const scope of scopes) {
        const result = await checkPermissions({
          scope,
          serverName: "test-server",
          toolName: "read_file",
          target: "/tmp/test.txt",
          description: "Test operation",
        });

        expect(result.allowed).toBe(false);
      }
    });
  });

  describe("applyDecision", () => {
    it("should allow a request", async () => {
      const { applyDecision } = await import("./permissions");
      const request = {
        id: "perm-1",
        scope: "filesystem" as const,
        serverName: "test-server",
        toolName: "read_file",
        target: "/tmp/test.txt",
        description: "Read file",
        timestamp: Date.now(),
      };

      const decision = await applyDecision(request, "allow");
      expect(decision.allowed).toBe(true);
      expect(decision.alwaysAllow).toBe(false);
    });

    it("should deny a request", async () => {
      const { applyDecision } = await import("./permissions");
      const request = {
        id: "perm-1",
        scope: "filesystem" as const,
        serverName: "test-server",
        toolName: "read_file",
        target: "/tmp/test.txt",
        description: "Read file",
        timestamp: Date.now(),
      };

      const decision = await applyDecision(request, "deny");
      expect(decision.allowed).toBe(false);
    });

    it("should cache always-allow decisions", async () => {
      const { applyDecision, isAlwaysAllowed } = await import("./permissions");
      const request = {
        id: "perm-1",
        scope: "filesystem" as const,
        serverName: "test-server",
        toolName: "read_file",
        target: "/tmp/test.txt",
        description: "Read file",
        timestamp: Date.now(),
      };

      await applyDecision(request, "always_allow");

      const isAllowed = isAlwaysAllowed({
        id: "",
        scope: "filesystem",
        serverName: "test-server",
        toolName: "read_file",
        target: "/tmp/test.txt",
        description: "",
        timestamp: Date.now(),
      });

      expect(isAllowed).toBe(true);
    });
  });

  describe("audit log", () => {
    it("should read audit log entries", async () => {
      const { readAuditLog } = await import("./permissions");
      const entries = await readAuditLog();
      expect(Array.isArray(entries)).toBe(true);
    });

    it("should clear audit log", async () => {
      const { clearAuditLog } = await import("./permissions");
      await expect(clearAuditLog()).resolves.not.toThrow();
    });

    it("should filter audit log by server name", async () => {
      const { getAuditLogByServer } = await import("./permissions");
      const entries = await getAuditLogByServer("test-server");
      expect(Array.isArray(entries)).toBe(true);
    });

    it("should filter audit log by date range", async () => {
      const { getAuditLogByDate } = await import("./permissions");
      const entries = await getAuditLogByDate(Date.now() - 86400000, Date.now());
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe("isAlwaysAllowed", () => {
    it("should return false for unknown requests", async () => {
      const { isAlwaysAllowed } = await import("./permissions");
      const result = isAlwaysAllowed({
        id: "unknown",
        scope: "filesystem",
        serverName: "unknown-server",
        toolName: "unknown_tool",
        target: "/unknown",
        description: "",
        timestamp: Date.now(),
      });
      expect(result).toBe(false);
    });
  });
});
