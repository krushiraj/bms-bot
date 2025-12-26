import { Page } from 'playwright';
import { BasePage } from './BasePage.js';
import { logger } from '../../utils/logger.js';

export interface Showtime {
  time: string;
  format: string;      // e.g., "2D", "IMAX"
  available: boolean;
  price?: string;
}

export interface Theatre {
  name: string;
  showtimes: Showtime[];
}

export class ShowtimesPage extends BasePage {
  private selectors = {
    dateSelector: '[data-testid="date-selector"]',
    dateItem: '.date-item',
    theatreCard: '[data-testid="theatre-card"]',
    theatreName: '.theatre-name',
    showtime: '[data-testid="showtime-pill"]',
    bookButton: 'button:has-text("Book")',
    filterFormat: '[data-testid="format-filter"]',
    venueList: '.venue-list, [data-testid="venue-list"]',
    venueRow: '.venue-details, [data-testid="venue-row"]',
    showtimeLink: 'a[href*="/buytickets/"], button.showtime-pill',
  };

  constructor(page: Page) {
    super(page, 'ShowtimesPage');
  }

  async waitForShowtimes(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.selectors.venueList, {
        timeout: 15000,
      });
      return true;
    } catch (error) {
      logger.warn('No showtimes found', { error });
      return false;
    }
  }

  async selectDate(date: string): Promise<void> {
    try {
      logger.info('Selecting date', { date });

      const dateButtons = this.page.locator('.date-pills button, .date-selector button');
      const count = await dateButtons.count();

      for (let i = 0; i < count; i++) {
        const button = dateButtons.nth(i);
        const text = await button.textContent();
        if (text?.includes(date)) {
          await button.click();
          await this.delay(500);
          return;
        }
      }

      logger.warn('Date not found, using default', { date });
    } catch (error) {
      logger.error('Failed to select date', { date, error });
      throw error;
    }
  }

  async getTheatres(): Promise<string[]> {
    try {
      const theatreElements = this.page.locator('[data-testid="cinema-name"], .venue-name');
      const count = await theatreElements.count();

      const theatres: string[] = [];
      for (let i = 0; i < count; i++) {
        const text = await theatreElements.nth(i).textContent();
        if (text) theatres.push(text.trim());
      }

      logger.info('Found theatres', { count: theatres.length });
      return theatres;
    } catch (error) {
      logger.error('Failed to get theatres', { error });
      return [];
    }
  }

  async selectTheatreShowtime(
    theatreName: string,
    preferredTimes: string[] = []
  ): Promise<boolean> {
    try {
      logger.info('Looking for theatre', { theatreName, preferredTimes });

      const theatreSection = this.page
        .locator(this.selectors.venueRow)
        .filter({ hasText: theatreName })
        .first();

      const exists = (await theatreSection.count()) > 0;
      if (!exists) {
        logger.warn('Theatre not found', { theatreName });
        return false;
      }

      const showtimes = theatreSection.locator(this.selectors.showtimeLink);
      const count = await showtimes.count();

      if (count === 0) {
        logger.warn('No showtimes found for theatre', { theatreName });
        return false;
      }

      // Try preferred times first
      for (const preferredTime of preferredTimes) {
        for (let i = 0; i < count; i++) {
          const showtime = showtimes.nth(i);
          const text = await showtime.textContent();

          if (text?.includes(preferredTime)) {
            logger.info('Found preferred showtime', { time: preferredTime });
            await showtime.click();
            await this.waitForLoad();
            return true;
          }
        }
      }

      // No preferred time found, click first available
      logger.info('Using first available showtime');
      await showtimes.first().click();
      await this.waitForLoad();
      return true;
    } catch (error) {
      logger.error('Failed to select theatre showtime', { theatreName, error });
      return false;
    }
  }

  async clickFirstAvailableShowtime(): Promise<boolean> {
    try {
      const showtimes = this.page.locator(this.selectors.showtimeLink);
      const count = await showtimes.count();

      if (count === 0) {
        logger.warn('No showtimes available');
        return false;
      }

      await showtimes.first().click();
      await this.waitForLoad();
      return true;
    } catch (error) {
      logger.error('Failed to click first showtime', { error });
      return false;
    }
  }
}
