import { prisma } from '../db/client.js';
import { JobStatus, BookingJob, Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';

export interface CreateJobInput {
  userId: string;
  movieName: string;
  city: string;
  watchFromDate: Date;
  watchUntilDate: Date;
  theatres: string[];
  showtimePrefs: {
    preferredDates?: string[];
    preferredTimes?: string[];
    preferredFormats?: string[];
    preferredLanguages?: string[];
    preferredScreens?: string[];
  };
  seatPrefs: {
    count: number;
    avoidBottomRows?: number;
    preferCenter?: boolean;
    needAdjacent?: boolean;
  };
}

export interface JobWithUser extends BookingJob {
  user: {
    id: string;
    telegramId: string;
    email: string | null;
    phone: string | null;
  };
}

/**
 * Service for managing booking jobs in the database
 */
export class JobService {
  /**
   * Create a new booking job
   */
  async createJob(input: CreateJobInput): Promise<BookingJob> {
    try {
      const job = await prisma.bookingJob.create({
        data: {
          userId: input.userId,
          movieName: input.movieName,
          city: input.city,
          watchFromDate: input.watchFromDate,
          watchUntilDate: input.watchUntilDate,
          theatres: input.theatres,
          showtimePrefs: input.showtimePrefs as Prisma.JsonObject,
          seatPrefs: input.seatPrefs as Prisma.JsonObject,
          status: JobStatus.PENDING,
        },
      });

      logger.info('Created new booking job', {
        jobId: job.id,
        userId: input.userId,
        movieName: input.movieName,
      });

      return job;
    } catch (error) {
      logger.error('Failed to create booking job', {
        error: String(error),
        input,
      });
      throw error;
    }
  }

  /**
   * Get a job by ID
   */
  async getJobById(jobId: string): Promise<BookingJob | null> {
    return prisma.bookingJob.findUnique({
      where: { id: jobId },
    });
  }

  /**
   * Get a job by ID with user details
   */
  async getJobWithUser(jobId: string): Promise<JobWithUser | null> {
    return prisma.bookingJob.findUnique({
      where: { id: jobId },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  /**
   * Get all jobs for a user
   */
  async getJobsByUser(userId: string): Promise<BookingJob[]> {
    return prisma.bookingJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get active jobs for a user (not completed/failed/cancelled)
   */
  async getActiveJobsByUser(userId: string): Promise<BookingJob[]> {
    return prisma.bookingJob.findMany({
      where: {
        userId,
        status: {
          in: [
            JobStatus.PENDING,
            JobStatus.WATCHING,
            JobStatus.BOOKING,
            JobStatus.AWAITING_CONSENT,
            JobStatus.AWAITING_INPUT,
            JobStatus.PAUSED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get jobs that are ready for watching (PENDING and watchFromDate has passed)
   */
  async getJobsReadyForWatching(): Promise<JobWithUser[]> {
    const now = new Date();

    return prisma.bookingJob.findMany({
      where: {
        status: JobStatus.PENDING,
        watchFromDate: { lte: now },
        watchUntilDate: { gt: now },
      },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  /**
   * Get jobs currently being watched
   */
  async getWatchingJobs(): Promise<JobWithUser[]> {
    return prisma.bookingJob.findMany({
      where: {
        status: JobStatus.WATCHING,
      },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  /**
   * Get jobs that have expired (watchUntilDate has passed)
   */
  async getExpiredJobs(): Promise<BookingJob[]> {
    const now = new Date();

    return prisma.bookingJob.findMany({
      where: {
        status: {
          in: [JobStatus.PENDING, JobStatus.WATCHING],
        },
        watchUntilDate: { lt: now },
      },
    });
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId: string, status: JobStatus): Promise<BookingJob> {
    try {
      const job = await prisma.bookingJob.update({
        where: { id: jobId },
        data: { status },
      });

      logger.info('Updated job status', {
        jobId,
        status,
      });

      return job;
    } catch (error) {
      logger.error('Failed to update job status', {
        jobId,
        status,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Store booking result
   */
  async updateJobResult(
    jobId: string,
    status: JobStatus,
    result: {
      bookingId?: string;
      seats?: string[];
      theatre?: string;
      showtime?: string;
      totalAmount?: number;
      error?: string;
      screenshotPath?: string;
    }
  ): Promise<BookingJob> {
    try {
      const job = await prisma.bookingJob.update({
        where: { id: jobId },
        data: {
          status,
          bookingResult: result as Prisma.JsonObject,
        },
      });

      logger.info('Updated job result', {
        jobId,
        status,
        hasBookingId: !!result.bookingId,
        hasError: !!result.error,
      });

      return job;
    } catch (error) {
      logger.error('Failed to update job result', {
        jobId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<BookingJob> {
    return this.updateJobStatus(jobId, JobStatus.CANCELLED);
  }

  /**
   * Expire jobs that have passed their watchUntilDate
   */
  async expireOldJobs(): Promise<number> {
    const expiredJobs = await this.getExpiredJobs();

    if (expiredJobs.length === 0) {
      return 0;
    }

    await prisma.bookingJob.updateMany({
      where: {
        id: { in: expiredJobs.map(j => j.id) },
      },
      data: {
        status: JobStatus.FAILED,
        bookingResult: { error: 'Job expired - watch window ended' } as Prisma.JsonObject,
      },
    });

    logger.info('Expired old jobs', { count: expiredJobs.length });
    return expiredJobs.length;
  }

  /**
   * Get job statistics for a user
   */
  async getJobStats(userId: string): Promise<{
    total: number;
    pending: number;
    watching: number;
    success: number;
    failed: number;
  }> {
    const jobs = await this.getJobsByUser(userId);

    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === JobStatus.PENDING).length,
      watching: jobs.filter(j => j.status === JobStatus.WATCHING).length,
      success: jobs.filter(j => j.status === JobStatus.SUCCESS).length,
      failed: jobs.filter(j => j.status === JobStatus.FAILED || j.status === JobStatus.CANCELLED)
        .length,
    };
  }

  /**
   * Set job to awaiting input state with available options
   */
  async setAwaitingInput(
    jobId: string,
    mismatchType: string,
    availableOptions: object,
    screenshotPath?: string
  ): Promise<BookingJob> {
    try {
      const job = await prisma.bookingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.AWAITING_INPUT,
          awaitingInputSince: new Date(),
          mismatchType,
          availableOptions: availableOptions as Prisma.JsonObject,
          lastScreenshotPath: screenshotPath,
        },
      });

      logger.info('Job set to awaiting input', {
        jobId,
        mismatchType,
      });

      return job;
    } catch (error) {
      logger.error('Failed to set job awaiting input', {
        jobId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Resume job from awaiting input or paused state
   */
  async resumeJob(jobId: string): Promise<BookingJob> {
    try {
      const job = await prisma.bookingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.WATCHING,
          awaitingInputSince: null,
          mismatchType: null,
          availableOptions: Prisma.DbNull,
        },
      });

      logger.info('Job resumed', { jobId });
      return job;
    } catch (error) {
      logger.error('Failed to resume job', {
        jobId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Pause job after timeout
   */
  async pauseJob(jobId: string): Promise<BookingJob> {
    return this.updateJobStatus(jobId, JobStatus.PAUSED);
  }

  /**
   * Update job preferences (when user selects from available options)
   */
  async updateJobPreferences(
    jobId: string,
    newPrefs: {
      preferredFormats?: string[];
      preferredLanguages?: string[];
      preferredScreens?: string[];
      preferredTimes?: string[];
    }
  ): Promise<BookingJob> {
    try {
      const job = await prisma.bookingJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw new Error('Job not found');
      }

      const currentPrefs = job.showtimePrefs as Record<string, unknown>;
      const updatedPrefs = {
        ...currentPrefs,
        ...newPrefs,
      };

      const updated = await prisma.bookingJob.update({
        where: { id: jobId },
        data: {
          showtimePrefs: updatedPrefs as Prisma.JsonObject,
          status: JobStatus.WATCHING,
          awaitingInputSince: null,
          mismatchType: null,
          availableOptions: Prisma.DbNull,
        },
      });

      logger.info('Job preferences updated', { jobId, newPrefs });
      return updated;
    } catch (error) {
      logger.error('Failed to update job preferences', {
        jobId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Get jobs awaiting input that have timed out (15 minutes)
   */
  async getTimedOutAwaitingJobs(): Promise<JobWithUser[]> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    return prisma.bookingJob.findMany({
      where: {
        status: JobStatus.AWAITING_INPUT,
        awaitingInputSince: { lt: fifteenMinutesAgo },
      },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  /**
   * Get job with available options
   */
  async getJobWithOptions(jobId: string): Promise<(BookingJob & { parsedOptions?: object }) | null> {
    const job = await prisma.bookingJob.findUnique({
      where: { id: jobId },
    });

    if (job && job.availableOptions) {
      return {
        ...job,
        parsedOptions: job.availableOptions as object,
      };
    }

    return job;
  }
}

// Export singleton instance
export const jobService = new JobService();
