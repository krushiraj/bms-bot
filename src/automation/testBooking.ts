/**
 * Manual test script for the booking flow
 * Run with: HEADLESS=false yarn tsx src/automation/testBooking.ts
 */

import 'dotenv/config';
import { BookingFlow, BookingConfig } from './bookingFlow.js';
import { logger } from '../utils/logger.js';

async function main() {
  const flow = new BookingFlow();

  const config: BookingConfig = {
    movieName: 'Pushpa 2', // Change to a movie currently showing
    city: 'hyderabad',
    theatres: ['PVR', 'INOX', 'Cinepolis'], // Partial names work
    preferredTimes: ['7:00', '8:00', '9:00'],
    seatPrefs: {
      count: 2,
      avoidBottomRows: 3,
      preferCenter: true,
      needAdjacent: true,
    },
    userEmail: 'test@example.com',
    userPhone: '9876543210',
    giftCards: [
      // Add real gift card for actual test
      // { cardNumber: '1234567890123456', pin: '1234' },
    ],
  };

  try {
    // Run in headed mode for debugging
    const headless = process.env.HEADLESS !== 'false';
    logger.info('Starting test booking', { headless, movie: config.movieName });

    await flow.initialize(headless);

    const result = await flow.attemptBooking(config);

    if (result.success) {
      logger.info('Booking successful!', {
        bookingId: result.bookingResult?.bookingId,
        screenshot: result.screenshotPath,
      });
    } else {
      logger.error('Booking failed', {
        error: result.error,
        screenshot: result.screenshotPath,
      });
    }
  } catch (error) {
    logger.error('Test failed', { error: String(error) });
  } finally {
    await flow.cleanup();

    if (process.env.HEADLESS === 'false') {
      // Keep process alive briefly to see final state
      logger.info('Test complete. Exiting in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      logger.info('Test complete.');
    }
  }
}

main();
