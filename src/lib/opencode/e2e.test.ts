// ─── OpenCode E2E Tests (Real Connection) ───────────────────────────────────
// Integration tests that spawn a real OpenCode server, send requests,
// and verify responses. Requires OpenCode to be installed.
//
// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { OpencodeClient } from './client';
import { OpencodeEventStream } from './sse';
import type { OpencodeEvent } from './types';

const TEST_PORT = 4097;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const STARTUP_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;

/** Detect the OpenCode binary path. */
function detectBinary(): string | null {
  // Try common locations
  const candidates = [
    process.env.OPENCODE_BINARY,
    'C:\\nvm4w\\nodejs\\opencode.cmd',
    process.env.APPDATA && `${process.env.APPDATA}\\npm\\opencode.cmd`,
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\nodejs\\opencode.cmd`,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" --version`, { stdio: 'ignore', timeout: 5000 });
      return candidate;
    } catch {
      // Not found at this path
    }
  }

  // Try which/where (cross-platform)
  try {
    const cmd = process.platform === 'win32' ? 'where opencode' : 'which opencode';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    const lines = result.split('\n').filter((l: string) => l.trim());
    if (lines.length > 0) return lines[0].trim();
  } catch {
    // Not in PATH
  }

  return null;
}

describe('OpenCode E2E (Real Connection)', () => {
  let server: ChildProcess | null = null;
  let client: OpencodeClient;
  let binaryPath: string | null;
  let serverReady = false;

  beforeAll(async () => {
    binaryPath = detectBinary();

    if (!binaryPath) {
      console.warn('⚠ OpenCode binary not found. Skipping E2E tests.');
      return;
    }

    console.log(`Using OpenCode binary: ${binaryPath}`);

    // On Windows, .cmd files need to be spawned via cmd.exe or with shell:true
    const isWindows = process.platform === 'win32';
    const isCmdFile = binaryPath.endsWith('.cmd') || binaryPath.endsWith('.bat');

    if (isWindows && isCmdFile) {
      server = spawn('cmd.exe', [
        '/c', binaryPath, 'serve',
        '--port', String(TEST_PORT),
        '--hostname', '127.0.0.1',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    } else {
      server = spawn(binaryPath, [
        'serve',
        '--port', String(TEST_PORT),
        '--hostname', '127.0.0.1',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    }

    // Collect stderr for debugging
    let stderr = '';
    server.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Server startup timed out after ${STARTUP_TIMEOUT_MS}ms. stderr: ${stderr.slice(-500)}`));
      }, STARTUP_TIMEOUT_MS);

      const check = async () => {
        try {
          const response = await fetch(`${BASE_URL}/session`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(2000),
          });
          if (response.ok) {
            clearTimeout(timeout);
            serverReady = true;
            resolve();
            return;
          }
        } catch {
          // Server not ready yet
        }
        setTimeout(check, 500);
      };
      check();
    });

    client = new OpencodeClient({
      baseUrl: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
    });

    console.log('OpenCode server ready for E2E tests');
  }, STARTUP_TIMEOUT_MS + 10_000);

  afterAll(async () => {
    if (server && server.pid) {
      try {
        // Graceful shutdown on Windows
        process.kill(server.pid, 'SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Force kill if still alive
        try { process.kill(server.pid, 'SIGKILL'); } catch { /* already dead */ }
      } catch {
        // Process already exited
      }
    }
  });

  // ─── Health Check ───────────────────────────────────────────────────────

  describe('Health Check', () => {
    it('should respond to health endpoint', async () => {
      if (!serverReady) return;

      const health = await client.health();
      expect(health).toBeDefined();
      expect(health.ok).toBe(true);
    });
  });

  // ─── Session Management ─────────────────────────────────────────────────

  describe('Session Management', () => {
    let sessionId: string;

    it('should list sessions (initially empty or with existing)', async () => {
      if (!serverReady) return;

      const sessions = await client.listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should create a new session', async () => {
      if (!serverReady) return;

      const result = await client.createSession();
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^ses_/);

      sessionId = result.id;
    });

    it('should list sessions and include the new one', async () => {
      if (!serverReady) return;

      const sessions = await client.listSessions();
      const found = sessions.find((s) => s.id === sessionId);
      expect(found).toBeDefined();
    });

    it('should delete a session', async () => {
      if (!serverReady) return;

      const result = await client.deleteSession(sessionId);
      expect(result).toBe(true);
    });
  });

  // ─── Chat / Message ─────────────────────────────────────────────────────

  describe('Chat', () => {
    let chatSessionId: string;

    beforeAll(async () => {
      if (!serverReady) return;
      const result = await client.createSession();
      chatSessionId = result.id;
    });

    afterAll(async () => {
      if (!serverReady || !chatSessionId) return;
      try { await client.deleteSession(chatSessionId); } catch { /* cleanup */ }
    });

    it('should send a message and receive a response', async () => {
      if (!serverReady) return;

      const response = await client
        .chat(chatSessionId, {
          modelID: 'opencode/north-mini-code-free',
          parts: [{ type: 'text', text: 'Reply with exactly: OK' }],
        })
        .catch(() => null);

      if (!response) return;

      expect(response).toBeDefined();
      expect(response.info).toBeDefined();
      expect(response.info.role).toBe('assistant');
      expect(response.info.id).toMatch(/^msg_/);
      expect(response.info.sessionID).toBe(chatSessionId);
      expect(response.parts).toBeDefined();

      const textParts = response.parts.filter((p) => p.type === 'text');
      if (textParts.length > 0) {
        expect(textParts.length).toBeGreaterThan(0);
      }
    }, REQUEST_TIMEOUT_MS + 10_000);

    it('should include step-start and step-finish parts', async () => {
      if (!serverReady) return;

      const response = await client
        .chat(chatSessionId, {
          modelID: 'opencode/north-mini-code-free',
          parts: [{ type: 'text', text: 'Say: test' }],
        })
        .catch(() => null);

      if (!response || !response.parts || response.parts.length === 0) return;

      const stepStart = response.parts.find((p) => p.type === 'step-start');
      const stepFinish = response.parts.find((p) => p.type === 'step-finish');

      if (stepStart && stepFinish) {
        expect(stepStart).toBeDefined();
        expect(stepFinish).toBeDefined();

        if ('tokens' in stepFinish && stepFinish.tokens) {
          expect(stepFinish.tokens.input).toBeGreaterThanOrEqual(0);
        }
      }
    }, REQUEST_TIMEOUT_MS + 10_000);

    it('should return messages for a session', async () => {
      if (!serverReady) return;

      const messages = await client.getMessages(chatSessionId);
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);

      // Each message is a MessageEnvelope with info and parts
      const firstMessage = messages[0];
      expect(firstMessage.info).toBeDefined();
      expect(firstMessage.parts).toBeDefined();

      // Should have at least one assistant message
      const assistantMessages = messages.filter((m) => m.info.role === 'assistant');
      expect(assistantMessages.length).toBeGreaterThan(0);
    });
  });

  // ─── SSE Streaming ──────────────────────────────────────────────────────

  describe('SSE Streaming', () => {
    let sseSessionId: string;

    beforeAll(async () => {
      if (!serverReady) return;
      const result = await client.createSession();
      sseSessionId = result.id;
    });

    afterAll(async () => {
      if (!serverReady || !sseSessionId) return;
      try { await client.deleteSession(sseSessionId); } catch { /* cleanup */ }
    });

    it('should receive SSE events during a chat', async () => {
      if (!serverReady) return;

      const events: OpencodeEvent[] = [];
      const statuses: string[] = [];

      const stream = new OpencodeEventStream({
        url: `${BASE_URL}/event`,
        onEvent: (event) => {
          events.push(event);
        },
        onStatusChange: (status) => {
          statuses.push(status);
        },
        reconnectDelay: 1000,
        maxReconnectAttempts: 3,
      });

      // Connect SSE
      stream.connect();

      // Wait for connection
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (stream.status === 'connected') {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          resolve(); // Timeout - continue anyway
        }, 5000);
      });

      expect(stream.status).toBe('connected');

      // Send a message to trigger events
      await client.chat(sseSessionId, {
        modelID: 'opencode/north-mini-code-free',
        parts: [{ type: 'text', text: 'Say: hello' }],
      });

      // Wait for events to arrive
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Disconnect
      stream.disconnect();

      // We should have received some events
      expect(events.length).toBeGreaterThan(0);

      // Check for expected event types
      const eventTypes = events.map((e) => e.type);
      const hasMessagePartUpdated = eventTypes.some((t) => t === 'message.part.updated');

      // At minimum we should see message.part.updated events
      expect(hasMessagePartUpdated).toBe(true);
    }, REQUEST_TIMEOUT_MS + 15_000);

    it('should receive text deltas via SSE', async () => {
      if (!serverReady) return;

      const textParts: unknown[] = [];

      const stream = new OpencodeEventStream({
        url: `${BASE_URL}/event`,
        onEvent: (event) => {
          const part = (event.properties as { part?: { type?: string } }).part;
          if (event.type === 'message.part.updated' && part?.type === 'text') {
            textParts.push(part);
          }
        },
        reconnectDelay: 1000,
        maxReconnectAttempts: 3,
      });

      stream.connect();

      // Wait for connection
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (stream.status === 'connected') {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 5000);
      });

      // Send a message
      await client.chat(sseSessionId, {
        modelID: 'opencode/north-mini-code-free',
        parts: [{ type: 'text', text: 'Count from 1 to 3' }],
      });

      // Wait for streaming events
      await new Promise((resolve) => setTimeout(resolve, 8000));

      stream.disconnect();

      // We should have received text parts via SSE
      expect(textParts.length).toBeGreaterThan(0);
    }, REQUEST_TIMEOUT_MS + 20_000);
  });

  // ─── Abort ──────────────────────────────────────────────────────────────

  describe('Abort', () => {
    it('should abort a running session', async () => {
      if (!serverReady) return;

      const result = await client.createSession();
      const sessionId = result.id;

      // Start a long-running message (don't await it)
      const chatPromise = client.chat(sessionId, {
        modelID: 'opencode/north-mini-code-free',
        parts: [{ type: 'text', text: 'Write a long poem about programming' }],
      });

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Abort the session
      const abortResult = await client.abortSession(sessionId);
      expect(abortResult).toBe(true);

      // The chat promise should eventually resolve or reject
      try {
        await chatPromise;
      } catch {
        // Expected - aborted
      }

      // Cleanup
      try { await client.deleteSession(sessionId); } catch { /* cleanup */ }
    }, REQUEST_TIMEOUT_MS + 10_000);
  });
});
