// ─── MCP Integration with OpenCode ───────────────────────────────────────────
// Spawns MCP server processes, manages lifecycle (start/stop/restart),
// POSTs config to OpenCode, supports per-agent MCP enable/disable.

import { spawn } from 'node:child_process';
import type { McpServer } from '../settings';
import { validateUrl } from '../utils/urlValidator';
import { checkPermissions } from './permissions';

export interface McpServerStatus {
  name: string;
  running: boolean;
  pid?: number;
  error?: string;
  lastStarted?: number;
}

export interface McpIntegrationConfig {
  opencodeUrl: string;
  workspaceDir: string;
  spawn?: typeof spawn;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

// ─── Security Validation (SEC-1) ─────────────────────────────────────────────

const ALLOWED_COMMAND_PREFIXES = [
  'npx',
  'node',
  'python',
  'python3',
  'uvx',
  'deno',
  'bun',
  'docker',
];

const DANGEROUS_ARG_PATTERNS = [
  /`/,
  /\$\(/,
  /;\s*/,
  /\|\s*/,
  /&&\s*/,
  /\|\|\s*/,
  />\s*/,
  /<\s*/,
];

/**
 * Validate MCP command and arguments to prevent Command Injection (SEC-1).
 */
export function validateMcpCommand(command: string, args: string[] = []): void {
  const trimmedCmd = command.trim();
  if (!trimmedCmd) {
    throw new Error('MCP server command cannot be empty');
  }

  // Extract base binary name
  const binaryName = trimmedCmd.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  const isAllowedBinary = ALLOWED_COMMAND_PREFIXES.some(
    (prefix) => binaryName === prefix || binaryName === `${prefix}.exe` || binaryName === `${prefix}.cmd`,
  );

  if (!isAllowedBinary) {
    throw new Error(
      `Forbidden command "${command}". Allowed executables: ${ALLOWED_COMMAND_PREFIXES.join(', ')}`,
    );
  }

  // Validate arguments against dangerous patterns
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Check inline code execution flags (e.g. bash -c, python -c, node -e)
    if ((arg === '-c' || arg === '-e' || arg === '--eval') && i < args.length - 1) {
      throw new Error(`Forbidden execution flag "${arg}" detected in arguments`);
    }

    for (const pattern of DANGEROUS_ARG_PATTERNS) {
      if (pattern.test(arg)) {
        throw new Error(`Dangerous characters detected in argument "${arg}"`);
      }
    }
  }
}

// Global registry of running processes for shutdown cleanup (RES-1)
const activeProcesses = new Set<ReturnType<typeof spawn>>();

function cleanupAllProcessesOnExit() {
  for (const proc of activeProcesses) {
    try {
      if (proc && !proc.killed) {
        proc.kill('SIGKILL');
      }
    } catch {
      // Ignore cleanup errors on exit
    }
  }
  activeProcesses.clear();
}

// Register process exit signals
if (typeof process !== 'undefined' && process.on) {
  process.once('exit', cleanupAllProcessesOnExit);
  process.once('SIGINT', cleanupAllProcessesOnExit);
  process.once('SIGTERM', cleanupAllProcessesOnExit);
}

export class McpIntegration {
  private readonly servers: Map<string, { process: ReturnType<typeof spawn> | null; config: McpServer }> = new Map();
  private readonly config: McpIntegrationConfig;
  private readonly spawn: typeof spawn;

  constructor(config: McpIntegrationConfig) {
    this.config = config;
    this.spawn = config.spawn ?? spawn;
  }

  /** Start a single MCP server by name. */
  async startServer(name: string, serverConfig: McpServer): Promise<McpServerStatus> {
    // SEC-1: Validate command and args before execution
    try {
      validateMcpCommand(serverConfig.command, serverConfig.args);
    } catch (validationErr) {
      const msg = validationErr instanceof Error ? validationErr.message : 'Validation failed';
      return {
        name,
        running: false,
        error: `Failed to start: Security Validation Failed: ${msg}`,
      };
    }

    // If already running, restart
    const existing = this.servers.get(name);
    if (existing?.process) {
      await this.stopServer(name);
    }

    try {
      const proc = this.spawn(serverConfig.command, serverConfig.args, {
        cwd: this.config.workspaceDir,
        env: {
          ...process.env,
          ...serverConfig.env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      activeProcesses.add(proc);

      proc.on('exit', () => {
        activeProcesses.delete(proc);
      });

      this.servers.set(name, { process: proc, config: serverConfig });

      // POST config to OpenCode
      await this.registerWithOpenCode(name, serverConfig);

      return {
        name,
        running: true,
        pid: proc.pid,
        lastStarted: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        name,
        running: false,
        error: `Failed to start: ${errorMessage}`,
      };
    }
  }

  /** Stop a single MCP server by name. */
  async stopServer(name: string): Promise<McpServerStatus> {
    const server = this.servers.get(name);
    if (!server) {
      return { name, running: false };
    }

    return new Promise<McpServerStatus>((resolve) => {
      if (server.process) {
        const proc = server.process;
        proc.on('close', () => {
          activeProcesses.delete(proc);
          this.servers.set(name, { process: null, config: server.config });
          resolve({
            name,
            running: false,
            lastStarted: server.config.enabled ? Date.now() : undefined,
          });

          // Unregister from OpenCode
          this.unregisterFromOpenCode(name).catch(() => {});
        });

        proc.kill('SIGTERM');
      } else {
        this.servers.set(name, { process: null, config: server.config });
        resolve({ name, running: false });
        this.unregisterFromOpenCode(name).catch(() => {});
      }
    });
  }

  /** Start all enabled MCP servers. */
  async startAll(servers: Record<string, McpServer>): Promise<McpServerStatus[]> {
    const results: McpServerStatus[] = [];

    for (const [name, config] of Object.entries(servers)) {
      if (config.enabled) {
        const status = await this.startServer(name, config);
        results.push(status);
      } else {
        results.push({ name, running: false });
      }
    }

    return results;
  }

  /** Stop all MCP servers. (RES-1: process.kill in cleanup handler) */
  async stopAll(): Promise<McpServerStatus[]> {
    const results: McpServerStatus[] = [];

    for (const [name, server] of this.servers) {
      if (server.process && !server.process.killed) {
        try {
          server.process.kill('SIGKILL');
        } catch {}
      }
      const status = await this.stopServer(name);
      results.push(status);
    }

    return results;
  }

  /** Get status of all servers. */
  getStatus(): McpServerStatus[] {
    const statuses: McpServerStatus[] = [];

    for (const [name, server] of this.servers) {
      statuses.push({
        name,
        running: server.process !== null,
        pid: server.process?.pid,
        error: server.process ? undefined : 'Not started',
        lastStarted: server.config.enabled ? Date.now() : undefined,
      });
    }

    return statuses;
  }

  /** Get tools from all running servers. */
  async getTools(serverName?: string): Promise<McpTool[]> {
    const tools: McpTool[] = [];

    for (const [name, server] of this.servers) {
      if (serverName && name !== serverName) continue;
      if (!server.process) continue;

      try {
        const url = validateUrl(`${this.config.opencodeUrl}/mcp/${encodeURIComponent(name)}/tools`);
        const toolsResponse = await fetch(url, {
          signal: AbortSignal.timeout(5000),
        });

        if (toolsResponse.ok) {
          const data = await toolsResponse.json();
          tools.push(...data.tools);
        }
      } catch {
        // Skip servers that don't respond
      }
    }

    return tools;
  }

  /** Get resources from all running servers. */
  async getResources(serverName?: string): Promise<McpResource[]> {
    const resources: McpResource[] = [];

    for (const [name, server] of this.servers) {
      if (serverName && name !== serverName) continue;
      if (!server.process) continue;

      try {
        const url = validateUrl(`${this.config.opencodeUrl}/mcp/${encodeURIComponent(name)}/resources`);
        const resourcesResponse = await fetch(url, {
          signal: AbortSignal.timeout(5000),
        });

        if (resourcesResponse.ok) {
          const data = await resourcesResponse.json();
          resources.push(...data.resources);
        }
      } catch {
        // Skip servers that don't respond
      }
    }

    return resources;
  }

  /** Get prompts from all running servers. */
  async getPrompts(serverName?: string): Promise<McpPrompt[]> {
    const prompts: McpPrompt[] = [];

    for (const [name, server] of this.servers) {
      if (serverName && name !== serverName) continue;
      if (!server.process) continue;

      try {
        const url = validateUrl(`${this.config.opencodeUrl}/mcp/${encodeURIComponent(name)}/prompts`);
        const promptsResponse = await fetch(url, {
          signal: AbortSignal.timeout(5000),
        });

        if (promptsResponse.ok) {
          const data = await promptsResponse.json();
          prompts.push(...data.prompts);
        }
      } catch {
        // Skip servers that don't respond
      }
    }

    return prompts;
  }

  /** Call a tool on a specific MCP server. */
  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const server = this.servers.get(serverName);
    if (!server?.process) {
      throw new Error(`Server ${serverName} is not running`);
    }

    // SEC-M3: Check MCP permissions before tool execution
    const permCheck = await checkPermissions({
      serverName,
      toolName,
      scope: 'exec',
      target: toolName,
      description: `Call MCP tool "${toolName}" on server "${serverName}"`,
    });

    if (!permCheck.allowed) {
      throw new Error(`Permission denied for MCP tool "${toolName}" on server "${serverName}"`);
    }

    const url = validateUrl(
      `${this.config.opencodeUrl}/mcp/${encodeURIComponent(serverName)}/tools/${encodeURIComponent(toolName)}`,
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`Tool ${toolName} error on ${serverName}: ${error}`);
    }

    return response.json();
  }

  /** Register server config with OpenCode. */
  private async registerWithOpenCode(name: string, serverConfig: McpServer): Promise<void> {
    const url = validateUrl(`${this.config.opencodeUrl}/mcp/servers`);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
      }),
      signal: AbortSignal.timeout(10000),
    });
  }

  /** Unregister server from OpenCode. */
  private async unregisterFromOpenCode(name: string): Promise<void> {
    try {
      const url = validateUrl(`${this.config.opencodeUrl}/mcp/servers/${encodeURIComponent(name)}`);
      await fetch(url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Ignore unregistration errors
    }
  }

  /** Cleanup all processes on destroy. */
  async destroy(): Promise<void> {
    await this.stopAll();
    this.servers.clear();
  }
}
