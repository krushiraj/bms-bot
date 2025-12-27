import { Job } from 'bullmq';
import { JobStatus } from '@prisma/client';
import { jobService, JobWithUser } from '../jobService.js';
import { notificationService } from '../notificationService.js';
import { bookingQueue } from '../queues.js';
import { logger } from '../../utils/logger.js';
import { launchBrowser, createContext, createPage } from '../../automation/browser.js';
import { HomePage } from '../../automation/pages/HomePage.js';
import { ShowtimesPage } from '../../automation/pages/ShowtimesPage.js';

export interface WatchJobData {
  jobId: string;
}

export interface WatchResult {
  ticketsFound: boolean;
  theatre?: string;
  showtime?: string;
  error?: string;
}

/**
 * Process a watch job - check if tickets are available for the specified movie
 */
export async function processWatchJob(job: Job<WatchJobData>): Promise<WatchResult> {
  const { jobId } = job.data;

  logger.info('Processing watch job', { jobId, bullmqJobId: job.id });

  // Get job details from database
  const bookingJob = await jobService.getJobWithUser(jobId);
  if (!bookingJob) {
    logger.error('Job not found in database', { jobId });
    return { ticketsFound: false, error: 'Job not found' };
  }

  // Check if job is still in a watchable state
  if (bookingJob.status !== JobStatus.PENDING && bookingJob.status !== JobStatus.WATCHING) {
    logger.info('Job no longer in watchable state', { jobId, status: bookingJob.status });
    return { ticketsFound: false, error: 'Job no longer active' };
  }

  // Check if watch window has expired
  const now = new Date();
  if (now > bookingJob.watchUntilDate) {
    logger.info('Job watch window expired', { jobId, watchUntilDate: bookingJob.watchUntilDate });
    await jobService.updateJobResult(jobId, JobStatus.FAILED, {
      error: 'Watch window expired',
    });
    await notificationService.notify(bookingJob.user.telegramId, {
      type: 'job_expired',
      jobId,
      movieName: bookingJob.movieName,
    });
    return { ticketsFound: false, error: 'Watch window expired' };
  }

  // Update status to WATCHING if it was PENDING
  if (bookingJob.status === JobStatus.PENDING) {
    await jobService.updateJobStatus(jobId, JobStatus.WATCHING);
    await notificationService.notify(bookingJob.user.telegramId, {
      type: 'job_started',
      jobId,
      movieName: bookingJob.movieName,
    });
  }

  // Launch browser and check for tickets
  let browser = null;
  try {
    browser = await launchBrowser({ headless: true });
    const context = await createContext(browser);
    const page = await createPage(context);

    // Navigate to movie page
    const homePage = new HomePage(page);
    await homePage.navigate(bookingJob.city);

    // Search for the movie
    const movieFound = await homePage.clickMovieCard(bookingJob.movieName);
    if (!movieFound) {
      await homePage.searchMovie(bookingJob.movieName);
      const selected = await homePage.selectMovieFromSearch(bookingJob.movieName);
      if (!selected) {
        logger.info('Movie not found on BMS', { jobId, movieName: bookingJob.movieName });
        return { ticketsFound: false, error: 'Movie not found' };
      }
    }

    // Click book tickets button
    await homePage.clickBookTickets();

    // Check showtimes page
    const showtimesPage = new ShowtimesPage(page);
    const hasShowtimes = await showtimesPage.waitForShowtimes();

    if (!hasShowtimes) {
      logger.info('No showtimes available', { jobId, movieName: bookingJob.movieName });
      return { ticketsFound: false };
    }

    // Check for preferred theatres
    const showtimePrefs = bookingJob.showtimePrefs as { preferredDates?: string[]; preferredTimes?: string[] };

    // Try each preferred theatre
    for (const theatre of bookingJob.theatres) {
      const found = await showtimesPage.selectTheatreShowtime(
        theatre,
        showtimePrefs.preferredTimes || []
      );

      if (found) {
        logger.info('Tickets found!', {
          jobId,
          movieName: bookingJob.movieName,
          theatre,
        });

        // Update job status to BOOKING
        await jobService.updateJobStatus(jobId, JobStatus.BOOKING);

        // Notify user
        await notificationService.notify(bookingJob.user.telegramId, {
          type: 'tickets_found',
          jobId,
          movieName: bookingJob.movieName,
          theatre,
        });

        // Add to booking queue
        await bookingQueue.add(
          `booking-${jobId}`,
          { jobId },
          { jobId: `booking-${jobId}` }
        );

        await context.close();
        await browser.close();

        return {
          ticketsFound: true,
          theatre,
        };
      }
    }

    // No tickets found in preferred theatres
    await context.close();
    await browser.close();

    logger.debug('No tickets in preferred theatres', { jobId, theatres: bookingJob.theatres });
    return { ticketsFound: false };

  } catch (error) {
    logger.error('Watch job failed', { jobId, error: String(error) });

    if (browser) {
      await browser.close().catch(() => {});
    }

    return { ticketsFound: false, error: String(error) };
  }
}
