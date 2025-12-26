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
    try {
      const timeout = options?.timeout ?? 10000;
      await this.page.click(selector, { timeout });
      logger.debug(`Clicked: ${selector}`);
    } catch (error) {
      logger.error(`Failed to click: ${selector}`, { error });
      throw error;
    }
  }

  async clickAndWait(selector: string): Promise<void> {
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      this.page.click(selector),
    ]);
  }

  async fill(selector: string, value: string): Promise<void> {
    try {
      await this.page.fill(selector, value);
      logger.debug(`Filled: ${selector}`);
    } catch (error) {
      logger.error(`Failed to fill: ${selector}`, { error });
      throw error;
    }
  }

  async getText(selector: string): Promise<string> {
    try {
      const element = await this.page.waitForSelector(selector);
      return (await element?.textContent()) ?? '';
    } catch (error) {
      logger.warn(`Element not found for getText: ${selector}`);
      return '';
    }
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
    const locator = this.page.locator(selector);
    await locator.waitFor({ timeout, state });
    return locator;
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
