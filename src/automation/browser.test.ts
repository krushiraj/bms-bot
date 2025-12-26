import { describe, it, expect, afterAll } from 'vitest';
import { launchBrowser, createContext, createPage, closeBrowser } from './browser.js';

describe('browser', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('should launch browser and create page', async () => {
    const browser = await launchBrowser({ headless: true });
    expect(browser).toBeDefined();

    const context = await createContext(browser);
    expect(context).toBeDefined();

    const page = await createPage(context);
    expect(page).toBeDefined();

    await page.goto('https://example.com');
    const title = await page.title();
    expect(title).toContain('Example');

    await context.close();
  }, 30000);
});
