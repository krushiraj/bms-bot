import { Worker, Job } from 'bullmq';
import { createRedisConnection } from './redis.js';
import { processWatchJob, WatchJobData, WatchResult } from './processors/watchProcessor.js';
import { processBookingJob, BookingJobData, BookingProcessResult } from './processors/bookingProcessor.js';
import { logger } from '../utils/logger.js';

let watchWorker: Worker<WatchJobData, WatchResult> | null = null;
let bookingWorker: Worker<BookingJobData, BookingProcessResult> | null = null;

/**
 * Start the watch job worker
 */
export function startWatchWorker(): Worker<WatchJobData, WatchResult> {
  const connection = createRedisConnection('watch-worker');

  watchWorker = new Worker<WatchJobData, WatchResult>(
    'watch',
    async (job: Job<WatchJobData>) => {
      return processWatchJob(job);
    },
    {
      connection,
      concurrency: 2, // Process 2 watch jobs at a time
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    }
  );

  watchWorker.on('completed', (job, result) => {
    logger.info('Watch job completed', {
      jobId: job.data.jobId,
      ticketsFound: result.ticketsFound,
    });
  });

  watchWorker.on('failed', (job, error) => {
    logger.error('Watch job failed', {
      jobId: job?.data.jobId,
      error: error.message,
    });
  });

  watchWorker.on('error', (error) => {
    logger.error('Watch worker error', { error: error.message });
  });

  logger.info('Watch worker started');
  return watchWorker;
}

/**
 * Start the booking job worker
 */
export function startBookingWorker(): Worker<BookingJobData, BookingProcessResult> {
  const connection = createRedisConnection('booking-worker');

  bookingWorker = new Worker<BookingJobData, BookingProcessResult>(
    'booking',
    async (job: Job<BookingJobData>) => {
      return processBookingJob(job);
    },
    {
      connection,
      concurrency: 1, // Only one booking at a time
    }
  );

  bookingWorker.on('completed', (job, result) => {
    logger.info('Booking job completed', {
      jobId: job.data.jobId,
      success: result.success,
      bookingId: result.bookingId,
    });
  });

  bookingWorker.on('failed', (job, error) => {
    logger.error('Booking job failed', {
      jobId: job?.data.jobId,
      error: error.message,
    });
  });

  bookingWorker.on('error', (error) => {
    logger.error('Booking worker error', { error: error.message });
  });

  logger.info('Booking worker started');
  return bookingWorker;
}

/**
 * Start all workers
 */
export function startWorkers(): {
  watchWorker: Worker<WatchJobData, WatchResult>;
  bookingWorker: Worker<BookingJobData, BookingProcessResult>;
} {
  return {
    watchWorker: startWatchWorker(),
    bookingWorker: startBookingWorker(),
  };
}

/**
 * Stop all workers gracefully
 */
export async function stopWorkers(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (watchWorker) {
    closePromises.push(
      watchWorker.close().then(() => {
        logger.info('Watch worker stopped');
      })
    );
  }

  if (bookingWorker) {
    closePromises.push(
      bookingWorker.close().then(() => {
        logger.info('Booking worker stopped');
      })
    );
  }

  await Promise.all(closePromises);
  logger.info('All workers stopped');
}
