import { Job } from 'bullmq';
import { JobStatus } from '@prisma/client';
import { jobService } from '../jobService.js';
import { notificationService } from '../notificationService.js';
import { giftCardService } from '../../services/giftCardService.js';
import { BookingFlow, BookingConfig } from '../../automation/bookingFlow.js';
import { SeatPrefs } from '../../automation/seatSelector.js';
import { logger } from '../../utils/logger.js';

export interface BookingJobData {
  jobId: string;
}

export interface BookingProcessResult {
  success: boolean;
  bookingId?: string;
  seats?: string[];
  theatre?: string;
  showtime?: string;
  totalAmount?: number;
  error?: string;
  screenshotPath?: string;
}

/**
 * Process a booking job - complete the full booking flow
 */
export async function processBookingJob(job: Job<BookingJobData>): Promise<BookingProcessResult> {
  const { jobId } = job.data;

  logger.info('Processing booking job', { jobId, bullmqJobId: job.id });

  // Get job details from database
  const bookingJob = await jobService.getJobWithUser(jobId);
  if (!bookingJob) {
    logger.error('Job not found in database', { jobId });
    return { success: false, error: 'Job not found' };
  }

  // Check if job is in booking state
  if (bookingJob.status !== JobStatus.BOOKING) {
    logger.info('Job not in booking state', { jobId, status: bookingJob.status });
    return { success: false, error: 'Job not in booking state' };
  }

  // Notify user that booking is starting
  await notificationService.notify(bookingJob.user.telegramId, {
    type: 'booking_started',
    jobId,
    movieName: bookingJob.movieName,
  });

  // Get user's gift cards for payment
  const giftCards = await giftCardService.getCardsForBooking(bookingJob.userId, 0);
  const giftCardConfigs = giftCards.map(card => ({
    cardNumber: card.cardNumber,
    pin: card.pin,
  }));

  logger.info('Retrieved gift cards for booking', {
    jobId,
    cardCount: giftCards.length,
  });

  // Prepare booking config
  const seatPrefs = bookingJob.seatPrefs as unknown as SeatPrefs;
  const showtimePrefs = bookingJob.showtimePrefs as {
    preferredDates?: string[];
    preferredTimes?: string[];
  };

  const config: BookingConfig = {
    movieName: bookingJob.movieName,
    city: bookingJob.city,
    theatres: bookingJob.theatres,
    preferredTimes: showtimePrefs.preferredTimes || [],
    date: showtimePrefs.preferredDates?.[0],
    seatPrefs,
    userEmail: bookingJob.user.email || '',
    userPhone: bookingJob.user.phone || '',
    giftCards: giftCardConfigs,
  };

  // Run the booking flow
  const flow = new BookingFlow();
  try {
    await flow.initialize(true); // headless mode

    const result = await flow.attemptBooking(config);

    if (result.success) {
      // Booking successful
      const bookingResult = {
        bookingId: result.bookingResult?.bookingId,
        seats: result.bookingResult?.seats,
        theatre: result.bookingResult?.theatre,
        showtime: result.bookingResult?.showtime,
        totalAmount: result.bookingResult?.totalAmount,
        screenshotPath: result.screenshotPath,
      };

      await jobService.updateJobResult(jobId, JobStatus.SUCCESS, bookingResult);

      // Notify user of success
      if (result.screenshotPath) {
        await notificationService.notifyWithScreenshot(
          bookingJob.user.telegramId,
          {
            type: 'booking_success',
            jobId,
            movieName: bookingJob.movieName,
            theatre: bookingResult.theatre,
            showtime: bookingResult.showtime,
            seats: bookingResult.seats,
            bookingId: bookingResult.bookingId,
            totalAmount: bookingResult.totalAmount,
          },
          result.screenshotPath
        );
      } else {
        await notificationService.notify(bookingJob.user.telegramId, {
          type: 'booking_success',
          jobId,
          movieName: bookingJob.movieName,
          theatre: bookingResult.theatre,
          showtime: bookingResult.showtime,
          seats: bookingResult.seats,
          bookingId: bookingResult.bookingId,
          totalAmount: bookingResult.totalAmount,
        });
      }

      logger.info('Booking completed successfully', {
        jobId,
        bookingId: bookingResult.bookingId,
      });

      return {
        success: true,
        ...bookingResult,
      };
    } else {
      // Booking failed
      await jobService.updateJobResult(jobId, JobStatus.FAILED, {
        error: result.error || 'Booking failed',
        screenshotPath: result.screenshotPath,
      });

      // Notify user of failure
      await notificationService.notify(bookingJob.user.telegramId, {
        type: 'booking_failed',
        jobId,
        movieName: bookingJob.movieName,
        error: result.error,
      });

      logger.error('Booking failed', {
        jobId,
        error: result.error,
      });

      return {
        success: false,
        error: result.error,
        screenshotPath: result.screenshotPath,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Booking job threw error', { jobId, error: errorMessage });

    await jobService.updateJobResult(jobId, JobStatus.FAILED, {
      error: errorMessage,
    });

    await notificationService.notify(bookingJob.user.telegramId, {
      type: 'job_failed',
      jobId,
      movieName: bookingJob.movieName,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  } finally {
    await flow.cleanup();
  }
}
