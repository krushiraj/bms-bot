import { jobService } from './jobService.js';
import { watchQueue } from './queues.js';
import { logger } from '../utils/logger.js';

const POLL_INTERVAL = 60000; // 1 minute
const WATCH_JOB_INTERVAL = 5 * 60000; // 5 minutes between watch attempts per job

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// Track when each job was last added to queue
const lastQueuedAt = new Map<string, number>();

/**
 * Add jobs ready for watching to the queue
 */
async function enqueueReadyJobs(): Promise<void> {
  try {
    // Get jobs ready to start watching
    const readyJobs = await jobService.getJobsReadyForWatching();

    for (const job of readyJobs) {
      const lastQueued = lastQueuedAt.get(job.id) || 0;
      const now = Date.now();

      // Skip if recently queued
      if (now - lastQueued < WATCH_JOB_INTERVAL) {
        continue;
      }

      // Add to watch queue
      await watchQueue.add(
        `watch-${job.id}`,
        { jobId: job.id },
        {
          jobId: `watch-${job.id}-${now}`,
          delay: 0,
        }
      );

      lastQueuedAt.set(job.id, now);

      logger.info('Enqueued job for watching', {
        jobId: job.id,
        movieName: job.movieName,
      });
    }

    // Also check currently watching jobs (re-add them for periodic checks)
    const watchingJobs = await jobService.getWatchingJobs();

    for (const job of watchingJobs) {
      const lastQueued = lastQueuedAt.get(job.id) || 0;
      const now = Date.now();

      if (now - lastQueued < WATCH_JOB_INTERVAL) {
        continue;
      }

      await watchQueue.add(
        `watch-${job.id}`,
        { jobId: job.id },
        {
          jobId: `watch-${job.id}-${now}`,
          delay: 0,
        }
      );

      lastQueuedAt.set(job.id, now);

      logger.debug('Re-enqueued watching job', { jobId: job.id });
    }
  } catch (error) {
    logger.error('Failed to enqueue ready jobs', { error: String(error) });
  }
}

/**
 * Expire jobs that have passed their watch deadline
 */
async function expireOldJobs(): Promise<void> {
  try {
    const expiredCount = await jobService.expireOldJobs();
    if (expiredCount > 0) {
      logger.info('Expired old jobs', { count: expiredCount });
    }
  } catch (error) {
    logger.error('Failed to expire old jobs', { error: String(error) });
  }
}

/**
 * Clean up stale queue tracking entries
 */
function cleanupQueueTracking(): void {
  const now = Date.now();
  const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours

  for (const [jobId, timestamp] of lastQueuedAt.entries()) {
    if (now - timestamp > staleThreshold) {
      lastQueuedAt.delete(jobId);
    }
  }
}

/**
 * Main scheduler tick
 */
async function schedulerTick(): Promise<void> {
  if (!isRunning) return;

  try {
    logger.debug('Scheduler tick');

    // Expire old jobs first
    await expireOldJobs();

    // Enqueue ready jobs
    await enqueueReadyJobs();

    // Cleanup stale tracking
    cleanupQueueTracking();
  } catch (error) {
    logger.error('Scheduler tick failed', { error: String(error) });
  }
}

/**
 * Start the job scheduler
 */
export function startScheduler(): void {
  if (isRunning) {
    logger.warn('Scheduler already running');
    return;
  }

  isRunning = true;

  // Run immediately
  schedulerTick().catch(console.error);

  // Then run periodically
  schedulerInterval = setInterval(() => {
    schedulerTick().catch(console.error);
  }, POLL_INTERVAL);

  logger.info('Job scheduler started', { pollInterval: POLL_INTERVAL });
}

/**
 * Stop the job scheduler
 */
export function stopScheduler(): void {
  if (!isRunning) return;

  isRunning = false;

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  lastQueuedAt.clear();

  logger.info('Job scheduler stopped');
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return isRunning;
}
