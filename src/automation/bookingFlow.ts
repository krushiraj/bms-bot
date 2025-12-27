import { Browser, BrowserContext, Page } from 'playwright';
import { launchBrowser, createContext, createPage, takeScreenshot } from './browser.js';
import { HomePage } from './pages/HomePage.js';
import { ShowtimesPage } from './pages/ShowtimesPage.js';
import { SeatPage } from './pages/SeatPage.js';
import { PaymentPage, BookingResult } from './pages/PaymentPage.js';
import { SeatPrefs } from './seatSelector.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

export interface BookingConfig {
  movieName: string;
  city: string;
  theatres: string[];           // Preferred theatres in order
  preferredTimes: string[];     // e.g., ["7:00 PM", "9:00 PM"]
  date?: string;                // Day of month (e.g., "28" for 28th)
  seatPrefs: SeatPrefs;
  userEmail: string;
  userPhone: string;
  giftCards: Array<{ cardNumber: string; pin: string }>;
}

export interface BookingAttemptResult {
  success: boolean;
  bookingResult?: BookingResult;
  error?: string;
  screenshotPath?: string;
}

export class BookingFlow {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private debugDir = 'screenshots/debug';

  private async saveDebugInfo(step: string): Promise<void> {
    if (!this.page) return;

    try {
      // Ensure debug directory exists
      await fs.promises.mkdir(this.debugDir, { recursive: true });

      const timestamp = Date.now();
      const baseFileName = `${step}-${timestamp}`;

      // Save screenshot
      const screenshotPath = path.join(this.debugDir, `${baseFileName}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: true });

      // Save HTML
      const htmlPath = path.join(this.debugDir, `${baseFileName}.html`);
      const html = await this.page.content();
      await fs.promises.writeFile(htmlPath, html);

      // Save URL
      const url = this.page.url();
      logger.info(`Debug saved: ${step}`, { url, screenshot: screenshotPath, html: htmlPath });
    } catch (error) {
      logger.warn('Failed to save debug info', { step, error: String(error) });
    }
  }

  async initialize(headless = true): Promise<void> {
    try {
      this.browser = await launchBrowser({ headless });
      this.context = await createContext(this.browser);
      this.page = await createPage(this.context);
      logger.info('Booking flow initialized');
    } catch (error) {
      logger.error('Failed to initialize booking flow', { error: String(error) });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
      logger.info('Booking flow cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup booking flow', { error: String(error) });
    }
  }

  async attemptBooking(config: BookingConfig): Promise<BookingAttemptResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      // Step 1: Navigate to movie
      logger.info('Starting booking attempt', { movie: config.movieName });
      const homePage = new HomePage(this.page);
      await homePage.navigate(config.city);
      await this.saveDebugInfo('01-homepage-loaded');

      // Try multiple approaches to find the movie
      let movieFound = false;

      // Approach 1: Try clicking movie card directly from homepage (faster)
      movieFound = await homePage.clickMovieCard(config.movieName);
      await this.saveDebugInfo('02-after-movie-card-click');

      // Approach 2: If not found on homepage, try search
      if (!movieFound) {
        logger.info('Movie not on homepage, trying search');
        await homePage.searchMovie(config.movieName);
        await this.saveDebugInfo('03-after-search');
        movieFound = await homePage.selectMovieFromSearch(config.movieName);
        await this.saveDebugInfo('04-after-movie-select');
      }

      if (!movieFound) {
        await this.saveDebugInfo('error-movie-not-found');
        return { success: false, error: 'Movie not found' };
      }

      // Step 1.5: Click "Book tickets" button on movie details page
      const bookClicked = await homePage.clickBookTickets();
      await this.saveDebugInfo('05-after-book-tickets-click');
      if (!bookClicked) {
        logger.warn('Book tickets button not found, continuing anyway');
      }

      // Step 2: Select showtime
      const showtimesPage = new ShowtimesPage(this.page);
      const hasShowtimes = await showtimesPage.waitForShowtimes();
      await this.saveDebugInfo('06-showtimes-page');
      if (!hasShowtimes) {
        await this.saveDebugInfo('error-no-showtimes');
        return { success: false, error: 'No showtimes available' };
      }

      // Select the specified date if provided
      if (config.date) {
        await showtimesPage.selectDateByDay(config.date);
        await this.saveDebugInfo('06b-after-date-selection');
      }

      // Try each preferred theatre
      let showtimeSelected = false;
      for (const theatre of config.theatres) {
        showtimeSelected = await showtimesPage.selectTheatreShowtime(
          theatre,
          config.preferredTimes
        );
        if (showtimeSelected) break;
      }

      if (!showtimeSelected) {
        // Fallback to any available
        showtimeSelected = await showtimesPage.clickFirstAvailableShowtime();
      }

      if (!showtimeSelected) {
        return { success: false, error: 'No suitable showtime found' };
      }

      // Step 3: Select seats
      const seatPage = new SeatPage(this.page);

      // Handle the "How many seats?" dialog first
      const seatCountHandled = await seatPage.handleSeatCountDialog(config.seatPrefs.count);
      if (!seatCountHandled) {
        await this.saveDebugInfo('error-seat-count-dialog');
        return { success: false, error: 'Could not handle seat count dialog' };
      }
      await this.saveDebugInfo('07-after-seat-count-dialog');

      const seatMapLoaded = await seatPage.waitForSeatMap();
      if (!seatMapLoaded) {
        await this.saveDebugInfo('error-seat-map-not-loaded');
        return { success: false, error: 'Seat map not loaded' };
      }

      const selectedGroup = await seatPage.selectOptimalSeats(config.seatPrefs);
      if (!selectedGroup) {
        return {
          success: false,
          error: 'No suitable seats available',
          screenshotPath: await takeScreenshot(this.page, 'no-seats'),
        };
      }

      // Check if seats meet minimum score
      if (selectedGroup.avgScore < 0.4) {
        logger.warn('Only poor seats available', { score: selectedGroup.avgScore });
        // Could pause here for user consent in real implementation
      }

      const proceeded = await seatPage.proceedToPayment();
      if (!proceeded) {
        return { success: false, error: 'Could not proceed to payment' };
      }

      // Step 4: Complete payment
      const paymentPage = new PaymentPage(this.page);
      const paymentLoaded = await paymentPage.waitForPaymentPage();
      if (!paymentLoaded) {
        return { success: false, error: 'Payment page not loaded' };
      }

      // Fill contact info
      const contactFilled = await paymentPage.fillContactDetails(config.userEmail, config.userPhone);
      if (!contactFilled) {
        return { success: false, error: 'Invalid contact details' };
      }

      // Submit contact form to reach payment options page
      const bookingResult = await paymentPage.completePayment();

      // If we reached payment options page successfully, try applying gift cards
      if (bookingResult.success && config.giftCards.length > 0) {
        logger.info('Reached payment options, attempting to apply gift cards');
        await this.saveDebugInfo('08-payment-options-page');

        for (const giftCard of config.giftCards) {
          // Select gift card payment option
          const giftCardSelected = await paymentPage.selectGiftCardPayment();
          if (!giftCardSelected) {
            logger.warn('Could not select Gift Voucher option');
            continue;
          }

          // Apply the gift card
          const result = await paymentPage.applyGiftCard(
            giftCard.cardNumber,
            giftCard.pin
          );

          if (result.applied) {
            logger.info('Gift card applied successfully', {
              card: `****${giftCard.cardNumber.slice(-4)}`,
            });
          } else {
            // Expected for test - gift card rejected
            logger.info('Gift card rejected (expected for test)', {
              card: `****${giftCard.cardNumber.slice(-4)}`,
              error: result.error,
            });
          }
        }

        await this.saveDebugInfo('09-after-gift-card-attempt');
      }

      return {
        success: bookingResult.success,
        bookingResult,
        error: bookingResult.error,
        screenshotPath: bookingResult.screenshotPath,
      };
    } catch (error) {
      logger.error('Booking attempt failed', { error: String(error) });

      let screenshotPath: string | undefined;
      if (this.page) {
        try {
          screenshotPath = await takeScreenshot(this.page, 'booking-error');
        } catch (screenshotError) {
          logger.warn('Failed to take error screenshot', { error: String(screenshotError) });
        }
      }

      return {
        success: false,
        error: String(error),
        screenshotPath,
      };
    }
  }
}
