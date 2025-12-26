import { Browser, BrowserContext, Page } from 'playwright';
import { launchBrowser, createContext, createPage, closeBrowser, takeScreenshot } from './browser.js';
import { HomePage } from './pages/HomePage.js';
import { ShowtimesPage } from './pages/ShowtimesPage.js';
import { SeatPage } from './pages/SeatPage.js';
import { PaymentPage, BookingResult } from './pages/PaymentPage.js';
import { SeatPrefs } from './seatSelector.js';
import { logger } from '../utils/logger.js';

export interface BookingConfig {
  movieName: string;
  city: string;
  theatres: string[];           // Preferred theatres in order
  preferredTimes: string[];     // e.g., ["7:00 PM", "9:00 PM"]
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
      if (this.context) {
        await this.context.close();
      }
      await closeBrowser();
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
      await homePage.searchMovie(config.movieName);

      const movieFound = await homePage.selectMovieFromSearch(config.movieName);
      if (!movieFound) {
        return { success: false, error: 'Movie not found' };
      }

      // Step 2: Select showtime
      const showtimesPage = new ShowtimesPage(this.page);
      const hasShowtimes = await showtimesPage.waitForShowtimes();
      if (!hasShowtimes) {
        return { success: false, error: 'No showtimes available' };
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
      const seatMapLoaded = await seatPage.waitForSeatMap();
      if (!seatMapLoaded) {
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

      // Apply gift cards
      for (const giftCard of config.giftCards) {
        await paymentPage.selectGiftCardPayment();
        const applied = await paymentPage.applyGiftCard(
          giftCard.cardNumber,
          giftCard.pin
        );
        if (!applied) {
          logger.warn('Gift card failed to apply', {
            card: `****${giftCard.cardNumber.slice(-4)}`,
          });
        }
      }

      // Complete payment
      const bookingResult = await paymentPage.completePayment();

      return {
        success: bookingResult.success,
        bookingResult,
        error: bookingResult.error,
        screenshotPath: bookingResult.screenshotPath,
      };
    } catch (error) {
      logger.error('Booking attempt failed', { error: String(error) });
      const screenshotPath = this.page
        ? await takeScreenshot(this.page, 'booking-error')
        : undefined;

      return {
        success: false,
        error: String(error),
        screenshotPath,
      };
    }
  }
}
