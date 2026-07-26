import type { Page, Locator } from "@playwright/test";

export class ChatPage {
  constructor(readonly page: Page) {}

  get log(): Locator {
    return this.page.getByRole("log", { name: "Conversation" });
  }

  get input(): Locator {
    return this.page.getByLabel(/Message input/);
  }

  get sendButton(): Locator {
    return this.page.getByRole("button", { name: /Send message/ });
  }

  get stopButton(): Locator {
    return this.page.getByRole("button", { name: "Stop generation" });
  }

  get userMessages(): Locator {
    return this.page.getByRole("article", { name: "User message" });
  }

  get assistantMessages(): Locator {
    return this.page.getByRole("article", { name: "Assistant message" });
  }

  async send(text: string): Promise<void> {
    await this.input.fill(text);
    await this.input.press("Control+Enter");
  }
}
