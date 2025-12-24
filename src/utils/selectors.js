/**
 * Selector Strategies & Best Practices
 * 
 * LEARNING CONCEPT: Choosing the Right Selectors
 * ------------------------------------------------
 * The selector you choose affects:
 * - Test reliability (will it break when UI changes?)
 * - Test readability (can others understand it?)
 * - Test speed (some selectors are faster)
 */

// ============================================
// SELECTOR PRIORITY (Best to Worst)
// ============================================

export const SelectorExamples = {
  // 1. TEST IDs (BEST) - Most reliable, won't break with UI changes
  // Add data-testid to your HTML elements
  testId: '[data-testid="book-button"]',
  
  // 2. ROLE-BASED (GREAT) - Accessible and semantic
  // Playwright's getByRole() method
  role: 'button[name="Book Now"]',
  
  // 3. TEXT CONTENT (GOOD) - Readable but can break with text changes
  text: 'text=Book Now',
  
  // 4. CSS SELECTORS (OK) - Flexible but coupled to styling
  css: '.book-button.primary',
  
  // 5. XPATH (AVOID) - Hard to read, brittle
  xpath: '//button[contains(@class, "book")]',
};

// ============================================
// PLAYWRIGHT'S BUILT-IN LOCATORS
// ============================================

/**
 * Demonstrate Playwright's locator methods
 * These are the recommended ways to find elements
 */
export function demonstrateLocators(page) {
  return {
    // By test ID (recommended!)
    byTestId: page.getByTestId('book-button'),
    
    // By role (accessible)
    byRole: page.getByRole('button', { name: 'Book Now' }),
    
    // By label (form elements)
    byLabel: page.getByLabel('Email'),
    
    // By placeholder
    byPlaceholder: page.getByPlaceholder('Search movies...'),
    
    // By text (exact or partial)
    byTextExact: page.getByText('Book Now', { exact: true }),
    byTextPartial: page.getByText('Book'),
    
    // By alt text (images)
    byAltText: page.getByAltText('Movie poster'),
    
    // By title attribute
    byTitle: page.getByTitle('Close'),
    
    // CSS selector (fallback)
    byCss: page.locator('.movie-card'),
    
    // Chaining locators (powerful!)
    chained: page.locator('.movie-card').filter({ hasText: 'Inception' }).getByRole('button'),
    
    // Nth element
    nth: page.locator('.movie-card').nth(2),
    
    // First/Last
    first: page.locator('.movie-card').first(),
    last: page.locator('.movie-card').last(),
  };
}

// ============================================
// WAITING STRATEGIES
// ============================================

/**
 * Different ways to wait for elements
 */
export const WaitStrategies = {
  // Wait for element to be visible
  visible: { state: 'visible' },
  
  // Wait for element to be attached to DOM
  attached: { state: 'attached' },
  
  // Wait for element to be hidden
  hidden: { state: 'hidden' },
  
  // Wait for element to be detached from DOM
  detached: { state: 'detached' },
  
  // Custom timeout
  withTimeout: { state: 'visible', timeout: 10000 },
};

// ============================================
// COMMON PATTERNS
// ============================================

/**
 * Find element within a container
 */
export function withinContainer(page, containerSelector, childSelector) {
  return page.locator(containerSelector).locator(childSelector);
}

/**
 * Find element by multiple criteria
 */
export function byMultipleCriteria(page) {
  return page.locator('.movie-card')
    .filter({ hasText: 'Inception' })
    .filter({ has: page.locator('[data-testid="book-button"]') });
}

/**
 * Handle dynamic content with retry
 */
export async function findWithRetry(page, selector, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    const element = page.locator(selector);
    if (await element.count() > 0) {
      return element;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`Element not found after ${maxAttempts} attempts: ${selector}`);
}

// ============================================
// ANTI-PATTERNS (What NOT to Do)
// ============================================

export const AntiPatterns = {
  // ❌ Fragile CSS with deep nesting
  bad1: 'div.container > div.row > div.col > div.card > button',
  
  // ❌ Index-based selectors (breaks when order changes)
  bad2: '.movie-card:nth-child(3)',
  
  // ❌ Auto-generated class names
  bad3: '.sc-1234abcd',
  
  // ❌ Inline styles
  bad4: '[style="color: red"]',
  
  // ❌ Complex XPath
  bad5: '//div[contains(@class, "movie")]//button[position()=1]',
};

// ============================================
// BEST PRACTICES SUMMARY
// ============================================

export const BestPractices = `
SELECTOR BEST PRACTICES:
========================

1. USE TEST IDs
   - Add data-testid="unique-name" to elements
   - Most reliable, decoupled from styling
   - Example: [data-testid="submit-btn"]

2. USE ROLE SELECTORS
   - Accessibility-friendly
   - page.getByRole('button', { name: 'Submit' })

3. USE TEXT FOR USER-FACING CONTENT
   - page.getByText('Welcome')
   - Readable and intuitive

4. AVOID:
   - Deep CSS nesting
   - Position-based selectors
   - Auto-generated classes
   - Brittle XPath expressions

5. CHAIN LOCATORS FOR PRECISION
   - page.locator('.container').getByRole('button')
   - More specific = more reliable

6. USE FILTERS FOR DYNAMIC CONTENT
   - page.locator('.card').filter({ hasText: 'Item 1' })
`;

export default {
  SelectorExamples,
  demonstrateLocators,
  WaitStrategies,
  withinContainer,
  byMultipleCriteria,
  findWithRetry,
  BestPractices,
};
