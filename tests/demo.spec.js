/**
 * Demo Playwright Tests
 * 
 * LEARNING CONCEPT: Writing Effective Tests
 * ------------------------------------------
 * These tests demonstrate:
 * 1. Using @playwright/test framework
 * 2. Page Object Model in tests
 * 3. Assertions and expectations
 * 4. Test organization and hooks
 */

import { test, expect } from '@playwright/test';

// ============================================
// BASIC TESTS - Start Here!
// ============================================

test.describe('Basic Navigation', () => {
  
  test('should load the home page', async ({ page }) => {
    // Navigate to the page
    await page.goto('/');
    
    // Check the title
    await expect(page).toHaveTitle(/MockBook/);
    
    // Check that movies are visible
    await expect(page.locator('[data-testid="movie-card"]')).toHaveCount(6);
  });

  test('should search for a movie', async ({ page }) => {
    await page.goto('/');
    
    // Type in search box
    await page.fill('[data-testid="search-input"]', 'Inception');
    
    // Wait a moment for filtering
    await page.waitForTimeout(500);
    
    // Check only matching movie is visible
    const visibleCards = page.locator('[data-testid="movie-card"]:visible');
    await expect(visibleCards).toHaveCount(1);
  });

  test('should select a date', async ({ page }) => {
    await page.goto('/');
    
    // Get all date items
    const dateItems = page.locator('[data-testid="date-item"]');
    
    // Click the second date
    await dateItems.nth(1).click();
    
    // Verify it's active
    await expect(dateItems.nth(1)).toHaveClass(/active/);
  });
});

// ============================================
// THEATRE SELECTION TESTS
// ============================================

test.describe('Theatre Selection', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate and select a movie first
    await page.goto('/');
    await page.click('[data-testid="movie-card"] [data-testid="book-button"]');
  });

  test('should display theatres after selecting movie', async ({ page }) => {
    // Wait for theatre list
    await expect(page.locator('[data-testid="theatre-card"]')).toHaveCount(4);
  });

  test('should show showtimes for each theatre', async ({ page }) => {
    // Each theatre should have showtimes
    const theatres = page.locator('[data-testid="theatre-card"]');
    
    for (const theatre of await theatres.all()) {
      const showtimes = theatre.locator('[data-testid="showtime-btn"]');
      await expect(showtimes).not.toHaveCount(0);
    }
  });

  test('should navigate to seat selection on showtime click', async ({ page }) => {
    // Click first available showtime
    await page.click('[data-testid="showtime-btn"]:not(.disabled)');
    
    // Should see seat layout
    await expect(page.locator('[data-testid="seat-layout"]')).toBeVisible();
  });
});

// ============================================
// SEAT SELECTION TESTS
// ============================================

test.describe('Seat Selection', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to seat selection
    await page.goto('/');
    await page.click('[data-testid="movie-card"] [data-testid="book-button"]');
    await page.click('[data-testid="showtime-btn"]:not(.disabled)');
    await page.waitForSelector('[data-testid="seat-layout"]');
  });

  test('should display seat grid', async ({ page }) => {
    // Check screen is visible
    await expect(page.locator('[data-testid="screen"]')).toBeVisible();
    
    // Check rows exist
    const rows = page.locator('[data-testid="seat-row"]');
    await expect(rows).toHaveCount(14); // A through N
  });

  test('should select and deselect seats', async ({ page }) => {
    // Find an available seat
    const availableSeat = page.locator('[data-testid="seat"].available').first();
    
    // Click to select
    await availableSeat.click();
    await expect(availableSeat).toHaveClass(/selected/);
    
    // Click again to deselect
    await availableSeat.click();
    await expect(availableSeat).toHaveClass(/available/);
  });

  test('should update total price when selecting seats', async ({ page }) => {
    // Get initial price
    const priceElement = page.locator('[data-testid="total-price"]');
    await expect(priceElement).toHaveText('₹0');
    
    // Select a seat
    await page.click('[data-testid="seat"].available');
    
    // Price should update (not be 0)
    await expect(priceElement).not.toHaveText('₹0');
  });

  test('should enable proceed button when seats selected', async ({ page }) => {
    const proceedBtn = page.locator('[data-testid="proceed-btn"]');
    
    // Initially disabled
    await expect(proceedBtn).toBeDisabled();
    
    // Select a seat
    await page.click('[data-testid="seat"].available');
    
    // Now enabled
    await expect(proceedBtn).toBeEnabled();
  });

  test('should not allow selecting sold seats', async ({ page }) => {
    // Find a sold seat
    const soldSeat = page.locator('[data-testid="seat"].sold').first();
    
    // Try to click it
    await soldSeat.click({ force: true }); // force click even though disabled
    
    // Should still be sold, not selected
    await expect(soldSeat).toHaveClass(/sold/);
    await expect(soldSeat).not.toHaveClass(/selected/);
  });
});

// ============================================
// FULL BOOKING FLOW TEST
// ============================================

test.describe('Complete Booking Flow', () => {
  
  test('should complete full booking flow', async ({ page }) => {
    // Step 1: Home page
    await page.goto('/');
    await expect(page).toHaveTitle(/MockBook/);
    
    // Step 2: Select movie
    await page.click('[data-testid="movie-card"]:has-text("Inception") [data-testid="book-button"]');
    
    // Step 3: Select theatre and showtime
    await expect(page.locator('[data-testid="theatre-list"]')).toBeVisible();
    await page.click('[data-testid="showtime-btn"]:not(.disabled)');
    
    // Step 4: Select seats (2 seats)
    await expect(page.locator('[data-testid="seat-layout"]')).toBeVisible();
    const availableSeats = page.locator('[data-testid="seat"].available');
    await availableSeats.nth(0).click();
    await availableSeats.nth(1).click();
    
    // Step 5: Proceed to payment
    await page.click('[data-testid="proceed-btn"]');
    
    // Step 6: Verify order summary
    await expect(page.locator('[data-testid="order-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid="movie-name"]')).toHaveText('Inception');
    await expect(page.locator('[data-testid="ticket-count"]')).toHaveText('2');
    
    // Step 7: Complete payment
    await page.click('[data-testid="payment-option"][data-method="upi"]');
    await page.click('[data-testid="pay-button"]');
    
    // Step 8: Verify success
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="booking-id"]')).toBeVisible();
  });
});

// ============================================
// ADVANCED: Using Page Objects in Tests
// ============================================

test.describe('Using Page Objects (Advanced)', () => {
  
  test('demonstrates page object usage', async ({ page }) => {
    // Import your page objects
    // const homePage = new HomePage(page);
    // await homePage.navigate();
    // await homePage.selectMovie('Inception');
    
    // For now, direct implementation:
    await page.goto('/');
    
    // Get movie count using a helper function
    const movieCount = await page.locator('[data-testid="movie-card"]').count();
    expect(movieCount).toBeGreaterThan(0);
  });
});

// ============================================
// VISUAL TESTING
// ============================================

test.describe('Visual Regression', () => {
  
  test.skip('should match home page screenshot', async ({ page }) => {
    // NOTE: Skip by default as this creates baseline images
    await page.goto('/');
    await expect(page).toHaveScreenshot('home-page.png');
  });
});

// ============================================
// PERFORMANCE TESTING
// ============================================

test.describe('Performance', () => {
  
  test('page should load within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.waitForSelector('[data-testid="movie-card"]');
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000);
  });
});
