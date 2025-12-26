import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export interface BrowserOptions {
  headless?: boolean;
  slowMo?: number;
  viewport?: { width: number; height: number };
}

const DEFAULT_OPTIONS: BrowserOptions = {
  headless: true,
  slowMo: 50,
  viewport: { width: 1920, height: 1080 },
};

let browserInstance: Browser | null = null;

export async function launchBrowser(
  options: BrowserOptions = {}
): Promise<Browser> {
  try {
    // Close existing instance if present
    if (browserInstance) {
      logger.warn('Browser instance already exists, closing it');
      await closeBrowser();
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Check HEADLESS env var
    if (process.env.HEADLESS === 'false') {
      opts.headless = false;
    }

    logger.info('Launching browser', { headless: opts.headless });

    browserInstance = await chromium.launch({
      headless: opts.headless,
      slowMo: opts.slowMo,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    });

    return browserInstance;
  } catch (error) {
    logger.error('Failed to launch browser', { error });
    throw error;
  }
}

export async function createContext(
  browser: Browser,
  options: BrowserOptions = {}
): Promise<BrowserContext> {
  try {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const context = await browser.newContext({
      viewport: opts.viewport,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      geolocation: { latitude: 17.385, longitude: 78.4867 }, // Hyderabad
      permissions: ['geolocation'],
    });

    // Add stealth scripts to evade detection
    await context.addInitScript(() => {
      // Override webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-IN', 'en-US', 'en'],
      });
    });

    return context;
  } catch (error) {
    logger.error('Failed to create browser context', { error });
    throw error;
  }
}

export async function createPage(context: BrowserContext): Promise<Page> {
  try {
    const page = await context.newPage();

    // Set default timeouts
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    return page;
  } catch (error) {
    logger.error('Failed to create page', { error });
    throw error;
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    logger.info('Browser closed');
  }
}

export async function takeScreenshot(
  page: Page,
  name: string
): Promise<string> {
  try {
    const timestamp = Date.now();
    const screenshotsDir = join(process.cwd(), 'screenshots');

    // Ensure directory exists
    await mkdir(screenshotsDir, { recursive: true });

    const filePath = join(screenshotsDir, `${name}-${timestamp}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    logger.info('Screenshot saved', { path: filePath });
    return filePath;
  } catch (error) {
    logger.error('Failed to take screenshot', { error });
    throw error;
  }
}
