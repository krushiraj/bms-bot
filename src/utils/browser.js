/**
 * Browser Utilities
 * 
 * LEARNING CONCEPT: Browser Setup and Management
 * -----------------------------------------------
 * Utility functions for browser lifecycle management
 */

import { chromium, firefox, webkit } from 'playwright';
import { config } from '../config/config.js';

/**
 * Create a browser instance based on configuration
 */
export async function createBrowser() {
  const browserType = getBrowserType();
  
  const browser = await browserType.launch({
    headless: config.browser.headless,
    slowMo: config.browser.slowMo,
  });
  
  return browser;
}

/**
 * Get the browser type from config
 */
function getBrowserType() {
  switch (config.browser.browserType) {
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    case 'chromium':
    default:
      return chromium;
  }
}

/**
 * Create a browser context with common settings
 */
export async function createContext(browser) {
  const context = await browser.newContext({
    viewport: config.browser.viewport,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ...(config.browser.recordVideo && {
      recordVideo: { dir: './videos' }
    }),
  });
  
  return context;
}

/**
 * Create page with default settings
 */
export async function createPage(context) {
  const page = await context.newPage();
  
  // Set default timeouts
  page.setDefaultTimeout(config.browser.defaultTimeout);
  page.setDefaultNavigationTimeout(config.browser.navigationTimeout);
  
  // Log console messages (useful for debugging)
  page.on('console', msg => {
    if (config.notifications.logLevel === 'debug') {
      console.log(`[Browser Console] ${msg.text()}`);
    }
  });
  
  // Log page errors
  page.on('pageerror', error => {
    console.error(`[Page Error] ${error.message}`);
  });
  
  return page;
}

/**
 * Full browser setup in one call
 */
export async function setupBrowser() {
  const browser = await createBrowser();
  const context = await createContext(browser);
  const page = await createPage(context);
  
  return { browser, context, page };
}

/**
 * Cleanup browser resources
 */
export async function cleanup(browser) {
  if (browser) {
    await browser.close();
  }
}

/**
 * Save storage state (cookies, localStorage) for reuse
 * 
 * LEARNING: Useful for maintaining login state between sessions
 */
export async function saveStorageState(context, filepath = './auth-state.json') {
  await context.storageState({ path: filepath });
  console.log(`Storage state saved to: ${filepath}`);
}

/**
 * Load storage state to skip login
 */
export async function loadStorageState(browser, filepath = './auth-state.json') {
  const context = await browser.newContext({
    storageState: filepath,
  });
  return context;
}

export default {
  createBrowser,
  createContext,
  createPage,
  setupBrowser,
  cleanup,
  saveStorageState,
  loadStorageState,
};
