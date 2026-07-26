import type { Page, Locator } from "@playwright/test";

export class SessionsPage {
  constructor(readonly page: Page) {}

  get searchInput(): Locator {
    return this.page.getByLabel("Search sessions");
  }

  get newSessionButton(): Locator {
    return this.page.getByRole("button", { name: /New session/ });
  }

  sessionOption(title: string): Locator {
    return this.page.getByRole("option", { name: new RegExp(title) });
  }

  deleteButton(title: string): Locator {
    return this.page.getByRole("button", { name: new RegExp(`Delete session ${title}`) });
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  async selectSession(title: string): Promise<void> {
    await this.sessionOption(title).click();
  }

  async createSession(): Promise<void> {
    await this.newSessionButton.click();
  }

  async deleteSession(title: string): Promise<void> {
    await this.sessionOption(title).hover();
    await this.deleteButton(title).click();
  }
}
