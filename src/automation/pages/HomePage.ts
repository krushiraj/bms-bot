import { Page } from 'playwright';
import { BasePage } from './BasePage.js';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

export class HomePage extends BasePage {
  private baseUrl = 'https://in.bookmyshow.com';

  // Selectors - multiple fallbacks for robustness
  private selectors = {
    // Search input selectors (multiple options)
    searchInputs: [
      'input[placeholder*="Search for Movies"]',
      'input[placeholder*="Search"]',
      '.sc-bczRLJ input',
      'header input[type="text"]',
      '[data-testid="search-input"]',
    ],
    searchResults: '[class*="SearchResult"], [class*="search-result"], .sc-7o7nez-0',
    searchDropdown: '[class*="Dropdown"], [class*="dropdown"], [role="listbox"]',
    movieCard: '[data-testid="movie-card"]',
    recommendedMovies: '.style-module__cardContainer, [class*="cardContainer"], .sc-133848s-0',
    citySelector: '[data-testid="city-selector"]',
    currentCity: '.sc-fihHvN',
  };

  constructor(page: Page) {
    super(page, 'HomePage');
  }

  async navigate(city = 'hyderabad'): Promise<void> {
    try {
      const url = `${this.baseUrl}/explore/home/${city}`;
      logger.info('Navigating to BMS', { url });
      await this.page.goto(url, { timeout: 30000 });
      await this.waitForLoad();
      // Extra wait for dynamic content
      await this.page.waitForTimeout(2000);
    } catch (error) {
      logger.error('Failed to navigate to home page', { city, error });
      throw error;
    }
  }

  async searchMovie(movieName: string): Promise<void> {
    try {
      logger.info('Searching for movie', { movieName });

      // Try multiple search input selectors
      let searchInput = null;
      for (const selector of this.selectors.searchInputs) {
        const locator = this.page.locator(selector).first();
        const isVisible = await locator.isVisible().catch(() => false);
        if (isVisible) {
          searchInput = locator;
          logger.debug('Found search input', { selector });
          break;
        }
      }

      if (!searchInput) {
        // Try clicking on search icon/area first to reveal input
        const searchArea = this.page.locator('header').locator('text=Search').first();
        if (await searchArea.isVisible().catch(() => false)) {
          await searchArea.click();
          await this.page.waitForTimeout(500);
          // Retry finding input
          for (const selector of this.selectors.searchInputs) {
            const locator = this.page.locator(selector).first();
            if (await locator.isVisible().catch(() => false)) {
              searchInput = locator;
              break;
            }
          }
        }
      }

      if (!searchInput) {
        throw new Error('Search input not found with any selector');
      }

      await searchInput.click();
      await this.page.waitForTimeout(300);
      await searchInput.fill(movieName);

      // Wait for search results dropdown
      await this.page.waitForTimeout(1500); // Wait for API response
      logger.debug('Search query entered', { movieName });
    } catch (error) {
      logger.error('Failed to search for movie', { movieName, error });
      throw error;
    }
  }

  async selectMovieFromSearch(movieName: string): Promise<boolean> {
    try {
      logger.info('Selecting movie from search results', { movieName });

      // Try multiple approaches to find and click the movie

      // Approach 1: Look in search dropdown/results
      const searchResultLink = this.page
        .locator('[class*="search"], [class*="Search"], [role="listbox"], [class*="dropdown"]')
        .locator('a, [role="option"]')
        .filter({ hasText: new RegExp(movieName, 'i') })
        .first();

      if (await searchResultLink.isVisible().catch(() => false)) {
        await searchResultLink.click();
        await this.waitForLoad();
        logger.info('Movie selected from search dropdown', { movieName });
        return true;
      }

      // Approach 2: Generic link with movie name
      const movieLinks = this.page.locator('a').filter({ hasText: new RegExp(movieName, 'i') });
      const count = await movieLinks.count();
      if (count > 0) {
        await movieLinks.first().click();
        await this.waitForLoad();
        logger.info('Movie selected from page links', { movieName });
        return true;
      }

      logger.warn('Movie not found in search results', { movieName });
      return false;
    } catch (error) {
      logger.error('Failed to select movie from search', { movieName, error });
      return false;
    }
  }

  /**
   * Click directly on a movie card from the homepage (recommended movies section)
   */
  async clickMovieCard(movieName: string): Promise<boolean> {
    try {
      logger.info('Looking for movie card on homepage', { movieName });

      // Find movie card by title text
      const movieCard = this.page
        .locator('a')
        .filter({ hasText: new RegExp(movieName, 'i') })
        .first();

      if (await movieCard.isVisible().catch(() => false)) {
        await movieCard.click();
        await this.waitForLoad();
        logger.info('Movie card clicked', { movieName });
        return true;
      }

      logger.warn('Movie card not found on homepage', { movieName });
      return false;
    } catch (error) {
      logger.error('Failed to click movie card', { movieName, error });
      return false;
    }
  }

  async navigateToMovie(movieSlug: string, city = 'hyderabad'): Promise<void> {
    try {
      const url = `${this.baseUrl}/explore/movies/${movieSlug}/${city}`;
      logger.info('Navigating directly to movie', { url });
      await this.page.goto(url, { timeout: 30000 });
      await this.waitForLoad();
    } catch (error) {
      logger.error('Failed to navigate to movie page', { movieSlug, error });
      throw error;
    }
  }

  async getCurrentCity(): Promise<string> {
    try {
      const cityElement = this.page.locator(this.selectors.currentCity).first();
      return await cityElement.textContent() ?? '';
    } catch (error) {
      logger.debug('Failed to get current city', { error });
      return '';
    }
  }

  async isMoviePageLoaded(): Promise<boolean> {
    // Check if we're on a movie details page
    const url = this.page.url();
    return url.includes('/movies/') || url.includes('/events/');
  }

  private async saveDebugScreenshot(name: string): Promise<void> {
    try {
      const dir = 'screenshots/debug';
      await fs.promises.mkdir(dir, { recursive: true });
      const filepath = path.join(dir, `${name}-${Date.now()}.png`);
      await this.page.screenshot({ path: filepath, fullPage: true });
      logger.debug(`Debug screenshot: ${filepath}`);
    } catch (e) {
      logger.debug('Failed to save debug screenshot', { error: String(e) });
    }
  }

  /**
   * Handle age confirmation / content warning dialogs for adult-rated movies
   */
  async handleAgeConfirmation(): Promise<void> {
    try {
      // Wait for any popup to appear
      await this.page.waitForTimeout(1500);

      // Save debug screenshot to see what's on screen
      await this.saveDebugScreenshot('before-age-confirm');

      // Try to click Continue div/button using JavaScript (most reliable)
      // The Continue button is actually a <div> not a <button>
      // Use dispatchEvent with MouseEvent for proper React event handling
      const clicked = await this.page.evaluate(() => {
        // First try clicking the bottomSheet-model-close element directly
        const bottomSheetClose = document.getElementById('bottomSheet-model-close');
        if (bottomSheetClose) {
          // Find the Continue div within it
          const allDivs = bottomSheetClose.querySelectorAll('div');
          for (const div of allDivs) {
            if (div.textContent?.trim() === 'Continue') {
              // Use dispatchEvent with bubbles for React compatibility
              const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
              });
              div.dispatchEvent(event);
              return 'bottomSheet-continue';
            }
          }
          // If no Continue div found, click the container itself
          const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          bottomSheetClose.dispatchEvent(event);
          return 'bottomSheet-container';
        }

        // Try data-testid="modalClose"
        const modalClose = document.querySelector('[data-testid="modalClose"]');
        if (modalClose) {
          const allDivs = modalClose.querySelectorAll('div');
          for (const div of allDivs) {
            if (div.textContent?.trim() === 'Continue') {
              const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
              });
              div.dispatchEvent(event);
              return 'modalClose-continue';
            }
          }
        }

        // Fallback: Find any element with text "Continue"
        const allElements = document.querySelectorAll('div, button, a, span');
        for (const el of allElements) {
          if (el.textContent?.trim() === 'Continue') {
            const event = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            el.dispatchEvent(event);
            return 'fallback-continue';
          }
        }
        return false;
      });

      if (clicked) {
        logger.info('Continue button/div clicked via JS', { method: clicked });
        await this.page.waitForTimeout(2000);
        await this.saveDebugScreenshot('after-js-continue-click');

        // Check if dialog dismissed by waiting for URL change or element removal
        const dialogGone = await this.page.evaluate(() => {
          const bottomSheet = document.getElementById('bottomSheet-model-close');
          const modalClose = document.querySelector('[data-testid="modalClose"]');
          return !bottomSheet && !modalClose;
        });

        if (dialogGone) {
          logger.info('Dialog dismissed successfully');
          return;
        }

        // If dialog still visible, try Playwright's native click as backup
        logger.debug('Dialog still visible after JS click, trying Playwright click');
        try {
          const continueLocator = this.page.locator('#bottomSheet-model-close div').filter({ hasText: /^Continue$/ }).first();
          if (await continueLocator.isVisible({ timeout: 1000 }).catch(() => false)) {
            await continueLocator.click({ force: true, timeout: 3000 });
            logger.info('Clicked Continue via Playwright locator');
            await this.page.waitForTimeout(2000);
            return;
          }
        } catch (e) {
          logger.debug('Playwright click fallback failed', { error: String(e) });
        }

        return;
      }

      // First, look for the specific A-rated content warning dialog
      // Dialog contains: "This movie is rated "A" and is only for viewers above 18"
      const contentWarningDialog = this.page.locator('div, section').filter({
        hasText: /rated.*A.*only for viewers above 18/i,
      }).first();

      if (await contentWarningDialog.isVisible().catch(() => false)) {
        logger.debug('Found A-rated content warning dialog');

        // Look for Continue button within this dialog
        const continueBtn = contentWarningDialog.locator('button').filter({
          hasText: /continue/i,
        }).first();

        if (await continueBtn.isVisible().catch(() => false)) {
          await continueBtn.click({ force: true, timeout: 5000 });
          logger.info('A-rated content warning dismissed');
          await this.page.waitForTimeout(2000);
          await this.saveDebugScreenshot('after-age-confirm');
          return;
        }
      }

      // Fallback: Try to find any visible Continue button on the page
      const globalContinueBtn = this.page.locator('button').filter({
        hasText: /^continue$/i,
      }).first();

      if (await globalContinueBtn.isVisible().catch(() => false)) {
        await globalContinueBtn.click();
        logger.info('Continue button clicked');
        await this.page.waitForTimeout(2000);
        await this.saveDebugScreenshot('after-continue-click');
        return;
      }

      // Try getByRole for a button with "Continue" text
      const continueByRole = this.page.getByRole('button', { name: /continue/i }).first();
      if (await continueByRole.isVisible().catch(() => false)) {
        await continueByRole.click();
        logger.info('Continue button clicked (by role)');
        await this.page.waitForTimeout(2000);
        await this.saveDebugScreenshot('after-continue-role');
        return;
      }

      // Look for modal/dialog container
      const modalSelectors = [
        '[role="dialog"]',
        '[class*="modal"]',
        '[class*="Modal"]',
        '[class*="popup"]',
        '[class*="Popup"]',
        '[class*="overlay"]',
      ];

      // Common button selectors for age/content warning dialogs
      const confirmSelectors = [
        'button:has-text("Continue")',
        'button:has-text("I am above 18")',
        'button:has-text("I am 18")',
        'button:has-text("Yes, I am")',
        'button:has-text("Confirm")',
        'button:has-text("Accept")',
        'button:has-text("OK")',
        'button:has-text("Proceed")',
      ];

      // Try to find buttons within a modal
      for (const modalSelector of modalSelectors) {
        const modal = this.page.locator(modalSelector).first();
        if (await modal.isVisible().catch(() => false)) {
          logger.debug('Found modal dialog', { selector: modalSelector });

          for (const btnSelector of confirmSelectors) {
            const button = modal.locator(btnSelector).first();
            if (await button.isVisible().catch(() => false)) {
              await button.click();
              logger.info('Content warning dismissed (modal button)');
              await this.page.waitForTimeout(2000);
              await this.saveDebugScreenshot('after-modal-button');
              return;
            }
          }
        }
      }

      // Then try global buttons
      for (const selector of confirmSelectors) {
        const button = this.page.locator(selector).first();
        if (await button.isVisible().catch(() => false)) {
          await button.click();
          logger.info('Age confirmation accepted');
          await this.page.waitForTimeout(2000);
          await this.saveDebugScreenshot('after-global-button');
          return;
        }
      }

      // No dialog found, that's fine
      logger.debug('No age confirmation dialog found');
      await this.saveDebugScreenshot('no-dialog-found');
    } catch (error) {
      logger.debug('Age confirmation handling error (non-fatal)', { error });
    }
  }

  /**
   * Click the "Book tickets" button on the movie details page
   */
  async clickBookTickets(): Promise<boolean> {
    try {
      logger.info('Looking for Book tickets button');

      // Wait for page to fully load and any dialogs to appear
      await this.page.waitForTimeout(2000);

      // Keep trying to dismiss dialogs (they may reappear)
      for (let i = 0; i < 3; i++) {
        await this.handleAgeConfirmation();

        // Check if dialog is gone
        const dialogStillVisible = await this.page.evaluate(() => {
          const modalClose = document.querySelector('[data-testid="modalClose"]');
          const bottomSheet = document.getElementById('bottomSheet-model-close');
          return modalClose !== null || bottomSheet !== null;
        });

        if (!dialogStillVisible) {
          logger.info('Dialog dismissed successfully');
          break;
        }

        logger.debug(`Dialog still visible, attempt ${i + 1}`);

        // On last attempt, try pressing Escape as a last resort
        if (i === 2) {
          logger.debug('Trying Escape key to dismiss dialog');
          await this.page.keyboard.press('Escape');
          await this.page.waitForTimeout(1000);
        }
      }

      // Check if we're already on showtimes page (some flows skip the movie details page)
      const url = this.page.url();
      if (url.includes('/buytickets/') || url.includes('/showtimes/')) {
        logger.info('Already on showtimes page');
        return true;
      }

      // Wait a moment for any navigation to complete
      await this.page.waitForTimeout(500);

      // Try clicking Book tickets using JavaScript (most reliable)
      const bookClicked = await this.page.evaluate(() => {
        // Find elements containing "Book ticket" text
        const allElements = document.querySelectorAll('div, button, a, span');
        for (const el of allElements) {
          const text = el.textContent?.trim().toLowerCase() || '';
          if (text === 'book tickets' || text === 'book ticket') {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (bookClicked) {
        logger.info('Clicked Book tickets via JS');
        await this.page.waitForTimeout(3000);
        return true;
      }

      // Try multiple selectors for the book button
      const bookButtonSelectors = [
        'div:has-text("Book tickets")',
        'div:has-text("Book ticket")',
        'button:has-text("Book tickets")',
        'a:has-text("Book tickets")',
        '[data-testid="book-button"]',
        '.book-button',
        'button:has-text("Book")',
        'a:has-text("Book")',
      ];

      for (const selector of bookButtonSelectors) {
        const button = this.page.locator(selector).first();
        if (await button.isVisible().catch(() => false)) {
          await button.click({ force: true });
          await this.page.waitForTimeout(3000);
          logger.info('Clicked Book tickets button');
          return true;
        }
      }

      // Also try role-based
      const bookLink = this.page.getByRole('link', { name: /book/i }).first();
      if (await bookLink.isVisible().catch(() => false)) {
        await bookLink.click();
        await this.page.waitForTimeout(3000);
        logger.info('Clicked Book link');
        return true;
      }

      // Check if URL changed after age confirmation (might have navigated to showtimes)
      const newUrl = this.page.url();
      if (newUrl !== url) {
        logger.info('Page navigated after age confirmation', { url: newUrl });
        return true;
      }

      logger.warn('Book tickets button not found');
      return false;
    } catch (error) {
      logger.error('Failed to click Book tickets', { error });
      return false;
    }
  }
}
