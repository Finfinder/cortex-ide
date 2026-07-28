// ─── Model Selector E2E Tests ───────────────────────────────────────────────
// Tests for the ModelSelector component: dropdown, search, selection, agent sync

import { test, expect } from "@playwright/test";
import { mockOpencodeServer, makeSession } from "./fixtures/opencode";
import { ChatPage } from "./pages/ChatPage";

test.describe("Model Selector", () => {
  test("should show all available models in dropdown", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [] },
    });

    await page.goto("/");

    // Wait for model selector to be ready (models may need to load)
    const modelTrigger = page.getByRole("button", { name: /Select model/ });
    await expect(modelTrigger).toBeVisible();
    await expect(modelTrigger).toBeEnabled();
    // Wait for at least one model to be available in the dropdown before clicking
    await page.waitForTimeout(500); // Allow time for models to load

    await modelTrigger.click();

    // Check dropdown is open
    const dropdown = page.getByRole("listbox", { name: "Models" });
    await expect(dropdown).toBeVisible();

    // Check all 7 models from config are present
    const models = [
      "opencode/big-pickle",
      "opencode/deepseek-v4-flash-free",
      "opencode/laguna-s-2.1-free",
      "opencode/ling-3.0-flash-free",
      "opencode/mimo-v2.5-free",
      "opencode/nemotron-3-ultra-free",
      "opencode/north-mini-code-free",
    ];

    for (const model of models) {
      await expect(dropdown.getByRole("option", { name: model })).toBeVisible();
    }
  });

  test("should filter models by search query", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [] },
    });

    await page.goto("/");

    const modelTrigger = page.getByRole("button", { name: /Select model/ });
    await expect(modelTrigger).toBeEnabled();
    await page.waitForTimeout(500); // Allow time for models to load
    await modelTrigger.click();

    const dropdown = page.getByRole("listbox", { name: "Models" });
    await expect(dropdown).toBeVisible();
    const searchInput = dropdown.getByPlaceholder("Search models...");

    // Search for "big"
    await searchInput.fill("big");
    await expect(dropdown.getByRole("option", { name: "opencode/big-pickle" })).toBeVisible();
    await expect(dropdown.getByRole("option", { name: "opencode/deepseek-v4-flash-free" })).not.toBeVisible();

    // Search for "north"
    await searchInput.fill("north");
    await expect(dropdown.getByRole("option", { name: "opencode/north-mini-code-free" })).toBeVisible();
    await expect(dropdown.getByRole("option", { name: "opencode/big-pickle" })).not.toBeVisible();
  });

  test("should select a model and update trigger label", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [] },
    });

    await page.goto("/");

    const modelTrigger = page.getByRole("button", { name: /Select model/ });
    await expect(modelTrigger).toBeEnabled();
    await page.waitForTimeout(500); // Allow time for models to load
    await modelTrigger.click();

    const dropdown = page.getByRole("listbox", { name: "Models" });
    await expect(dropdown).toBeVisible();
    const deepseekOption = dropdown.getByRole("option", { name: "opencode/deepseek-v4-flash-free" });
    await deepseekOption.click();

    // Dropdown should close
    await expect(dropdown).not.toBeVisible();

    // Trigger should show selected model
    await expect(modelTrigger).toContainText("opencode/deepseek-v4-flash-free");
  });

  test("should sync model when agent is changed", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [makeSession("s1", "Demo session", 1)],
      messages: { s1: [] },
    });

    await page.goto("/");

    // Wait for model selector to be ready
    const modelTrigger = page.getByRole("button", { name: /Select model/ });
    await expect(modelTrigger).toBeEnabled();
    await page.waitForTimeout(500); // Allow time for models to load

    // Get initial model (should be default for software-engineer agent)
    const initialModel = await modelTrigger.textContent();

    // Open agent selector
    const agentTrigger = page.getByRole("button", { name: /Select agent/ });
    await agentTrigger.click();

    const agentDropdown = page.getByRole("listbox", { name: "Agents" });
    // Select architect agent (uses big-pickle)
    const architectOption = agentDropdown.getByRole("option", { name: "architect" });
    await architectOption.click();

    // Model should update to architect's default (big-pickle)
    await expect(modelTrigger).toContainText("opencode/big-pickle");

    // Select test-writer agent (uses north-mini-code-free)
    await agentTrigger.click();
    const testWriterOption = agentDropdown.getByRole("option", { name: "test-writer" });
    await testWriterOption.click();

    await expect(modelTrigger).toContainText("opencode/north-mini-code-free");
  });

  test("should persist model selection when switching sessions", async ({ page }) => {
    await mockOpencodeServer(page, {
      sessions: [
        makeSession("s1", "Session 1", 1),
        makeSession("s2", "Session 2", 2),
      ],
      messages: { s1: [], s2: [] },
    });

    await page.goto("/");

    // Wait for model selector to be ready
    const modelTrigger = page.getByRole("button", { name: /Select model/ });
    await expect(modelTrigger).toBeEnabled();
    await page.waitForTimeout(500); // Allow time for models to load

    await modelTrigger.click();

    const dropdown = page.getByRole("listbox", { name: "Models" });
    await expect(dropdown).toBeVisible();
    await dropdown.getByRole("option", { name: "opencode/nemotron-3-ultra-free" }).click();

    await expect(modelTrigger).toContainText("opencode/nemotron-3-ultra-free");

    // Switch to second session
    const sessionsPage = page.getByRole("listbox", { name: "Sessions" });
    await sessionsPage.getByRole("option", { name: "Session 2" }).click();

    // Model should persist
    await expect(modelTrigger).toContainText("opencode/nemotron-3-ultra-free");
  });
});