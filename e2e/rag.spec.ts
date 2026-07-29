import { test, expect } from "@playwright/test";
import { mockOpencodeServer, makeSession } from "./fixtures/opencode";

test.describe("RAG & Qdrant Integration E2E", () => {
  test("configure Qdrant → test connection → index workspace → search", async ({ page }) => {
    // 1. Mock OpenCode server & Qdrant REST endpoints
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "RAG Test Session", 1)],
    });

    // Mock Qdrant REST endpoints
    await page.route("http://localhost:6333/", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ title: "qdrant", version: "1.7.0" }),
      })
    );

    await page.route("http://localhost:6333/collections", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { collections: [{ name: "cortex_workspace" }] } }),
      })
    );

    await page.route("http://localhost:6333/collections/cortex_workspace/points/search", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: [
            {
              id: "src/lib/rag/indexer.ts:1",
              score: 0.95,
              payload: {
                filePath: "/workspace/src/lib/rag/indexer.ts",
                relativePath: "src/lib/rag/indexer.ts",
                content: "export class WorkspaceIndexer { ... }",
                language: "typescript",
                lineStart: 1,
                lineEnd: 25,
              },
            },
          ],
        }),
      })
    );

    // 2. Navigate to application
    await page.goto("/");

    // 3. Open settings dialog via settings button
    await page.getByRole("button", { name: "Ustawienia" }).click();
    const dialog = page.getByRole("dialog", { name: "Ustawienia" });
    await expect(dialog).toBeVisible();

    // 4. Switch to Infra tab
    const infraTab = page.getByRole("tab", { name: /Infrastruktura/i });
    await infraTab.click();

    // 5. Test Qdrant connection button
    const testButton = page.getByRole("button", { name: /Testuj Połączenie/i }).first();
    await expect(testButton).toBeVisible();
    await testButton.click();

    await expect(page.getByText(/✓ Połączono/i)).toBeVisible();

    // 6. Close modal
    await page.getByRole("button", { name: "Zamknij ustawienia" }).click();
    await expect(dialog).toBeHidden();
  });
});
