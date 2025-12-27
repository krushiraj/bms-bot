// Redis and Queue setup
export { createRedisConnection, testRedisConnection, closeRedisConnections } from './redis.js';
export { watchQueue, bookingQueue } from './queues.js';

// Services
export { jobService, CreateJobInput, JobWithUser } from './jobService.js';
export { notificationService, NotificationPayload, NotificationType } from './notificationService.js';

// Processors
export { processWatchJob, WatchJobData, WatchResult } from './processors/watchProcessor.js';
export { processBookingJob, BookingJobData, BookingProcessResult } from './processors/bookingProcessor.js';

// Workers
export { startWorkers, stopWorkers, startWatchWorker, startBookingWorker } from './worker.js';

// Scheduler
export { startScheduler, stopScheduler, isSchedulerRunning } from './scheduler.js';
