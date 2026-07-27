import { test, expect } from "@playwright/test";
import { mockOpencodeServer, makeSession } from "./fixtures/opencode";

test.describe("App shell", () => {
  test("should open and close the command palette with Ctrl+K / Esc", async ({ page }) => {
    await mockOpencodeServer(page, { sessions: [makeSession("s1", "Demo session", 1)] });

    await page.goto("/");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeHidden();

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeHidden();
  });

  test("should create a new session with Ctrl+N", async ({ page }) => {
    const mock = await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
    });

    await page.goto("/");
    await expect(page.getByRole("option", { name: /Demo session/ })).toBeVisible();

    await page.keyboard.press("Control+n");

    await expect(page.getByRole("option", { name: /Untitled session/ })).toBeVisible();
    expect(mock.sessions).toHaveLength(2);
  });

  test("should show connection status and token counters in the status bar", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [] },
    });

    await page.goto("/");

    const status = page.getByRole("status", { name: /OpenCode connection:/ });
    await expect(status).toBeVisible();
    await expect(page.locator('[title="Tokens used (input / output)"]')).toHaveText(/⬆ 0 ⬇ 0/);
  });

  test("should show error banner when session loading fails, with retry", async ({ page }) => {
    await page.route("**/event", (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" }),
    );
    await page.route("**/session", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }),
    );

    await page.goto("/");

    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/OpenCode API error: 500/);

    // Recover on retry
    await page.unroute("**/session");
    await mockOpencodeServer(page, { sessions: [makeSession("s1", "Recovered session", 1)] });
    await banner.getByRole("button", { name: "Retry" }).click();

    await expect(page.getByRole("option", { name: /Recovered session/ })).toBeVisible();
  });

  test("should switch agent via the agent selector", async ({ page }) => {
    await mockOpencodeServer(page, { sessions: [makeSession("s1", "Demo session", 1)] });

    await page.goto("/");

    await page.getByRole("button", { name: "Select agent" }).click();
    await page.getByRole("option", { name: /code-reviewer/ }).click();

    await expect(page.getByRole("button", { name: "Select agent" })).toContainText("code-reviewer");
  });
});
