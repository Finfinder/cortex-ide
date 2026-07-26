import { test, expect } from "@playwright/test";
import { mockOpencodeServer, makeSession } from "./fixtures/opencode";
import { PatchReviewPage } from "./pages/PatchReviewPage";

function patchPart(id: string, file: string, oldLine: string, newLine: string) {
  return {
    id,
    messageID: "m1",
    sessionID: "s1",
    type: "patch",
    file,
    patch: [
      `--- a/${file}`,
      `+++ b/${file}`,
      "@@ -1,1 +1,1 @@",
      `-${oldLine}`,
      `+${newLine}`,
    ].join("\n"),
  };
}

const messageWithPatches = {
  info: {
    id: "m1",
    sessionID: "s1",
    role: "assistant" as const,
    cost: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, completed: 2 },
  },
  parts: [
    patchPart("pt1", "src/a.ts", "const a = 1;", "const a = 2;"),
    patchPart("pt2", "src/b.ts", "const b = 1;", "const b = 2;"),
  ],
};

test.describe("Patch review", () => {
  test("should queue patches from message parts with pending status", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [messageWithPatches] },
    });
    const patches = new PatchReviewPage(page);

    await page.goto("/");

    await expect(patches.queue.getByText("Patches (2 pending)")).toBeVisible();
    await expect(patches.patchSection("src/a.ts")).toBeVisible();
    await expect(patches.patchSection("src/b.ts")).toBeVisible();
  });

  test("should approve a patch and disable its actions", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [messageWithPatches] },
    });
    const patches = new PatchReviewPage(page);

    await page.goto("/");
    await patches.approve("src/a.ts");

    const section = patches.patchSection("src/a.ts");
    await expect(section.getByText("Approved")).toBeVisible();
    await expect(section.getByRole("button", { name: "✓ Approve" })).toBeDisabled();
    await expect(patches.queue.getByText("Patches (1 pending)")).toBeVisible();
  });

  test("should reject all patches in batch", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [messageWithPatches] },
    });
    const patches = new PatchReviewPage(page);

    await page.goto("/");
    await patches.rejectAllButton.click();

    await expect(patches.queue.getByText("Patches (0 pending)")).toBeVisible();
    await expect(patches.patchSection("src/a.ts").getByText("Rejected")).toBeVisible();
    await expect(patches.patchSection("src/b.ts").getByText("Rejected")).toBeVisible();
  });

  test("should toggle between diff viewer and git diff view", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [messageWithPatches] },
    });
    const patches = new PatchReviewPage(page);

    await page.goto("/");

    const section = patches.patchSection("src/a.ts");
    // Diff viewer (react-diff-viewer-continued renders a table)
    await expect(section.getByRole("table")).toBeVisible();

    await patches.toggleGitDiff("src/a.ts");

    // git diff unavailable outside Tauri → graceful fallback to raw patch text
    await expect(section.getByRole("table")).toBeHidden();
    await expect(section.getByText(/git diff unavailable/)).toBeVisible();
    await expect(section.getByText("+const a = 2;", { exact: true })).toBeVisible();
  });
});
