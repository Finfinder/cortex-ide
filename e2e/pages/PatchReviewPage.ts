import type { Page, Locator } from "@playwright/test";

export class PatchReviewPage {
  constructor(readonly page: Page) {}

  get queue(): Locator {
    return this.page.getByRole("complementary", { name: "Patch review queue" });
  }

  patchSection(file: string): Locator {
    return this.page.getByRole("region", { name: new RegExp(file) });
  }

  get approveAllButton(): Locator {
    return this.page.getByRole("button", { name: "Approve all" });
  }

  get rejectAllButton(): Locator {
    return this.page.getByRole("button", { name: "Reject all" });
  }

  async approve(file: string): Promise<void> {
    await this.patchSection(file).getByRole("button", { name: "✓ Approve" }).click();
  }

  async reject(file: string): Promise<void> {
    await this.patchSection(file).getByRole("button", { name: "✗ Reject" }).click();
  }

  async toggleGitDiff(file: string): Promise<void> {
    await this.patchSection(file).getByRole("button", { name: "Git diff" }).click();
  }

  async toggleSplit(file: string): Promise<void> {
    await this.patchSection(file).getByRole("button", { name: "Split" }).click();
  }
}
