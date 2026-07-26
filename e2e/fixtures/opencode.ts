// ─── OpenCode API mocks ─────────────────────────────────────────────────────
// The OpenCode server is an external backend dependency — mocked per the
// mock-external-only rule so tests verify the full UI flow deterministically.

import type { Page, Route } from "@playwright/test";

export interface MockSession {
  id: string;
  title?: string;
  cost: number;
  tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
  time: { created: number; updated: number };
}

export function makeSession(id: string, title: string, created: number): MockSession {
  return {
    id,
    title,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created, updated: created },
  };
}

export interface MockMessageEnvelope {
  info: {
    id: string;
    sessionID: string;
    role: "user" | "assistant" | "system";
    cost: number;
    tokens: { total: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } };
    time: { created: number; completed?: number };
  };
  parts: unknown[];
}

export function makeMessage(
  id: string,
  sessionID: string,
  role: "user" | "assistant",
  text: string,
  created: number,
  completed?: number,
): MockMessageEnvelope {
  return {
    info: {
      id,
      sessionID,
      role,
      cost: 0,
      tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created, completed },
    },
    parts: [
      { id: `${id}-p1`, messageID: id, sessionID, type: "text", text },
    ],
  };
}

export interface MockServerOptions {
  sessions?: MockSession[];
  /** Messages per session id. */
  messages?: Record<string, MockMessageEnvelope[]>;
  /** When true, /event never responds (SSE hangs) — simulates connected state without events. */
  sseSilent?: boolean;
}

/**
 * Routes all OpenCode REST + SSE endpoints to deterministic mocks.
 * Must be registered before page.goto().
 */
export async function mockOpencodeServer(page: Page, options: MockServerOptions = {}) {
  const sessions = [...(options.sessions ?? [])];
  const messages: Record<string, MockMessageEnvelope[]> = { ...(options.messages ?? {}) };

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/event", (route) => {
    // SSE comment-only response. The OpenCode client marks the stream as
    // "connected" as soon as headers arrive; afterwards it reports
    // "disconnected" (normal stream end, no error). We assert on either.
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: ": connected\n\n",
    });
  });

  await page.route("**/health", (route) => json(route, { ok: true }));

  await page.route("**/session", (route) => {
    if (route.request().method() === "GET") return json(route, sessions);
    if (route.request().method() === "POST") {
      const id = `s-${Date.now()}-${sessions.length}`;
      const session = makeSession(id, "Untitled session", Date.now());
      sessions.unshift(session);
      return json(route, { id });
    }
    return route.fallback();
  });

  await page.route(/\/session\/[^/]+$/, (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").pop()!;
    if (route.request().method() === "GET") {
      const session = sessions.find((s) => s.id === id);
      return session ? json(route, session) : json(route, {}, 404);
    }
    if (route.request().method() === "DELETE") {
      const idx = sessions.findIndex((s) => s.id === id);
      if (idx >= 0) sessions.splice(idx, 1);
      return json(route, true);
    }
    if (route.request().method() === "PATCH") {
      // Rename — reserved for future UI support (client has renameSession).
      const session = sessions.find((s) => s.id === id);
      return session ? json(route, session) : json(route, {}, 404);
    }
    return route.fallback();
  });

  await page.route(/\/session\/[^/]+\/message$/, (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/")[2];
    if (route.request().method() === "GET") {
      return json(route, messages[id] ?? []);
    }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { parts?: { type: string; text?: string }[] };
      const text = body?.parts?.find((p) => p.type === "text")?.text ?? "";
      const userMsg = makeMessage(`m-${Date.now()}`, id, "user", text, Date.now(), Date.now());
      messages[id] = [...(messages[id] ?? []), userMsg];
      return json(route, userMsg);
    }
    return route.fallback();
  });

  await page.route(/\/session\/[^/]+\/abort$/, (route) => json(route, true));

  return { sessions, messages };
}
