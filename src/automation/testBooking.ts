/**
 * Manual test script for the booking flow
 * Run with: HEADLESS=false yarn tsx src/automation/testBooking.ts
 */

import 'dotenv/config';
import { BookingFlow, BookingConfig } from './bookingFlow.js';
import { logger } from '../utils/logger.js';

// Module-scoped flow instance for cleanup access
let flow: BookingFlow | null = null;

const config: BookingConfig = {
  movieName: process.env.TEST_MOVIE || 'Pushpa 2',
  city: process.env.TEST_CITY || 'hyderabad',
  theatres: ['PVR', 'INOX', 'Cinepolis'],
  preferredTimes: ['7:00', '8:00', '9:00'],
  seatPrefs: {
    count: 2,
    avoidBottomRows: 3,
    preferCenter: true,
    needAdjacent: true,
  },
  userEmail: 'test@example.com',
  userPhone: '9876543210',
  giftCards: [],
};

async function cleanup(): Promise<void> {
  if (flow) {
    await flow.cleanup();
    flow = null;
  }
}

async function main(): Promise<void> {
  flow = new BookingFlow();

  try {
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
    logger.error('Test failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    await cleanup();

    if (process.env.HEADLESS === 'false') {
      logger.info('Test complete. Exiting in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      logger.info('Test complete.');
    }
  }
}

// Signal handlers for graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, cleaning up...');
  await cleanup();
  process.exit(130);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, cleaning up...');
  await cleanup();
  process.exit(143);
});

// Run with proper error handling
main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Unhandled error in main', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });
