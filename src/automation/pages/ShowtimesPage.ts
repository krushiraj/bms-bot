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

export interface ShowtimePreferences {
  formats?: string[];    // ["3D", "IMAX"]
  languages?: string[];  // ["Hindi", "Telugu"]
  screens?: string[];    // ["PCX", "DOLBY", "LASER"]
}

export class ShowtimesPage extends BasePage {
  // Multiple selectors for robustness against BMS UI changes
  // BMS uses styled-components with dynamic class names like sc-xxxxx-0
  private selectors = {
    dateSelector: '[data-testid="date-selector"], .date-selector, [class*="dateSelector"]',
    dateItem: '.date-item, [class*="dateItem"], [class*="DatePill"], [id^="2025"], [id^="2026"]',
    theatreCard: '[data-testid="theatre-card"], [class*="venueCard"], [class*="theatre"]',
    theatreName: '.theatre-name, [class*="venueName"], [class*="cinema-name"], .sc-1qdowf4-0',
    showtime: '[data-testid="showtime-pill"], [class*="showtime"], [class*="Showtime"]',
    bookButton: 'button:has-text("Book")',
    filterFormat: '[data-testid="format-filter"]',
    // Multiple venue list selectors - includes BMS styled-component classes
    venueLists: [
      '.ReactVirtualized__Grid',
      '.ReactVirtualized__List',
      '[class*="sc-e8nk8f"]',
      '.venue-list',
      '[data-testid="venue-list"]',
      '[class*="venueList"]',
      '[class*="VenueList"]',
      '[class*="cinemas"]',
      '[class*="theatre-list"]',
      '#showtime-list',
      '.showtime-container',
    ],
    venueRow: '[class*="sc-e8nk8f-3"], .venue-details, [data-testid="venue-row"], [class*="venueDetail"], [class*="cinema-row"]',
    // Showtime pill selectors - includes BMS styled-component pattern
    showtimeLinks: [
      '[class*="sc-1la7659-0"]',
      '[class*="sc-1vhizuf"]',
      'a[href*="/buytickets/"]',
      'button.showtime-pill',
      '[class*="showtime"] a',
      '[class*="Showtime"] a',
      '[class*="showtime-btn"]',
      '[class*="session-btn"]',
      'button[class*="showtime"]',
    ],
    // Cinema/theatre name in the list
    cinemaName: '.sc-1qdowf4-0, [class*="sc-1h5m8q1"]',
    // Showtime time display
    showtimeTime: '[class*="sc-1vhizuf-2"]',
  };

  /**
   * Parse showtime pill text to extract format, language, screen info
   * BMS pills contain info like "7:00 PM", "3D", "PCX", etc.
   */
  private parseShowtimePill(text: string): {
    time: string;
    format?: string;
    screen?: string;
  } {
    const result: { time: string; format?: string; screen?: string } = { time: '' };

    // Extract time (pattern like "7:00 PM", "10:30 AM")
    const timeMatch = text.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i);
    if (timeMatch) {
      result.time = timeMatch[0].toUpperCase();
    }

    // Check for format indicators
    const formats = ['IMAX', '4DX', '3D', '2D'];
    for (const format of formats) {
      if (text.toUpperCase().includes(format)) {
        result.format = format;
        break;
      }
    }

    // Check for screen indicators
    const screens = ['PCX', 'DOLBY', 'LASER', 'BARCO', 'ICE', 'ONYX', 'ATMOS'];
    for (const screen of screens) {
      if (text.toUpperCase().includes(screen)) {
        result.screen = screen;
        break;
      }
    }

    return result;
  }

  /**
   * Score a showtime based on user preferences
   * Higher score = better match
   */
  private scoreShowtime(
    pillText: string,
    preferredTimes: string[],
    prefs?: ShowtimePreferences
  ): number {
    let score = 0;
    const parsed = this.parseShowtimePill(pillText);
    const upperText = pillText.toUpperCase();

    // Screen match: highest priority (+100)
    if (prefs?.screens?.length) {
      for (const screen of prefs.screens) {
        if (upperText.includes(screen.toUpperCase())) {
          score += 100;
          break;
        }
      }
    }

    // Format match: high priority (+50)
    if (prefs?.formats?.length) {
      for (const format of prefs.formats) {
        if (upperText.includes(format.toUpperCase())) {
          score += 50;
          break;
        }
      }
    }

    // Language match: medium priority (+25)
    if (prefs?.languages?.length) {
      for (const lang of prefs.languages) {
        if (upperText.includes(lang.toUpperCase())) {
          score += 25;
          break;
        }
      }
    }

    // Time match: lower priority (+10)
    if (preferredTimes.length > 0) {
      for (const time of preferredTimes) {
        if (parsed.time.includes(time) || time.includes(parsed.time)) {
          score += 10;
          break;
        }
      }
    }

    return score;
  }

  constructor(page: Page) {
    super(page, 'ShowtimesPage');
  }

  async waitForShowtimes(): Promise<boolean> {
    try {
      // Try multiple selectors for venue list
      for (const selector of this.selectors.venueLists) {
        const element = this.page.locator(selector).first();
        const isVisible = await element.isVisible().catch(() => false);
        if (isVisible) {
          logger.debug('Found venue list', { selector });
          return true;
        }
      }

      // Try waiting for any showtime-related element
      for (const selector of this.selectors.venueLists) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          return true;
        } catch {
          continue;
        }
      }

      // Last resort: wait for any element that looks like a theatre/showtime
      const genericSelectors = [
        '[class*="venue"]',
        '[class*="cinema"]',
        '[class*="theatre"]',
        '[class*="showtime"]',
      ];

      for (const selector of genericSelectors) {
        const element = this.page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          logger.debug('Found generic showtime element', { selector });
          return true;
        }
      }

      logger.warn('No showtimes found with any selector');
      return false;
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

  /**
   * Select date by day number (e.g., "28" for 28th)
   * Works with BMS date selector which shows day numbers
   */
  async selectDateByDay(day: string): Promise<boolean> {
    try {
      logger.info('Selecting date by day', { day });

      // Wait for date selector to be visible
      await this.page.waitForTimeout(1000);

      // BMS date pills have IDs like "20251228" and contain div elements with day numbers
      // Look for date pill containing the day number
      const datePills = this.page.locator('[id^="2025"], [id^="2026"]');
      const count = await datePills.count();

      logger.debug('Found date pills', { count });

      for (let i = 0; i < count; i++) {
        const pill = datePills.nth(i);
        const id = await pill.getAttribute('id');
        const text = await pill.textContent();

        // Check if the ID or text contains our day
        // ID format is YYYYMMDD, so day 28 would have ID ending in 28
        if (id?.endsWith(day.padStart(2, '0')) || text?.includes(day)) {
          logger.info('Found date pill', { id, day });
          await pill.click();
          await this.delay(1000); // Wait for page to update
          logger.info('Date selected successfully', { id, day });
          return true;
        }
      }

      // Fallback: Try clicking element with exact day number
      const dayDiv = this.page.locator('div').filter({ hasText: new RegExp(`^${day}$`) }).first();
      if (await dayDiv.isVisible().catch(() => false)) {
        await dayDiv.click();
        await this.delay(1000);
        logger.info('Clicked day number directly', { day });
        return true;
      }

      logger.warn('Date not found, using current date', { day });
      return false;
    } catch (error) {
      logger.error('Failed to select date by day', { day, error });
      // Don't throw - just continue with default date
      return false;
    }
  }

  async getTheatres(): Promise<string[]> {
    try {
      const theatreSelectors = [
        '[data-testid="cinema-name"]',
        '.venue-name',
        '[class*="venueName"]',
        '[class*="cinemaName"]',
        '[class*="theatre-name"]',
      ];

      const theatres: string[] = [];

      for (const selector of theatreSelectors) {
        const elements = this.page.locator(selector);
        const count = await elements.count();

        if (count > 0) {
          for (let i = 0; i < count; i++) {
            const text = await elements.nth(i).textContent();
            if (text) theatres.push(text.trim());
          }
          break;
        }
      }

      logger.info('Found theatres', { count: theatres.length });
      return theatres;
    } catch (error) {
      logger.error('Failed to get theatres', { error });
      return [];
    }
  }

  private async findShowtimeElement(): Promise<ReturnType<typeof this.page.locator> | null> {
    for (const selector of this.selectors.showtimeLinks) {
      const element = this.page.locator(selector);
      const count = await element.count();
      if (count > 0) {
        logger.debug('Found showtime elements', { selector, count });
        return element;
      }
    }
    return null;
  }

  async selectTheatreShowtime(
    theatreName: string,
    preferredTimes: string[] = [],
    prefs?: ShowtimePreferences
  ): Promise<boolean> {
    try {
      logger.info('Looking for theatre', { theatreName, preferredTimes, prefs });

      // Wait for the virtualized list to render
      await this.page.waitForTimeout(2000);

      // Find theatre row by looking for the cinema name span containing the theatre name
      const theatreRow = this.page
        .locator('[class*="sc-e8nk8f-3"]')
        .filter({ hasText: new RegExp(theatreName, 'i') })
        .first();

      const exists = (await theatreRow.count()) > 0;
      if (!exists) {
        // Try alternative approach - look for any element with theatre name
        logger.debug('Theatre row not found with primary selector, trying fallback');
        const fallbackRow = this.page
          .locator('div')
          .filter({ hasText: new RegExp(theatreName, 'i') })
          .first();

        if ((await fallbackRow.count()) === 0) {
          logger.warn('Theatre not found', { theatreName });
          return false;
        }
      }

      // Find showtimes within the theatre row
      const showtimePills = theatreRow.locator('[class*="sc-1la7659-0"], [class*="sc-1vhizuf-1"]');
      const pillCount = await showtimePills.count();

      logger.debug('Found showtime pills in theatre', { theatreName, count: pillCount });

      if (pillCount === 0) {
        logger.warn('No showtimes found for theatre', { theatreName });
        return false;
      }

      // Score all showtimes and pick the best one
      let bestPill: ReturnType<typeof showtimePills.nth> | null = null;
      let bestScore = -1;
      let bestText = '';

      for (let i = 0; i < pillCount; i++) {
        const pill = showtimePills.nth(i);
        const text = await pill.textContent() || '';
        const score = this.scoreShowtime(text, preferredTimes, prefs);

        logger.debug('Scored showtime', { text: text.trim(), score });

        if (score > bestScore) {
          bestScore = score;
          bestPill = pill;
          bestText = text;
        }
      }

      if (bestPill) {
        logger.info('Selected best showtime', {
          text: bestText.trim(),
          score: bestScore,
          hasPrefs: Boolean(prefs?.screens?.length || prefs?.formats?.length)
        });
        await bestPill.click();
        await this.waitForLoad();
        return true;
      }

      // Fallback: click first available
      logger.info('Using first available showtime for theatre');
      await showtimePills.first().click();
      await this.waitForLoad();
      return true;
    } catch (error) {
      logger.error('Failed to select theatre showtime', { theatreName, error });
      return false;
    }
  }

  async clickFirstAvailableShowtime(): Promise<boolean> {
    try {
      // Wait for the virtualized list to render
      await this.page.waitForTimeout(1000);

      // Try finding showtime pills with BMS styled-component classes
      const showtimePills = this.page.locator('[class*="sc-1la7659-0"]');
      let count = await showtimePills.count();

      if (count > 0) {
        logger.info('Clicking first available showtime (pill class)', { count });
        await showtimePills.first().click();
        await this.waitForLoad();
        return true;
      }

      // Fallback to time elements
      const timeElements = this.page.locator('[class*="sc-1vhizuf-2"]');
      count = await timeElements.count();

      if (count > 0) {
        logger.info('Clicking first available showtime (time class)', { count });
        await timeElements.first().click();
        await this.waitForLoad();
        return true;
      }

      // Try original method
      const showtimes = await this.findShowtimeElement();

      if (!showtimes || (await showtimes.count()) === 0) {
        logger.warn('No showtimes available');
        return false;
      }

      logger.info('Clicking first available showtime (legacy)');
      await showtimes.first().click();
      await this.waitForLoad();
      return true;
    } catch (error) {
      logger.error('Failed to click first showtime', { error });
      return false;
    }
  }
}
