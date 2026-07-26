import { test, expect } from "@playwright/test";
import { mockOpencodeServer, makeSession } from "./fixtures/opencode";

const toolMessage = {
  info: {
    id: "m1",
    sessionID: "s1",
    role: "assistant" as const,
    cost: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, completed: 2 },
  },
  parts: [
    {
      id: "p1",
      callID: "c1",
      messageID: "m1",
      sessionID: "s1",
      type: "tool",
      tool: "read_file",
      state: {
        status: "completed",
        input: { filePath: "src/a.ts" },
        metadata: {},
        output: "file contents here",
        time: { start: 1, end: 2 },
        title: "Read a.ts",
      },
    },
  ],
};

test.describe("Tool calls", () => {
  test("should display tool call collapsed with name and status, expandable to args/result", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [toolMessage] },
    });

    await page.goto("/");

    const region = page.getByRole("region", { name: /Tool call: read_file/ });
    await expect(region).toBeVisible();
    await expect(region.getByText("Done")).toBeVisible();

    // Collapsed by default
    await expect(region.getByText("Arguments")).toBeHidden();

    await region.getByRole("button").click();

    await expect(region.getByText("Arguments")).toBeVisible();
    await expect(region.getByText(/file contents here/)).toBeVisible();
  });

  test("should show error output when tool call failed", async ({ page }) => {
    const errorMessage = structuredClone(toolMessage);
    (errorMessage.parts[0] as { state: unknown }).state = {
      status: "error",
      error: "permission denied",
      input: {},
      time: { start: 1, end: 2 },
    };

    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [errorMessage] },
    });

    await page.goto("/");

    const region = page.getByRole("region", { name: /Tool call: read_file, status Error/ });
    await expect(region).toBeVisible();
    await region.getByRole("button").click();
    await expect(region.getByText("permission denied")).toBeVisible();
  });
});
