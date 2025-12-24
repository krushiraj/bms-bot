/**
 * BasePage - Foundation for Page Object Model
 * 
 * LEARNING CONCEPT: Page Object Model (POM)
 * -----------------------------------------
 * POM is a design pattern that:
 * 1. Encapsulates page elements and interactions in classes
 * 2. Makes tests more readable and maintainable
 * 3. Reduces code duplication
 * 4. Makes changes easier (update selector in one place)
 * 
 * This BasePage provides common functionality inherited by all pages.
 */

import { config } from '../config/config.js';

export class BasePage {
  /**
   * @param {import('playwright').Page} page - Playwright page instance
   */
  constructor(page) {
    this.page = page;
    this.config = config;
  }

  // ============================================
  // NAVIGATION HELPERS
  // ============================================

  /**
   * Navigate to a URL and wait for the page to load
   * 
   * LEARNING: Different waitUntil strategies:
   * - 'load': Wait for load event (all resources loaded)
   * - 'domcontentloaded': DOM is ready (faster, less complete)
   * - 'networkidle': No network requests for 500ms (slowest, most complete)
   */
  async goto(url, options = {}) {
    const defaultOptions = {
      waitUntil: 'domcontentloaded',
      timeout: this.config.browser.navigationTimeout,
    };
    
    await this.page.goto(url, { ...defaultOptions, ...options });
    this.log(`Navigated to: ${url}`);
  }

  /**
   * Wait for navigation to complete after an action
   */
  async waitForNavigation(options = {}) {
    await this.page.waitForLoadState('networkidle', options);
  }

  // ============================================
  // ELEMENT INTERACTION HELPERS
  // ============================================

  /**
   * Click an element with built-in waiting
   * 
   * LEARNING: Playwright auto-waits for elements, but explicit waits
   * give you more control and better error messages
   */
  async click(selector, options = {}) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: this.config.browser.defaultTimeout });
    await locator.click(options);
    this.log(`Clicked: ${selector}`);
  }

  /**
   * Type text into an input field
   * 
   * LEARNING: 'fill' vs 'type'
   * - fill(): Clears field and sets value instantly (faster)
   * - type(): Types character by character (more realistic)
   */
  async fill(selector, text, options = {}) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible' });
    await locator.fill(text, options);
    this.log(`Filled "${selector}" with: ${text}`);
  }

  /**
   * Type text character by character (simulates real typing)
   */
  async type(selector, text, options = { delay: 50 }) {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible' });
    await locator.type(text, options);
    this.log(`Typed in "${selector}": ${text}`);
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(selector, value) {
    await this.page.selectOption(selector, value);
    this.log(`Selected "${value}" from: ${selector}`);
  }

  /**
   * Hover over an element
   */
  async hover(selector) {
    await this.page.hover(selector);
    this.log(`Hovered: ${selector}`);
  }

  // ============================================
  // WAITING HELPERS
  // ============================================

  /**
   * Wait for an element to be visible
   * 
   * LEARNING: Element states:
   * - 'attached': Element exists in DOM
   * - 'detached': Element removed from DOM
   * - 'visible': Element is visible (not hidden by CSS)
   * - 'hidden': Element exists but not visible
   */
  async waitForSelector(selector, options = {}) {
    const defaultOptions = {
      state: 'visible',
      timeout: this.config.browser.defaultTimeout,
    };
    await this.page.waitForSelector(selector, { ...defaultOptions, ...options });
    this.log(`Element visible: ${selector}`);
  }

  /**
   * Wait for element to disappear
   */
  async waitForSelectorToDisappear(selector, timeout = 10000) {
    await this.page.waitForSelector(selector, { state: 'hidden', timeout });
    this.log(`Element hidden: ${selector}`);
  }

  /**
   * Wait for a specific text to appear on the page
   */
  async waitForText(text, options = {}) {
    await this.page.waitForSelector(`text=${text}`, options);
    this.log(`Text appeared: "${text}"`);
  }

  /**
   * Wait for network to be idle (no requests for 500ms)
   * 
   * LEARNING: Useful after actions that trigger multiple API calls
   */
  async waitForNetworkIdle(timeout = 10000) {
    await this.page.waitForLoadState('networkidle', { timeout });
    this.log('Network idle');
  }

  /**
   * Wait for a specific API response
   * 
   * LEARNING: Intercept network requests to:
   * - Wait for specific data to load
   * - Mock responses in tests
   * - Assert on API calls
   */
  async waitForResponse(urlPattern, options = {}) {
    return await this.page.waitForResponse(
      response => response.url().includes(urlPattern),
      options
    );
  }

  /**
   * Custom polling wait - keep checking until condition is met
   * 
   * LEARNING: Sometimes you need custom wait logic
   */
  async waitUntil(conditionFn, options = {}) {
    const { timeout = 30000, interval = 500 } = options;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const result = await conditionFn();
        if (result) return result;
      } catch (e) {
        // Condition threw error, keep polling
      }
      await this.sleep(interval);
    }
    
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }

  // ============================================
  // ELEMENT QUERY HELPERS
  // ============================================

  /**
   * Check if an element exists and is visible
   */
  async isVisible(selector) {
    try {
      return await this.page.locator(selector).isVisible();
    } catch {
      return false;
    }
  }

  /**
   * Get text content of an element
   */
  async getText(selector) {
    return await this.page.locator(selector).textContent();
  }

  /**
   * Get all matching elements
   * 
   * LEARNING: Use locator.all() to get multiple elements
   */
  async getAll(selector) {
    return await this.page.locator(selector).all();
  }

  /**
   * Count matching elements
   */
  async count(selector) {
    return await this.page.locator(selector).count();
  }

  /**
   * Get element attribute
   */
  async getAttribute(selector, attribute) {
    return await this.page.locator(selector).getAttribute(attribute);
  }

  // ============================================
  // SCREENSHOT & DEBUGGING
  // ============================================

  /**
   * Take a screenshot
   * 
   * LEARNING: Screenshots are invaluable for debugging
   */
  async screenshot(name) {
    const path = `${this.config.browser.screenshotsDir}/${name}-${Date.now()}.png`;
    await this.page.screenshot({ path, fullPage: true });
    this.log(`Screenshot saved: ${path}`);
    return path;
  }

  /**
   * Pause execution for debugging (opens Playwright Inspector)
   */
  async pause() {
    await this.page.pause();
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Sleep for specified milliseconds
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Scroll to an element
   */
  async scrollTo(selector) {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * Execute JavaScript in the browser context
   * 
   * LEARNING: For complex interactions or accessing browser-only APIs
   */
  async evaluate(fn, ...args) {
    return await this.page.evaluate(fn, ...args);
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.config.notifications.enableConsole) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${message}`);
    }
  }

  /**
   * Error logging
   */
  logError(message, error) {
    console.error(`[ERROR] ${message}`, error);
  }

  // ============================================
  // RETRY WRAPPER
  // ============================================

  /**
   * Retry an action with configurable attempts
   * 
   * LEARNING: Network issues and race conditions happen.
   * Retry logic makes automation more robust.
   */
  async retry(action, options = {}) {
    const {
      maxAttempts = this.config.retry.maxAttempts,
      delay = this.config.retry.delayBetweenRetries,
      onRetry = () => {},
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await action();
      } catch (error) {
        lastError = error;
        this.log(`Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
        
        if (attempt < maxAttempts) {
          await onRetry(attempt, error);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }
}

export default BasePage;
