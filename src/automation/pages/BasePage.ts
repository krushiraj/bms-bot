import { Page, Locator } from 'playwright';
import { logger } from '../../utils/logger.js';
import { takeScreenshot } from '../browser.js';

export abstract class BasePage {
  protected page: Page;
  protected name: string;

  constructor(page: Page, name: string) {
    this.page = page;
    this.name = name;
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    logger.debug(`${this.name} loaded`);
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async click(selector: string, options?: { timeout?: number }): Promise<void> {
    const timeout = options?.timeout ?? 10000;
    await this.page.click(selector, { timeout });
    logger.debug(`Clicked: ${selector}`);
  }

  async clickAndWait(selector: string): Promise<void> {
    await Promise.all([
      this.page.waitForLoadState('domcontentloaded'),
      this.page.click(selector),
    ]);
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
    logger.debug(`Filled: ${selector}`);
  }

  async getText(selector: string): Promise<string> {
    const element = await this.page.waitForSelector(selector);
    return (await element?.textContent()) ?? '';
  }

  async isVisible(selector: string, timeout = 5000): Promise<boolean> {
    try {
      await this.page.waitForSelector(selector, { state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  async waitForSelector(
    selector: string,
    options?: { timeout?: number; state?: 'visible' | 'hidden' }
  ): Promise<Locator> {
    const timeout = options?.timeout ?? 10000;
    const state = options?.state ?? 'visible';
    await this.page.waitForSelector(selector, { timeout, state });
    return this.page.locator(selector);
  }

  async screenshot(suffix = ''): Promise<string> {
    const name = `${this.name}${suffix ? `-${suffix}` : ''}`;
    return takeScreenshot(this.page, name);
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
  }

  async scrollToElement(selector: string): Promise<void> {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  async delay(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  getPage(): Page {
    return this.page;
  }
}
