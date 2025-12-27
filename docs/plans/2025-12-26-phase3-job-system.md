# Phase 3: Job System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement BullMQ-based job system for watching ticket availability and executing bookings with Telegram notifications.

**Architecture:** Two BullMQ queues (`watch` for polling availability, `booking` for executing bookings). Watch jobs poll BMS, detect tickets, enqueue booking jobs. Booking jobs use existing `BookingFlow`, update database status, and send Telegram notifications.

**Tech Stack:** BullMQ, ioredis, Prisma (BookingJob model), grammY (notifications), existing automation/BookingFlow

---

## Task 1: Redis Connection and Queue Setup

**Files:**
- Create: `src/worker/redis.ts`
- Create: `src/worker/queues.ts`

**Step 1: Write the failing test**

```typescript
// tests/worker/queues.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Queue Setup', () => {
  it('should export watch and booking queues', async () => {
    // Mock Redis before import
    vi.mock('ioredis', () => ({
      default: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        quit: vi.fn(),
      })),
    }));

    const { watchQueue, bookingQueue } = await import('../../src/worker/queues.js');
    expect(watchQueue).toBeDefined();
    expect(bookingQueue).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn test tests/worker/queues.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Create Redis connection**

```typescript
// src/worker/redis.ts
import Redis from 'ioredis';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export function createRedisConnection(name: string): Redis {
  const connection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on('error', (err) => {
    logger.error(`Redis ${name} connection error`, { error: String(err) });
  });

  connection.on('connect', () => {
    logger.info(`Redis ${name} connected`);
  });

  return connection;
}
```

**Step 4: Create queue definitions**

```typescript
// src/worker/queues.ts
import { Queue } from 'bullmq';
import { createRedisConnection } from './redis.js';

const connection = createRedisConnection('queues');

export const watchQueue = new Queue('watch', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const bookingQueue = new Queue('booking', {
  connection,
  defaultJobOptions: {
    attempts: 1, // Single attempt per booking job
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});
```

**Step 5: Run test to verify it passes**

Run: `yarn test tests/worker/queues.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/worker/redis.ts src/worker/queues.ts tests/worker/queues.test.ts
git commit -m "feat: add BullMQ queue setup with Redis connection"
```

---

## Task 2: Notification Service

**Files:**
- Create: `src/services/notificationService.ts`
- Test: `tests/services/notificationService.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/services/notificationService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMessage = vi.fn();
vi.mock('../src/bot/index.js', () => ({
  bot: {
    api: {
      sendMessage: mockSendMessage,
      sendPhoto: vi.fn(),
    },
  },
}));

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send watching started notification', async () => {
    const { notificationService } = await import('../../src/services/notificationService.js');
    await notificationService.sendWatchingStarted('123456', 'Pushpa 2');

    expect(mockSendMessage).toHaveBeenCalledWith(
      '123456',
      expect.stringContaining('Pushpa 2')
    );
  });

  it('should send booking success notification', async () => {
    const { notificationService } = await import('../../src/services/notificationService.js');
    await notificationService.sendBookingSuccess('123456', {
      movieName: 'Pushpa 2',
      theatre: 'PVR',
      showtime: '7:00 PM',
      seats: ['H11', 'H12'],
      bookingId: 'BMS123',
      amountPaid: 500,
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      '123456',
      expect.stringContaining('BOOKED'),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn test tests/services/notificationService.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement notification service**

```typescript
// src/services/notificationService.ts
import { bot } from '../bot/index.js';
import { logger } from '../utils/logger.js';
import { InputFile } from 'grammy';
import * as fs from 'fs';

export interface BookingSuccessData {
  movieName: string;
  theatre: string;
  showtime: string;
  seats: string[];
  bookingId: string;
  amountPaid: number;
  screenshotPath?: string;
}

export interface ConsentRequestData {
  jobId: string;
  movieName: string;
  seats: string[];
  score: number;
}

export const notificationService = {
  async sendWatchingStarted(telegramId: string, movieName: string): Promise<void> {
    try {
      await bot.api.sendMessage(
        telegramId,
        `🔍 Started watching for *${movieName}* tickets...\n\nI'll notify you when tickets become available!`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Failed to send watching started notification', {
        telegramId,
        error: String(error),
      });
    }
  },

  async sendTicketsDetected(telegramId: string, movieName: string): Promise<void> {
    try {
      await bot.api.sendMessage(
        telegramId,
        `🎟️ Tickets detected for *${movieName}*!\n\nAttempting to book...`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Failed to send tickets detected notification', {
        telegramId,
        error: String(error),
      });
    }
  },

  async sendBookingSuccess(
    telegramId: string,
    data: BookingSuccessData
  ): Promise<void> {
    try {
      const message = `✅ *BOOKED!*

🎬 *${data.movieName}*
🏢 ${data.theatre}
🕐 ${data.showtime}
💺 Seats: ${data.seats.join(', ')}
💳 Paid: ₹${data.amountPaid}
🎫 Booking ID: \`${data.bookingId}\`

Tickets will be sent to your registered email/phone.`;

      await bot.api.sendMessage(telegramId, message, { parse_mode: 'Markdown' });

      // Send screenshot if available
      if (data.screenshotPath && fs.existsSync(data.screenshotPath)) {
        await bot.api.sendPhoto(telegramId, new InputFile(data.screenshotPath));
      }
    } catch (error) {
      logger.error('Failed to send booking success notification', {
        telegramId,
        error: String(error),
      });
    }
  },

  async sendBookingFailed(
    telegramId: string,
    movieName: string,
    reason: string
  ): Promise<void> {
    try {
      await bot.api.sendMessage(
        telegramId,
        `❌ Booking failed for *${movieName}*\n\nReason: ${reason}\n\nPlease try creating a new job or book manually.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Failed to send booking failed notification', {
        telegramId,
        error: String(error),
      });
    }
  },

  async sendConsentRequest(
    telegramId: string,
    data: ConsentRequestData
  ): Promise<void> {
    try {
      const scorePercent = Math.round(data.score * 100);
      await bot.api.sendMessage(
        telegramId,
        `⚠️ *Suboptimal seats available for ${data.movieName}*

Seats: ${data.seats.join(', ')}
Quality Score: ${scorePercent}% (below 40% threshold)

These seats may be in the front rows or corner positions.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Book Anyway', callback_data: `consent_yes_${data.jobId}` },
                { text: '🔄 Keep Watching', callback_data: `consent_no_${data.jobId}` },
              ],
              [{ text: '❌ Cancel Job', callback_data: `consent_cancel_${data.jobId}` }],
            ],
          },
        }
      );
    } catch (error) {
      logger.error('Failed to send consent request', {
        telegramId,
        error: String(error),
      });
    }
  },
};
```

**Step 4: Run test to verify it passes**

Run: `yarn test tests/services/notificationService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/notificationService.ts tests/services/notificationService.test.ts
git commit -m "feat: add notification service for Telegram alerts"
```

---

## Task 3: Job Service - Database Operations

**Files:**
- Create: `src/services/jobService.ts`
- Test: `tests/services/jobService.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/services/jobService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  bookingJob: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('../src/db/client.js', () => ({
  prisma: mockPrisma,
}));

describe('JobService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should get job by id', async () => {
    const mockJob = { id: 'job1', status: 'PENDING', movieName: 'Test Movie' };
    mockPrisma.bookingJob.findUnique.mockResolvedValue(mockJob);

    const { jobService } = await import('../../src/services/jobService.js');
    const result = await jobService.getJobById('job1');

    expect(result).toEqual(mockJob);
    expect(mockPrisma.bookingJob.findUnique).toHaveBeenCalledWith({
      where: { id: 'job1' },
      include: { user: true },
    });
  });

  it('should update job status', async () => {
    const mockJob = { id: 'job1', status: 'WATCHING' };
    mockPrisma.bookingJob.update.mockResolvedValue(mockJob);

    const { jobService } = await import('../../src/services/jobService.js');
    const result = await jobService.updateJobStatus('job1', 'WATCHING');

    expect(result.status).toBe('WATCHING');
    expect(mockPrisma.bookingJob.update).toHaveBeenCalledWith({
      where: { id: 'job1' },
      data: { status: 'WATCHING' },
    });
  });

  it('should get pending jobs ready to watch', async () => {
    const mockJobs = [{ id: 'job1', status: 'PENDING' }];
    mockPrisma.bookingJob.findMany.mockResolvedValue(mockJobs);

    const { jobService } = await import('../../src/services/jobService.js');
    const result = await jobService.getPendingJobsReadyToWatch();

    expect(result).toEqual(mockJobs);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn test tests/services/jobService.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement job service**

```typescript
// src/services/jobService.ts
import { prisma } from '../db/client.js';
import { JobStatus, BookingJob, User } from '@prisma/client';
import { logger } from '../utils/logger.js';

export interface JobWithUser extends BookingJob {
  user: User;
}

export interface BookingResultData {
  confirmationId: string;
  theatre: string;
  showtime: string;
  seats: string[];
  amountPaid: number;
  screenshotPath?: string;
}

export const jobService = {
  async getJobById(jobId: string): Promise<JobWithUser | null> {
    return prisma.bookingJob.findUnique({
      where: { id: jobId },
      include: { user: true },
    });
  },

  async updateJobStatus(
    jobId: string,
    status: JobStatus
  ): Promise<BookingJob> {
    logger.info('Updating job status', { jobId, status });
    return prisma.bookingJob.update({
      where: { id: jobId },
      data: { status },
    });
  },

  async setBookingResult(
    jobId: string,
    result: BookingResultData
  ): Promise<BookingJob> {
    logger.info('Setting booking result', { jobId, bookingId: result.confirmationId });
    return prisma.bookingJob.update({
      where: { id: jobId },
      data: {
        status: 'SUCCESS',
        bookingResult: result,
      },
    });
  },

  async setJobFailed(jobId: string, error: string): Promise<BookingJob> {
    logger.error('Setting job as failed', { jobId, error });
    return prisma.bookingJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        bookingResult: { error, failedAt: new Date().toISOString() },
      },
    });
  },

  async getPendingJobsReadyToWatch(): Promise<JobWithUser[]> {
    const now = new Date();
    return prisma.bookingJob.findMany({
      where: {
        status: 'PENDING',
        watchFromDate: { lte: now },
        watchUntilDate: { gt: now },
      },
      include: { user: true },
    });
  },

  async getWatchingJobs(): Promise<JobWithUser[]> {
    const now = new Date();
    return prisma.bookingJob.findMany({
      where: {
        status: 'WATCHING',
        watchUntilDate: { gt: now },
      },
      include: { user: true },
    });
  },

  async getExpiredWatchingJobs(): Promise<BookingJob[]> {
    const now = new Date();
    return prisma.bookingJob.findMany({
      where: {
        status: 'WATCHING',
        watchUntilDate: { lte: now },
      },
    });
  },

  async cancelExpiredJobs(): Promise<number> {
    const expired = await this.getExpiredWatchingJobs();

    for (const job of expired) {
      await prisma.bookingJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          bookingResult: { error: 'Watch period expired', expiredAt: new Date().toISOString() },
        },
      });
    }

    if (expired.length > 0) {
      logger.info('Cancelled expired jobs', { count: expired.length });
    }

    return expired.length;
  },
};
```

**Step 4: Run test to verify it passes**

Run: `yarn test tests/services/jobService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/jobService.ts tests/services/jobService.test.ts
git commit -m "feat: add job service for database operations"
```

---

## Task 4: Watch Job Processor

**Files:**
- Create: `src/worker/jobs/watchJob.ts`
- Test: `tests/worker/watchJob.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/worker/watchJob.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/jobService.js', () => ({
  jobService: {
    getJobById: vi.fn(),
    updateJobStatus: vi.fn(),
  },
}));

vi.mock('../../src/services/notificationService.js', () => ({
  notificationService: {
    sendTicketsDetected: vi.fn(),
    sendBookingFailed: vi.fn(),
  },
}));

vi.mock('../../src/worker/queues.js', () => ({
  bookingQueue: {
    add: vi.fn(),
  },
}));

describe('WatchJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export processWatchJob function', async () => {
    const { processWatchJob } = await import('../../src/worker/jobs/watchJob.js');
    expect(typeof processWatchJob).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn test tests/worker/watchJob.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement watch job processor**

```typescript
// src/worker/jobs/watchJob.ts
import { Job } from 'bullmq';
import { Browser, Page } from 'playwright';
import { launchBrowser, createContext, createPage } from '../../automation/browser.js';
import { HomePage } from '../../automation/pages/HomePage.js';
import { ShowtimesPage } from '../../automation/pages/ShowtimesPage.js';
import { jobService } from '../../services/jobService.js';
import { notificationService } from '../../services/notificationService.js';
import { bookingQueue } from '../queues.js';
import { logger } from '../../utils/logger.js';

export interface WatchJobData {
  jobId: string;
}

export interface WatchJobResult {
  ticketsAvailable: boolean;
  enqueuedBooking: boolean;
}

export async function processWatchJob(
  job: Job<WatchJobData>
): Promise<WatchJobResult> {
  const { jobId } = job.data;
  logger.info('Processing watch job', { jobId, attempt: job.attemptsMade + 1 });

  const bookingJob = await jobService.getJobById(jobId);
  if (!bookingJob) {
    logger.warn('Watch job not found', { jobId });
    return { ticketsAvailable: false, enqueuedBooking: false };
  }

  // Check if job is still in watching state
  if (bookingJob.status !== 'WATCHING') {
    logger.info('Job no longer in watching state', { jobId, status: bookingJob.status });
    return { ticketsAvailable: false, enqueuedBooking: false };
  }

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await launchBrowser({ headless: true });
    const context = await createContext(browser);
    page = await createPage(context);

    // Navigate to movie
    const homePage = new HomePage(page);
    await homePage.navigate(bookingJob.city);
    await homePage.searchMovie(bookingJob.movieName);

    const movieFound = await homePage.selectMovieFromSearch(bookingJob.movieName);
    if (!movieFound) {
      logger.info('Movie not found on BMS', { jobId, movie: bookingJob.movieName });
      return { ticketsAvailable: false, enqueuedBooking: false };
    }

    // Check for showtimes
    const showtimesPage = new ShowtimesPage(page);
    const hasShowtimes = await showtimesPage.waitForShowtimes();

    if (!hasShowtimes) {
      logger.info('No showtimes available yet', { jobId, movie: bookingJob.movieName });
      return { ticketsAvailable: false, enqueuedBooking: false };
    }

    // Check if any preferred theatre has shows
    const theatres = await showtimesPage.getTheatres();
    const preferredTheatres = bookingJob.theatres;

    const hasPreferredTheatre = preferredTheatres.some(preferred =>
      theatres.some(t => t.toLowerCase().includes(preferred.toLowerCase()))
    );

    if (!hasPreferredTheatre && theatres.length === 0) {
      logger.info('No theatres available', { jobId });
      return { ticketsAvailable: false, enqueuedBooking: false };
    }

    // Tickets are available - enqueue booking job
    logger.info('Tickets detected, enqueueing booking job', { jobId });

    await jobService.updateJobStatus(jobId, 'BOOKING');
    await notificationService.sendTicketsDetected(
      bookingJob.user.telegramId,
      bookingJob.movieName
    );

    await bookingQueue.add('booking', { jobId }, {
      jobId: `booking-${jobId}`,
      removeOnComplete: true,
    });

    return { ticketsAvailable: true, enqueuedBooking: true };
  } catch (error) {
    logger.error('Watch job failed', { jobId, error: String(error) });
    throw error; // Let BullMQ retry
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
```

**Step 4: Run test to verify it passes**

Run: `yarn test tests/worker/watchJob.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/jobs/watchJob.ts tests/worker/watchJob.test.ts
git commit -m "feat: add watch job processor to detect ticket availability"
```

---

## Task 5: Booking Job Processor

**Files:**
- Create: `src/worker/jobs/bookingJob.ts`
- Test: `tests/worker/bookingJob.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/worker/bookingJob.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/jobService.js', () => ({
  jobService: {
    getJobById: vi.fn(),
    setBookingResult: vi.fn(),
    setJobFailed: vi.fn(),
  },
}));

vi.mock('../../src/services/notificationService.js', () => ({
  notificationService: {
    sendBookingSuccess: vi.fn(),
    sendBookingFailed: vi.fn(),
  },
}));

vi.mock('../../src/services/giftCardService.js', () => ({
  giftCardService: {
    getActiveCards: vi.fn().mockResolvedValue([]),
    getDecryptedCard: vi.fn(),
  },
}));

describe('BookingJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export processBookingJob function', async () => {
    const { processBookingJob } = await import('../../src/worker/jobs/bookingJob.js');
    expect(typeof processBookingJob).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn test tests/worker/bookingJob.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement booking job processor**

```typescript
// src/worker/jobs/bookingJob.ts
import { Job } from 'bullmq';
import { BookingFlow, BookingConfig } from '../../automation/bookingFlow.js';
import { jobService } from '../../services/jobService.js';
import { notificationService } from '../../services/notificationService.js';
import { giftCardService } from '../../services/giftCardService.js';
import { logger } from '../../utils/logger.js';
import { SeatPrefs } from '../../automation/seatSelector.js';

export interface BookingJobData {
  jobId: string;
}

export interface BookingJobResult {
  success: boolean;
  bookingId?: string;
  error?: string;
}

interface ShowtimePrefs {
  dates: string[];
  timeRanges: string[];
}

export async function processBookingJob(
  job: Job<BookingJobData>
): Promise<BookingJobResult> {
  const { jobId } = job.data;
  logger.info('Processing booking job', { jobId });

  const bookingJob = await jobService.getJobById(jobId);
  if (!bookingJob) {
    logger.warn('Booking job not found', { jobId });
    return { success: false, error: 'Job not found' };
  }

  // Check if job is still in booking state
  if (bookingJob.status !== 'BOOKING') {
    logger.info('Job not in booking state', { jobId, status: bookingJob.status });
    return { success: false, error: 'Job not in booking state' };
  }

  const flow = new BookingFlow();

  try {
    await flow.initialize(true); // headless

    // Get user's gift cards
    const giftCards = await giftCardService.getActiveCards(bookingJob.userId);
    const decryptedCards = await Promise.all(
      giftCards.map(card => giftCardService.getDecryptedCard(card.id, bookingJob.userId))
    );
    const validCards = decryptedCards
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map(c => ({ cardNumber: c.cardNumber, pin: c.pin }));

    // Build booking config from job
    const showtimePrefs = bookingJob.showtimePrefs as ShowtimePrefs;
    const seatPrefs = bookingJob.seatPrefs as SeatPrefs;

    const config: BookingConfig = {
      movieName: bookingJob.movieName,
      city: bookingJob.city,
      theatres: bookingJob.theatres,
      preferredTimes: showtimePrefs.timeRanges || [],
      seatPrefs,
      userEmail: bookingJob.user.email || '',
      userPhone: bookingJob.user.phone || '',
      giftCards: validCards,
    };

    // Attempt booking
    const result = await flow.attemptBooking(config);

    if (result.success && result.bookingResult) {
      // Save success
      await jobService.setBookingResult(jobId, {
        confirmationId: result.bookingResult.bookingId || 'unknown',
        theatre: result.bookingResult.theatre || 'unknown',
        showtime: result.bookingResult.showtime || 'unknown',
        seats: result.bookingResult.seats || [],
        amountPaid: result.bookingResult.amountPaid || 0,
        screenshotPath: result.screenshotPath,
      });

      // Notify user
      await notificationService.sendBookingSuccess(bookingJob.user.telegramId, {
        movieName: bookingJob.movieName,
        theatre: result.bookingResult.theatre || 'Unknown Theatre',
        showtime: result.bookingResult.showtime || 'Unknown Time',
        seats: result.bookingResult.seats || [],
        bookingId: result.bookingResult.bookingId || 'Unknown',
        amountPaid: result.bookingResult.amountPaid || 0,
        screenshotPath: result.screenshotPath,
      });

      logger.info('Booking successful', {
        jobId,
        bookingId: result.bookingResult.bookingId,
      });

      return {
        success: true,
        bookingId: result.bookingResult.bookingId,
      };
    } else {
      // Booking failed
      const errorMsg = result.error || 'Unknown error';
      await jobService.setJobFailed(jobId, errorMsg);
      await notificationService.sendBookingFailed(
        bookingJob.user.telegramId,
        bookingJob.movieName,
        errorMsg
      );

      logger.error('Booking failed', { jobId, error: errorMsg });

      return { success: false, error: errorMsg };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Booking job threw error', { jobId, error: errorMsg });

    await jobService.setJobFailed(jobId, errorMsg);
    await notificationService.sendBookingFailed(
      bookingJob.user.telegramId,
      bookingJob.movieName,
      errorMsg
    );

    return { success: false, error: errorMsg };
  } finally {
    await flow.cleanup();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `yarn test tests/worker/bookingJob.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/jobs/bookingJob.ts tests/worker/bookingJob.test.ts
git commit -m "feat: add booking job processor to execute full booking flow"
```

---

## Task 6: Worker Entry Point

**Files:**
- Create: `src/worker/index.ts`
- Test: `tests/worker/index.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/worker/index.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
  })),
}));

vi.mock('../../src/worker/redis.js', () => ({
  createRedisConnection: vi.fn().mockReturnValue({
    on: vi.fn(),
    quit: vi.fn(),
  }),
}));

describe('Worker Entry', () => {
  it('should export startWorker and stopWorker functions', async () => {
    const { startWorker, stopWorker } = await import('../../src/worker/index.js');
    expect(typeof startWorker).toBe('function');
    expect(typeof stopWorker).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn test tests/worker/index.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement worker entry point**

```typescript
// src/worker/index.ts
import { Worker, Job } from 'bullmq';
import { createRedisConnection } from './redis.js';
import { processWatchJob, WatchJobData, WatchJobResult } from './jobs/watchJob.js';
import { processBookingJob, BookingJobData, BookingJobResult } from './jobs/bookingJob.js';
import { logger } from '../utils/logger.js';

let watchWorker: Worker<WatchJobData, WatchJobResult> | null = null;
let bookingWorker: Worker<BookingJobData, BookingJobResult> | null = null;

export async function startWorker(): Promise<void> {
  const connection = createRedisConnection('worker');

  // Watch worker - processes watch jobs
  watchWorker = new Worker<WatchJobData, WatchJobResult>(
    'watch',
    async (job: Job<WatchJobData>) => processWatchJob(job),
    {
      connection,
      concurrency: 2, // Process 2 watch jobs at a time
    }
  );

  watchWorker.on('completed', (job, result) => {
    logger.info('Watch job completed', {
      jobId: job.data.jobId,
      ticketsAvailable: result.ticketsAvailable,
    });
  });

  watchWorker.on('failed', (job, error) => {
    logger.error('Watch job failed', {
      jobId: job?.data.jobId,
      error: error.message,
    });
  });

  // Booking worker - processes booking jobs
  bookingWorker = new Worker<BookingJobData, BookingJobResult>(
    'booking',
    async (job: Job<BookingJobData>) => processBookingJob(job),
    {
      connection,
      concurrency: 1, // Only one booking at a time to avoid conflicts
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

  logger.info('Workers started');
}

export async function stopWorker(): Promise<void> {
  if (watchWorker) {
    await watchWorker.close();
    watchWorker = null;
  }

  if (bookingWorker) {
    await bookingWorker.close();
    bookingWorker = null;
  }

  logger.info('Workers stopped');
}
```

**Step 4: Run test to verify it passes**

Run: `yarn test tests/worker/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/index.ts tests/worker/index.test.ts
git commit -m "feat: add worker entry point with watch and booking workers"
```

---

## Task 7: Job Scheduler (Cron-like Polling)

**Files:**
- Create: `src/worker/scheduler.ts`
- Test: `tests/worker/scheduler.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/worker/scheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/services/jobService.js', () => ({
  jobService: {
    getPendingJobsReadyToWatch: vi.fn().mockResolvedValue([]),
    getWatchingJobs: vi.fn().mockResolvedValue([]),
    updateJobStatus: vi.fn(),
    cancelExpiredJobs: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../src/worker/queues.js', () => ({
  watchQueue: {
    add: vi.fn(),
  },
}));

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should export startScheduler and stopScheduler functions', async () => {
    const { startScheduler, stopScheduler } = await import('../../src/worker/scheduler.js');
    expect(typeof startScheduler).toBe('function');
    expect(typeof stopScheduler).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn test tests/worker/scheduler.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement scheduler**

```typescript
// src/worker/scheduler.ts
import { jobService } from '../services/jobService.js';
import { notificationService } from '../services/notificationService.js';
import { watchQueue } from './queues.js';
import { logger } from '../utils/logger.js';

const POLL_INTERVAL_MS = 30000; // Check every 30 seconds
const WATCH_REPEAT_MS = 60000; // Watch jobs repeat every 60 seconds

let schedulerInterval: NodeJS.Timeout | null = null;

export async function startScheduler(): Promise<void> {
  logger.info('Starting job scheduler');

  // Initial run
  await runSchedulerCycle();

  // Set up interval
  schedulerInterval = setInterval(runSchedulerCycle, POLL_INTERVAL_MS);
}

export async function stopScheduler(): Promise<void> {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  logger.info('Job scheduler stopped');
}

async function runSchedulerCycle(): Promise<void> {
  try {
    // 1. Handle expired jobs
    await jobService.cancelExpiredJobs();

    // 2. Transition pending jobs to watching
    const pendingJobs = await jobService.getPendingJobsReadyToWatch();

    for (const job of pendingJobs) {
      logger.info('Transitioning job to watching', { jobId: job.id });

      await jobService.updateJobStatus(job.id, 'WATCHING');
      await notificationService.sendWatchingStarted(
        job.user.telegramId,
        job.movieName
      );

      // Enqueue first watch job
      await enqueueWatchJob(job.id);
    }

    // 3. Re-enqueue watch jobs for watching jobs (repeat polling)
    const watchingJobs = await jobService.getWatchingJobs();

    for (const job of watchingJobs) {
      await enqueueWatchJob(job.id);
    }

    if (pendingJobs.length > 0 || watchingJobs.length > 0) {
      logger.debug('Scheduler cycle complete', {
        newlyWatching: pendingJobs.length,
        continuedWatching: watchingJobs.length,
      });
    }
  } catch (error) {
    logger.error('Scheduler cycle failed', { error: String(error) });
  }
}

async function enqueueWatchJob(jobId: string): Promise<void> {
  const jobKey = `watch-${jobId}`;

  await watchQueue.add(
    'watch',
    { jobId },
    {
      jobId: jobKey,
      delay: 0,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}

export { runSchedulerCycle }; // Export for testing
```

**Step 4: Run test to verify it passes**

Run: `yarn test tests/worker/scheduler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/scheduler.ts tests/worker/scheduler.test.ts
git commit -m "feat: add job scheduler for polling and state transitions"
```

---

## Task 8: Update Main Entry Point

**Files:**
- Modify: `src/index.ts`

**Step 1: Read current file**

Current file already imports and starts bot.

**Step 2: Update to include worker and scheduler**

```typescript
// src/index.ts
import 'dotenv/config';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './db/client.js';
import { startBot, stopBot } from './bot/index.js';
import { startWorker, stopWorker } from './worker/index.js';
import { startScheduler, stopScheduler } from './worker/scheduler.js';

async function main(): Promise<void> {
  logger.info('Starting BMS Bot...', { nodeEnv: config.nodeEnv });

  // Connect to database
  await connectDatabase();
  logger.info('Database connected');

  // Start workers
  await startWorker();
  logger.info('Workers started');

  // Start scheduler
  await startScheduler();
  logger.info('Scheduler started');

  // Start Telegram bot
  await startBot();

  logger.info('BMS Bot is running!');
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down...');

  await stopScheduler();
  await stopWorker();
  await stopBot();
  await disconnectDatabase();

  logger.info('Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

// Start the application
main().catch((error) => {
  logger.error('Failed to start', { error });
  process.exit(1);
});
```

**Step 3: Run the application to verify**

Run: `yarn dev`
Expected: Should start without errors, show "Workers started" and "Scheduler started" logs

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: integrate worker and scheduler into main entry point"
```

---

## Task 9: Add Worker Exports

**Files:**
- Create: `src/worker/jobs/index.ts`

**Step 1: Create exports file**

```typescript
// src/worker/jobs/index.ts
export { processWatchJob, WatchJobData, WatchJobResult } from './watchJob.js';
export { processBookingJob, BookingJobData, BookingJobResult } from './bookingJob.js';
```

**Step 2: Verify all imports work**

Run: `yarn typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/worker/jobs/index.ts
git commit -m "feat: add worker job exports"
```

---

## Task 10: Integration Test - Full Watch to Booking Flow

**Files:**
- Create: `tests/integration/jobFlow.test.ts`

**Step 1: Write integration test**

```typescript
// tests/integration/jobFlow.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('../../src/automation/browser.js');
vi.mock('../../src/bot/index.js', () => ({
  bot: {
    api: {
      sendMessage: vi.fn(),
      sendPhoto: vi.fn(),
    },
  },
}));

describe('Job Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have all required job flow components', async () => {
    // Verify all modules can be imported
    const { watchQueue, bookingQueue } = await import('../../src/worker/queues.js');
    const { processWatchJob } = await import('../../src/worker/jobs/watchJob.js');
    const { processBookingJob } = await import('../../src/worker/jobs/bookingJob.js');
    const { jobService } = await import('../../src/services/jobService.js');
    const { notificationService } = await import('../../src/services/notificationService.js');

    expect(watchQueue).toBeDefined();
    expect(bookingQueue).toBeDefined();
    expect(processWatchJob).toBeDefined();
    expect(processBookingJob).toBeDefined();
    expect(jobService).toBeDefined();
    expect(notificationService).toBeDefined();
  });

  it('should have correct job status flow types', async () => {
    // Import Prisma types
    const { JobStatus } = await import('@prisma/client');

    expect(JobStatus.PENDING).toBe('PENDING');
    expect(JobStatus.WATCHING).toBe('WATCHING');
    expect(JobStatus.BOOKING).toBe('BOOKING');
    expect(JobStatus.SUCCESS).toBe('SUCCESS');
    expect(JobStatus.FAILED).toBe('FAILED');
  });
});
```

**Step 2: Run integration test**

Run: `yarn test tests/integration/jobFlow.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/jobFlow.test.ts
git commit -m "test: add job flow integration test"
```

---

## Task 11: Run All Tests and Verify

**Step 1: Run full test suite**

Run: `yarn test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `yarn typecheck`
Expected: No type errors

**Step 3: Test dev server starts**

Run: `yarn dev`
Expected:
- "Database connected"
- "Workers started"
- "Scheduler started"
- "BMS Bot is running!"
- "Bot started as @..."

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 3 job system implementation"
```

---

## Summary

Phase 3 implements the job system with:

1. **Redis/BullMQ Setup** - Two queues (watch, booking) with proper error handling
2. **Notification Service** - Telegram alerts for all job states
3. **Job Service** - Database operations for job lifecycle
4. **Watch Job** - Polls BMS for ticket availability, enqueues booking on detection
5. **Booking Job** - Executes full booking flow using existing BookingFlow
6. **Worker Entry** - BullMQ workers with concurrency limits
7. **Scheduler** - Cron-like polling to transition jobs and re-enqueue watches
8. **Main Integration** - Worker and scheduler integrated into app startup

Job lifecycle: `PENDING → WATCHING → BOOKING → SUCCESS/FAILED`
