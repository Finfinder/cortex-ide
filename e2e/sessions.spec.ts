import { test, expect } from "@playwright/test";
import { mockOpencodeServer, makeSession } from "./fixtures/opencode";
import { SessionsPage } from "./pages/SessionsPage";

test.describe("Session list", () => {
  test("should list sessions loaded from OpenCode", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "First session", 1), makeSession("s2", "Second session", 2)],
    });
    const sessions = new SessionsPage(page);

    await page.goto("/");

    await expect(sessions.sessionOption("First session")).toBeVisible();
    await expect(sessions.sessionOption("Second session")).toBeVisible();
  });

  test("should filter sessions by search query", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "First session", 1), makeSession("s2", "Second session", 2)],
    });
    const sessions = new SessionsPage(page);

    await page.goto("/");
    await sessions.search("first");

    await expect(sessions.sessionOption("First session")).toBeVisible();
    await expect(sessions.sessionOption("Second session")).toBeHidden();
  });

  test("should create a new session via the + button", async ({ page }) => {
    const mock = await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "First session", 1)],
    });
    const sessions = new SessionsPage(page);

    await page.goto("/");
    await expect(sessions.sessionOption("First session")).toBeVisible();

    await sessions.createSession();

    await expect(sessions.sessionOption("Untitled session")).toBeVisible();
    expect(mock.sessions.length).toBe(2);
  });

  test("should switch active session when clicked", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "First session", 1), makeSession("s2", "Second session", 2)],
      messages: {
        s1: [],
        s2: [],
      },
    });
    const sessions = new SessionsPage(page);

    await page.goto("/");
    await expect(sessions.sessionOption("First session")).toHaveAttribute("aria-selected", "true");

    await sessions.selectSession("Second session");

    await expect(sessions.sessionOption("Second session")).toHaveAttribute("aria-selected", "true");
    await expect(sessions.sessionOption("First session")).toHaveAttribute("aria-selected", "false");
  });

  test("should delete a session via the delete button", async ({ page }) => {
    const mock = await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "First session", 1), makeSession("s2", "Second session", 2)],
    });
    const sessions = new SessionsPage(page);

    await page.goto("/");
    await expect(sessions.sessionOption("Second session")).toBeVisible();

    await sessions.deleteSession("Second session");

    await expect(sessions.sessionOption("Second session")).toBeHidden();
    expect(mock.sessions.map((s) => s.id)).toEqual(["s1"]);
  });
});
