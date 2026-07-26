import { test, expect } from "@playwright/test";
import { mockOpencodeServer, makeSession, makeMessage } from "./fixtures/opencode";
import { ChatPage } from "./pages/ChatPage";

test.describe("Chat panel", () => {
  test("should render loaded messages (user + assistant markdown)", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: {
        s1: [
          makeMessage("m1", "s1", "user", "Hello agent", 1, 2),
          makeMessage("m2", "s1", "assistant", "# Title\n\nSome **bold** text with `code`.", 3, 4),
        ],
      },
    });
    const chat = new ChatPage(page);

    await page.goto("/");

    await expect(chat.userMessages).toHaveCount(1);
    await expect(chat.assistantMessages).toHaveCount(1);
    // Markdown rendering: heading + inline code
    await expect(chat.assistantMessages.getByRole("heading", { name: "Title" })).toBeVisible();
    await expect(chat.assistantMessages.getByText("bold")).toBeVisible();
  });

  test("should show empty state when session has no messages", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [] },
    });

    await page.goto("/");

    await expect(page.getByText("No messages yet. Start the conversation below.")).toBeVisible();
  });

  test("should send a message with Ctrl+Enter", async ({ page }) => {
    const mock = await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [] },
    });
    const chat = new ChatPage(page);

    await page.goto("/");
    await chat.send("Build a button component");

    expect(mock.messages["s1"].length).toBe(1);
    expect(mock.messages["s1"][0].parts[0]).toMatchObject({
      type: "text",
      text: "Build a button component",
    });
    // Input cleared after submit
    await expect(chat.input).toHaveValue("");
  });

  test("should recall last sent message with ArrowUp", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [] },
    });
    const chat = new ChatPage(page);

    await page.goto("/");
    await chat.send("first prompt");
    await chat.input.press("ArrowUp");

    await expect(chat.input).toHaveValue("first prompt");
  });

  test("should not send empty messages", async ({ page }) => {
    const mock = await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [] },
    });
    const chat = new ChatPage(page);

    await page.goto("/");
    await chat.input.fill("   ");
    await expect(chat.sendButton).toBeDisabled();
    expect(mock.messages["s1"].length).toBe(0);
  });
});
