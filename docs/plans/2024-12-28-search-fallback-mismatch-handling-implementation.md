# Search Fallback & Preference Mismatch Handling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add robust search fallback for cities/theatres and interactive preference mismatch handling with user notifications and response options.

**Architecture:** Extend job states to include AWAITING_INPUT and PAUSED. Add mismatch detection in watchProcessor, scrape available options, notify user with screenshot and inline buttons. Scheduler checks for 15-minute timeouts.

**Tech Stack:** TypeScript, Prisma, Grammy (Telegram), Playwright, BullMQ

---

### Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add new fields and update JobStatus enum**

```prisma
enum JobStatus {
  PENDING
  WATCHING
  BOOKING
  AWAITING_CONSENT
  AWAITING_INPUT    // NEW - waiting for user response to mismatch
  PAUSED            // NEW - user didn't respond in 15 minutes
  SUCCESS
  FAILED
  CANCELLED
}

model BookingJob {
  // ... existing fields ...

  // Mismatch handling fields (add after bookingResult)
  awaitingInputSince  DateTime?        // When mismatch was detected
  availableOptions    Json?            // Scraped available showtimes
  mismatchType        String?          // format|language|screen|time|theatre
  lastScreenshotPath  String?          // Path to latest screenshot

  // ... rest of model ...
}
```

**Step 2: Generate Prisma client**

Run: `npx prisma generate`
Expected: Prisma client regenerated successfully

**Step 3: Create migration**

Run: `npx prisma migrate dev --name add_mismatch_handling_fields`
Expected: Migration created and applied

**Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add mismatch handling fields to schema"
```

---

### Task 2: Add City Fuzzy Matching

**Files:**
- Modify: `src/automation/pages/HomePage.ts`

**Step 1: Add city aliases map at top of file**

Add after the imports, before the class:

```typescript
// Common city name aliases and misspellings
const CITY_ALIASES: Record<string, string> = {
  'bangalore': 'bengaluru',
  'banglore': 'bengaluru',
  'bangaluru': 'bengaluru',
  'bombay': 'mumbai',
  'madras': 'chennai',
  'calcutta': 'kolkata',
  'kolkatta': 'kolkata',
  'hydrabad': 'hyderabad',
  'hyderbad': 'hyderabad',
  'hydra': 'hyderabad',
  'gurgaon': 'gurugram',
  'pondicherry': 'puducherry',
  'trivandrum': 'thiruvananthapuram',
  'cochin': 'kochi',
  'poona': 'pune',
  'delhi': 'delhi-ncr',
  'new delhi': 'delhi-ncr',
  'noida': 'delhi-ncr',
  'ghaziabad': 'delhi-ncr',
};

function normalizeCity(city: string): string {
  const normalized = city.toLowerCase().trim().replace(/[^a-z\s-]/g, '');
  return CITY_ALIASES[normalized] || normalized;
}
```

**Step 2: Update navigate method to use normalizeCity**

Replace the navigate method:

```typescript
async navigate(city = 'hyderabad'): Promise<void> {
  try {
    const normalizedCity = normalizeCity(city);
    const url = `${this.baseUrl}/explore/home/${normalizedCity}`;
    logger.info('Navigating to BMS', { url, originalCity: city, normalizedCity });
    await this.page.goto(url, { timeout: 30000 });
    await this.waitForLoad();
    // Extra wait for dynamic content
    await this.page.waitForTimeout(2000);
  } catch (error) {
    logger.error('Failed to navigate to home page', { city, error });
    throw error;
  }
}
```

**Step 3: Build and verify**

Run: `yarn build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/automation/pages/HomePage.ts
git commit -m "feat: add city fuzzy matching"
```

---

### Task 3: Add Theatre Search with Filter and Scroll

**Files:**
- Modify: `src/automation/pages/ShowtimesPage.ts`

**Step 1: Add theatre search helper methods**

Add these methods to the ShowtimesPage class:

```typescript
/**
 * Check if a theatre is visible in the current viewport
 */
private async isTheatreVisible(theatreName: string): Promise<boolean> {
  const theatreRow = this.page.locator('.ReactVirtualized__Grid').locator(`text=${theatreName}`).first();
  return theatreRow.isVisible().catch(() => false);
}

/**
 * Try to filter theatres using the search/filter input
 */
private async filterTheatres(theatreName: string): Promise<boolean> {
  try {
    // Look for filter/search input on showtimes page
    const filterSelectors = [
      'input[placeholder*="Filter"]',
      'input[placeholder*="Search"]',
      'input[placeholder*="filter"]',
      'input[placeholder*="search"]',
      '[data-testid="theatre-filter"]',
    ];

    for (const selector of filterSelectors) {
      const filterInput = this.page.locator(selector).first();
      if (await filterInput.isVisible().catch(() => false)) {
        await filterInput.fill(theatreName);
        await this.page.waitForTimeout(1000);
        logger.info('Filtered theatres', { theatreName });
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.debug('Filter theatres failed', { error: String(error) });
    return false;
  }
}

/**
 * Scroll the venue list to find a theatre
 */
private async scrollToFindTheatre(theatreName: string, maxScrolls = 3): Promise<boolean> {
  try {
    const venueList = this.page.locator('.ReactVirtualized__Grid').first();

    for (let i = 0; i < maxScrolls; i++) {
      // Check if visible after scroll
      if (await this.isTheatreVisible(theatreName)) {
        logger.info('Theatre found after scroll', { theatreName, scrollAttempt: i });
        return true;
      }

      // Scroll down
      await venueList.evaluate((el) => {
        el.scrollTop += 500;
      });
      await this.page.waitForTimeout(500);
    }

    return false;
  } catch (error) {
    logger.debug('Scroll to find theatre failed', { error: String(error) });
    return false;
  }
}

/**
 * Find a theatre using multiple strategies: check visible, filter, scroll
 */
async findTheatre(theatreName: string): Promise<boolean> {
  logger.info('Finding theatre', { theatreName });

  // Strategy 1: Check if already visible
  if (await this.isTheatreVisible(theatreName)) {
    logger.info('Theatre already visible', { theatreName });
    return true;
  }

  // Strategy 2: Try filter/search box
  const filtered = await this.filterTheatres(theatreName);
  if (filtered) {
    await this.page.waitForTimeout(500);
    if (await this.isTheatreVisible(theatreName)) {
      return true;
    }
  }

  // Strategy 3: Scroll through the list
  if (await this.scrollToFindTheatre(theatreName)) {
    return true;
  }

  logger.warn('Theatre not found after all strategies', { theatreName });
  return false;
}
```

**Step 2: Update selectTheatreShowtime to use findTheatre**

Update the beginning of selectTheatreShowtime method to first call findTheatre:

```typescript
async selectTheatreShowtime(
  theatreName: string,
  preferredTimes: string[] = [],
  prefs?: ShowtimePreferences
): Promise<boolean> {
  logger.info('Looking for theatre', { theatreName, preferredTimes });

  // First, ensure the theatre is visible
  const found = await this.findTheatre(theatreName);
  if (!found) {
    logger.warn('Theatre not found', { theatreName });
    return false;
  }

  // ... rest of existing method ...
```

**Step 3: Build and verify**

Run: `yarn build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/automation/pages/ShowtimesPage.ts
git commit -m "feat: add theatre search with filter and scroll"
```

---

### Task 4: Add Available Options Scraping

**Files:**
- Modify: `src/automation/pages/ShowtimesPage.ts`

**Step 1: Add interface for available options**

Add after the ShowtimePreferences interface:

```typescript
export interface AvailableShowtime {
  theatre: string;
  language: string;
  format: string;
  screen?: string;
  times: string[];
}

export interface AvailableOptions {
  scrapedAt: string;
  options: AvailableShowtime[];
}
```

**Step 2: Add method to scrape available options**

Add this method to the ShowtimesPage class:

```typescript
/**
 * Scrape all available showtimes from the current page
 * Used when user preferences don't match available options
 */
async scrapeAvailableOptions(): Promise<AvailableOptions> {
  logger.info('Scraping available options');

  const options: AvailableShowtime[] = [];

  try {
    // Get all theatre rows
    const theatreRows = await this.page.evaluate(() => {
      const results: Array<{
        theatre: string;
        showtimes: Array<{
          time: string;
          format: string;
          language: string;
          screen?: string;
        }>;
      }> = [];

      // Find all venue containers
      const venueContainers = document.querySelectorAll('[class*="venue"], [class*="cinema"]');

      for (const container of venueContainers) {
        const theatreName = container.querySelector('[class*="name"], h3, h4')?.textContent?.trim() || '';
        if (!theatreName) continue;

        const showtimes: Array<{
          time: string;
          format: string;
          language: string;
          screen?: string;
        }> = [];

        // Find showtime buttons within this venue
        const showtimeButtons = container.querySelectorAll('a[href*="/buytickets/"], [class*="showtime"], [class*="session"]');

        for (const btn of showtimeButtons) {
          const text = btn.textContent?.trim() || '';
          // Extract time (pattern like "10:30 AM" or "7:00 PM")
          const timeMatch = text.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i);
          if (timeMatch) {
            // Look for format/language info in parent or sibling elements
            const parentText = btn.parentElement?.textContent || '';
            const format = parentText.match(/\b(2D|3D|4DX|IMAX)\b/i)?.[1] || '2D';
            const screen = parentText.match(/\b(IMAX|PCX|DOLBY|LASER|BARCO|ICE|ONYX)\b/i)?.[1];

            showtimes.push({
              time: timeMatch[0],
              format: format.toUpperCase(),
              language: '', // Will be filled from page context
              screen,
            });
          }
        }

        if (showtimes.length > 0) {
          results.push({ theatre: theatreName, showtimes });
        }
      }

      return results;
    });

    // Group by theatre, language, format
    for (const row of theatreRows) {
      const grouped: Record<string, AvailableShowtime> = {};

      for (const st of row.showtimes) {
        const key = `${st.format}-${st.language || 'Unknown'}-${st.screen || 'Standard'}`;
        if (!grouped[key]) {
          grouped[key] = {
            theatre: row.theatre,
            language: st.language || 'Unknown',
            format: st.format,
            screen: st.screen,
            times: [],
          };
        }
        if (!grouped[key].times.includes(st.time)) {
          grouped[key].times.push(st.time);
        }
      }

      options.push(...Object.values(grouped));
    }

    logger.info('Scraped available options', { count: options.length });
  } catch (error) {
    logger.error('Failed to scrape available options', { error: String(error) });
  }

  return {
    scrapedAt: new Date().toISOString(),
    options,
  };
}
```

**Step 3: Build and verify**

Run: `yarn build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/automation/pages/ShowtimesPage.ts
git commit -m "feat: add available options scraping"
```

---

### Task 5: Add Mismatch Notification Types and Keyboards

**Files:**
- Modify: `src/worker/notificationService.ts`
- Modify: `src/bot/menus/keyboards.ts`

**Step 1: Add new notification types in notificationService.ts**

Update the NotificationType union:

```typescript
export type NotificationType =
  | 'job_created'
  | 'job_started'
  | 'tickets_found'
  | 'booking_started'
  | 'booking_success'
  | 'booking_failed'
  | 'job_completed'
  | 'job_failed'
  | 'job_expired'
  | 'preference_mismatch'  // NEW
  | 'theatre_not_found'    // NEW
  | 'movie_not_found'      // NEW
  | 'job_paused'           // NEW
  | 'job_resumed';         // NEW
```

**Step 2: Update NotificationPayload interface**

Add new fields:

```typescript
export interface NotificationPayload {
  type: NotificationType;
  jobId: string;
  movieName?: string;
  theatre?: string;
  showtime?: string;
  seats?: string[];
  bookingId?: string;
  error?: string;
  totalAmount?: number;
  screenshotPath?: string;
  // New mismatch fields
  wanted?: {
    formats?: string[];
    languages?: string[];
    screens?: string[];
    times?: string[];
    theatres?: string[];
  };
  available?: Array<{
    theatre: string;
    language: string;
    format: string;
    screen?: string;
    times: string[];
  }>;
  mismatchType?: string;
}
```

**Step 3: Add formatMessage cases for new types**

Add these cases in the formatMessage switch:

```typescript
case 'preference_mismatch':
  let msg = `<b>Preference Mismatch</b>\n\n`;
  msg += `Job ID: <code>${jobIdShort}</code>\n`;
  msg += `Movie: ${movieName || 'N/A'}\n\n`;

  if (payload.wanted) {
    msg += `<b>Wanted:</b>\n`;
    if (payload.wanted.formats?.length) msg += `Format: ${payload.wanted.formats.join(', ')}\n`;
    if (payload.wanted.languages?.length) msg += `Language: ${payload.wanted.languages.join(', ')}\n`;
    if (payload.wanted.screens?.length) msg += `Screen: ${payload.wanted.screens.join(', ')}\n`;
    if (payload.wanted.times?.length) msg += `Time: ${payload.wanted.times.join(', ')}\n`;
    if (payload.wanted.theatres?.length) msg += `Theatre: ${payload.wanted.theatres.join(', ')}\n`;
    msg += '\n';
  }

  msg += `<b>Not found:</b> ${error || 'Preferred options not available'}\n\n`;

  if (payload.available && payload.available.length > 0) {
    msg += `<b>Available options:</b>\n`;
    for (const opt of payload.available.slice(0, 5)) {
      const times = opt.times.slice(0, 3).join(', ');
      const more = opt.times.length > 3 ? ` +${opt.times.length - 3} more` : '';
      msg += `• ${opt.language} ${opt.format}${opt.screen ? ` (${opt.screen})` : ''} - ${times}${more}\n`;
    }
    msg += '\n';
  }

  msg += `Respond within 15 minutes or job will be paused.`;
  return msg;

case 'theatre_not_found':
  return (
    `<b>Theatre Not Found</b>\n\n` +
    `Job ID: <code>${jobIdShort}</code>\n` +
    `Movie: ${movieName || 'N/A'}\n` +
    `Searched for: ${payload.wanted?.theatres?.join(', ') || theatre || 'N/A'}\n\n` +
    `The specified theatres don't have showtimes for this movie.\n\n` +
    `Respond within 15 minutes or job will be paused.`
  );

case 'movie_not_found':
  return (
    `<b>Movie Not Found</b>\n\n` +
    `Job ID: <code>${jobIdShort}</code>\n` +
    `Searched for: ${movieName || 'N/A'}\n\n` +
    `This movie is not currently showing on BookMyShow.\n` +
    `Please check the movie name and try again.`
  );

case 'job_paused':
  return (
    `<b>Job Paused</b>\n\n` +
    `Job ID: <code>${jobIdShort}</code>\n` +
    `Movie: ${movieName || 'N/A'}\n\n` +
    `No response received within 15 minutes.\n` +
    `Tap a button below to resume or cancel.`
  );

case 'job_resumed':
  return (
    `<b>Job Resumed</b>\n\n` +
    `Job ID: <code>${jobIdShort}</code>\n` +
    `Movie: ${movieName || 'N/A'}\n\n` +
    `Continuing to watch for tickets...`
  );
```

**Step 4: Add mismatch keyboards in keyboards.ts**

Add at the end of the file:

```typescript
export function mismatchActionKeyboard(jobId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Keep Trying', `mismatch:keep:${jobId}`)
    .text('Book Available', `mismatch:book:${jobId}`)
    .row()
    .text('Update Prefs', `mismatch:update:${jobId}`)
    .text('Cancel Job', `mismatch:cancel:${jobId}`);
}

export function mismatchOptionsKeyboard(
  jobId: string,
  options: Array<{ language: string; format: string; screen?: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();

  options.slice(0, 6).forEach((opt, index) => {
    const label = `${opt.language} ${opt.format}${opt.screen ? ` (${opt.screen})` : ''}`;
    kb.text(label, `mismatch:select:${jobId}:${index}`);
    if ((index + 1) % 2 === 0) kb.row();
  });

  kb.row().text('Back', `mismatch:back:${jobId}`);
  return kb;
}

export function mismatchTimesKeyboard(
  jobId: string,
  times: string[],
  optionIndex: number
): InlineKeyboard {
  const kb = new InlineKeyboard();

  times.slice(0, 8).forEach((time, index) => {
    kb.text(time, `mismatch:time:${jobId}:${optionIndex}:${index}`);
    if ((index + 1) % 4 === 0) kb.row();
  });

  kb.row().text('Back', `mismatch:update:${jobId}`);
  return kb;
}

export function pausedJobKeyboard(jobId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Resume (Keep Trying)', `mismatch:keep:${jobId}`)
    .row()
    .text('Cancel Job', `mismatch:cancel:${jobId}`);
}
```

**Step 5: Build and verify**

Run: `yarn build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/worker/notificationService.ts src/bot/menus/keyboards.ts
git commit -m "feat: add mismatch notification types and keyboards"
```

---

### Task 6: Add JobService Methods for Mismatch Handling

**Files:**
- Modify: `src/worker/jobService.ts`

**Step 1: Add new methods to JobService class**

Add these methods:

```typescript
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
        availableOptions: null,
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
        availableOptions: null,
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
```

**Step 2: Update getActiveJobsByUser to include new states**

Update the status filter:

```typescript
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
```

**Step 3: Build and verify**

Run: `yarn build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/worker/jobService.ts
git commit -m "feat: add jobService methods for mismatch handling"
```

---

### Task 7: Add Timeout Checker to Scheduler

**Files:**
- Modify: `src/worker/scheduler.ts`

**Step 1: Import notificationService and add timeout checker**

Add import at top:

```typescript
import { notificationService } from './notificationService.js';
```

**Step 2: Add checkAwaitingInputTimeouts function**

Add after expireOldJobs function:

```typescript
/**
 * Check for jobs awaiting input that have timed out (15 minutes)
 * Pause them and notify the user
 */
async function checkAwaitingInputTimeouts(): Promise<void> {
  try {
    const timedOutJobs = await jobService.getTimedOutAwaitingJobs();

    for (const job of timedOutJobs) {
      // Pause the job
      await jobService.pauseJob(job.id);

      // Notify user
      if (job.lastScreenshotPath) {
        await notificationService.notifyWithScreenshot(
          job.user.telegramId,
          {
            type: 'job_paused',
            jobId: job.id,
            movieName: job.movieName,
            error: 'No response to preference mismatch notification',
          },
          job.lastScreenshotPath
        );
      } else {
        await notificationService.notify(job.user.telegramId, {
          type: 'job_paused',
          jobId: job.id,
          movieName: job.movieName,
          error: 'No response to preference mismatch notification',
        });
      }

      logger.info('Job paused due to timeout', { jobId: job.id });
    }

    if (timedOutJobs.length > 0) {
      logger.info('Paused timed-out jobs', { count: timedOutJobs.length });
    }
  } catch (error) {
    logger.error('Failed to check awaiting input timeouts', { error: String(error) });
  }
}
```

**Step 3: Update schedulerTick to call the timeout checker**

Update schedulerTick:

```typescript
async function schedulerTick(): Promise<void> {
  if (!isRunning) return;

  try {
    logger.debug('Scheduler tick');

    // Expire old jobs first
    await expireOldJobs();

    // Check for timed-out awaiting input jobs
    await checkAwaitingInputTimeouts();

    // Enqueue ready jobs
    await enqueueReadyJobs();

    // Cleanup stale tracking
    cleanupQueueTracking();
  } catch (error) {
    logger.error('Scheduler tick failed', { error: String(error) });
  }
}
```

**Step 4: Build and verify**

Run: `yarn build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/worker/scheduler.ts
git commit -m "feat: add timeout checker for awaiting input jobs"
```

---

### Task 8: Add Mismatch Detection to Watch Processor

**Files:**
- Modify: `src/worker/processors/watchProcessor.ts`

**Step 1: Add helper function to check preference match**

Add after the imports:

```typescript
interface PreferenceMatchResult {
  matched: boolean;
  mismatchType?: 'format' | 'language' | 'screen' | 'time' | 'theatre';
  error?: string;
}

function checkPreferenceMatch(
  showtimePrefs: {
    preferredFormats?: string[];
    preferredLanguages?: string[];
    preferredScreens?: string[];
    preferredTimes?: string[];
  },
  availableOptions: Array<{
    format: string;
    language: string;
    screen?: string;
    times: string[];
  }>
): PreferenceMatchResult {
  if (availableOptions.length === 0) {
    return { matched: false, mismatchType: 'theatre', error: 'No showtimes available' };
  }

  const hasFormat = !showtimePrefs.preferredFormats?.length ||
    availableOptions.some(opt =>
      showtimePrefs.preferredFormats!.some(pf =>
        opt.format.toUpperCase().includes(pf.toUpperCase())
      )
    );

  const hasLanguage = !showtimePrefs.preferredLanguages?.length ||
    availableOptions.some(opt =>
      showtimePrefs.preferredLanguages!.some(pl =>
        opt.language.toUpperCase().includes(pl.toUpperCase())
      )
    );

  const hasScreen = !showtimePrefs.preferredScreens?.length ||
    availableOptions.some(opt =>
      opt.screen && showtimePrefs.preferredScreens!.some(ps =>
        opt.screen!.toUpperCase().includes(ps.toUpperCase())
      )
    );

  const hasTime = !showtimePrefs.preferredTimes?.length ||
    availableOptions.some(opt =>
      opt.times.some(t =>
        showtimePrefs.preferredTimes!.some(pt =>
          t.includes(pt) || pt.includes(t)
        )
      )
    );

  if (!hasFormat) {
    return { matched: false, mismatchType: 'format', error: 'Preferred format not available' };
  }
  if (!hasLanguage) {
    return { matched: false, mismatchType: 'language', error: 'Preferred language not available' };
  }
  if (!hasScreen) {
    return { matched: false, mismatchType: 'screen', error: 'Preferred screen type not available' };
  }
  if (!hasTime) {
    return { matched: false, mismatchType: 'time', error: 'Preferred showtime not available' };
  }

  return { matched: true };
}
```

**Step 2: Import keyboard function**

Add to imports:

```typescript
import { mismatchActionKeyboard } from '../../bot/menus/keyboards.js';
import { bot } from '../../bot/index.js';
import { AvailableOptions } from '../../automation/pages/ShowtimesPage.js';
```

**Step 3: Update processWatchJob to detect mismatches**

After scraping available options when theatre/showtime not found, add mismatch detection. Replace the "No tickets found in preferred theatres" section:

```typescript
// No tickets found in preferred theatres - scrape available options
const availableOptions = await showtimesPage.scrapeAvailableOptions();

// Check if any preferences match
const showtimePrefsTyped = showtimePrefs as {
  preferredFormats?: string[];
  preferredLanguages?: string[];
  preferredScreens?: string[];
  preferredTimes?: string[];
};

const matchResult = checkPreferenceMatch(showtimePrefsTyped, availableOptions.options);

if (!matchResult.matched && availableOptions.options.length > 0) {
  // Save screenshot for notification
  const screenshotPath = `${DEBUG_DIR}/${jobId}-mismatch-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Set job to awaiting input
  await jobService.setAwaitingInput(
    jobId,
    matchResult.mismatchType || 'unknown',
    availableOptions,
    screenshotPath
  );

  // Send mismatch notification with screenshot and buttons
  const keyboard = mismatchActionKeyboard(jobId);

  await bot.api.sendPhoto(
    bookingJob.user.telegramId,
    new (await import('grammy')).InputFile(screenshotPath),
    {
      caption: `<b>Preference Mismatch</b>\n\n` +
        `Movie: ${bookingJob.movieName}\n\n` +
        `<b>Wanted:</b>\n` +
        (showtimePrefsTyped.preferredFormats?.length ? `Format: ${showtimePrefsTyped.preferredFormats.join(', ')}\n` : '') +
        (showtimePrefsTyped.preferredLanguages?.length ? `Language: ${showtimePrefsTyped.preferredLanguages.join(', ')}\n` : '') +
        (showtimePrefsTyped.preferredScreens?.length ? `Screen: ${showtimePrefsTyped.preferredScreens.join(', ')}\n` : '') +
        (showtimePrefsTyped.preferredTimes?.length ? `Time: ${showtimePrefsTyped.preferredTimes.join(', ')}\n` : '') +
        `\n<b>Issue:</b> ${matchResult.error}\n\n` +
        `<b>Available:</b>\n` +
        availableOptions.options.slice(0, 5).map(opt =>
          `• ${opt.language} ${opt.format}${opt.screen ? ` (${opt.screen})` : ''} - ${opt.times.slice(0, 3).join(', ')}`
        ).join('\n') +
        `\n\nRespond within 15 minutes or job will be paused.`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );

  logger.info('Preference mismatch detected, awaiting user input', {
    jobId,
    mismatchType: matchResult.mismatchType,
  });

  await context.close();
  await browser.close();

  return { ticketsFound: false, error: 'Awaiting user input for preference mismatch' };
}

// Original behavior: no tickets in preferred theatres
await context.close();
await browser.close();

logger.debug('No tickets in preferred theatres', { jobId, theatres: bookingJob.theatres });
return { ticketsFound: false };
```

**Step 4: Build and verify**

Run: `yarn build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/worker/processors/watchProcessor.ts
git commit -m "feat: add mismatch detection to watch processor"
```

---

### Task 9: Add Mismatch Callback Handlers

**Files:**
- Modify: `src/bot/index.ts`
- Modify: `src/bot/menus/index.ts`

**Step 1: Add mismatch handler imports in bot/index.ts**

Add to imports:

```typescript
import {
  handleMismatchKeep,
  handleMismatchBook,
  handleMismatchUpdate,
  handleMismatchSelect,
  handleMismatchTime,
  handleMismatchCancel,
  handleMismatchBack,
} from './menus/index.js';
```

**Step 2: Add mismatch callback handlers in bot/index.ts**

Add after existing callback handlers:

```typescript
// Mismatch handling callbacks
bot.callbackQuery(/^mismatch:keep:(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await handleMismatchKeep(ctx, jobId);
});

bot.callbackQuery(/^mismatch:book:(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await handleMismatchBook(ctx, jobId);
});

bot.callbackQuery(/^mismatch:update:(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await handleMismatchUpdate(ctx, jobId);
});

bot.callbackQuery(/^mismatch:select:(.+):(\d+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  const optionIndex = parseInt(ctx.match[2], 10);
  await handleMismatchSelect(ctx, jobId, optionIndex);
});

bot.callbackQuery(/^mismatch:time:(.+):(\d+):(\d+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  const optionIndex = parseInt(ctx.match[2], 10);
  const timeIndex = parseInt(ctx.match[3], 10);
  await handleMismatchTime(ctx, jobId, optionIndex, timeIndex);
});

bot.callbackQuery(/^mismatch:cancel:(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await handleMismatchCancel(ctx, jobId);
});

bot.callbackQuery(/^mismatch:back:(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await handleMismatchBack(ctx, jobId);
});
```

**Step 3: Add mismatch handler functions in menus/index.ts**

Add imports:

```typescript
import { mismatchOptionsKeyboard, mismatchTimesKeyboard, mismatchActionKeyboard } from './keyboards.js';
```

Add these handler functions:

```typescript
// Mismatch handling functions

export async function handleMismatchKeep(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery('Continuing to watch...');

    await jobService.resumeJob(jobId);

    await ctx.editMessageCaption({
      caption: `<b>Job Resumed</b>\n\nContinuing to watch for your preferred options...`,
      parse_mode: 'HTML',
    });

    logger.info('User chose to keep trying', { jobId });
  } catch (error) {
    logger.error('Failed to handle mismatch keep', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error resuming job');
  }
}

export async function handleMismatchBook(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery('Proceeding with available options...');

    const job = await jobService.getJobWithOptions(jobId);
    if (!job || !job.availableOptions) {
      await ctx.answerCallbackQuery('No available options found');
      return;
    }

    const options = (job.availableOptions as { options: Array<{ language: string; format: string; screen?: string; times: string[] }> }).options;

    if (options.length > 0) {
      // Just use the first available option
      const firstOption = options[0];
      await jobService.updateJobPreferences(jobId, {
        preferredFormats: [firstOption.format],
        preferredLanguages: [firstOption.language],
        preferredScreens: firstOption.screen ? [firstOption.screen] : undefined,
        preferredTimes: firstOption.times.slice(0, 1),
      });

      await ctx.editMessageCaption({
        caption: `<b>Booking Available Option</b>\n\n` +
          `Selected: ${firstOption.language} ${firstOption.format}${firstOption.screen ? ` (${firstOption.screen})` : ''}\n` +
          `Time: ${firstOption.times[0]}\n\n` +
          `Proceeding with booking...`,
        parse_mode: 'HTML',
      });
    }

    logger.info('User chose to book available', { jobId });
  } catch (error) {
    logger.error('Failed to handle mismatch book', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error processing request');
  }
}

export async function handleMismatchUpdate(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery();

    const job = await jobService.getJobWithOptions(jobId);
    if (!job || !job.availableOptions) {
      await ctx.answerCallbackQuery('No available options found');
      return;
    }

    const availableOptions = (job.availableOptions as { options: Array<{ language: string; format: string; screen?: string; times: string[] }> }).options;

    const keyboard = mismatchOptionsKeyboard(jobId, availableOptions);

    await ctx.editMessageCaption({
      caption: `<b>Select New Preference</b>\n\nChoose from available options:`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });

    logger.info('User chose to update preferences', { jobId });
  } catch (error) {
    logger.error('Failed to handle mismatch update', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error showing options');
  }
}

export async function handleMismatchSelect(ctx: MyContext, jobId: string, optionIndex: number): Promise<void> {
  try {
    await ctx.answerCallbackQuery();

    const job = await jobService.getJobWithOptions(jobId);
    if (!job || !job.availableOptions) {
      await ctx.answerCallbackQuery('No available options found');
      return;
    }

    const availableOptions = (job.availableOptions as { options: Array<{ language: string; format: string; screen?: string; times: string[] }> }).options;
    const selectedOption = availableOptions[optionIndex];

    if (!selectedOption) {
      await ctx.answerCallbackQuery('Invalid option');
      return;
    }

    // Store selection in session for time selection
    ctx.session.selectedMismatchOption = {
      jobId,
      optionIndex,
      option: selectedOption,
    };

    const keyboard = mismatchTimesKeyboard(jobId, selectedOption.times, optionIndex);

    await ctx.editMessageCaption({
      caption: `<b>Select Showtime</b>\n\n` +
        `Selected: ${selectedOption.language} ${selectedOption.format}${selectedOption.screen ? ` (${selectedOption.screen})` : ''}\n\n` +
        `Choose a showtime:`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });

    logger.info('User selected option', { jobId, optionIndex });
  } catch (error) {
    logger.error('Failed to handle mismatch select', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error processing selection');
  }
}

export async function handleMismatchTime(ctx: MyContext, jobId: string, optionIndex: number, timeIndex: number): Promise<void> {
  try {
    await ctx.answerCallbackQuery('Updating preferences...');

    const job = await jobService.getJobWithOptions(jobId);
    if (!job || !job.availableOptions) {
      await ctx.answerCallbackQuery('No available options found');
      return;
    }

    const availableOptions = (job.availableOptions as { options: Array<{ language: string; format: string; screen?: string; times: string[] }> }).options;
    const selectedOption = availableOptions[optionIndex];
    const selectedTime = selectedOption?.times[timeIndex];

    if (!selectedOption || !selectedTime) {
      await ctx.answerCallbackQuery('Invalid selection');
      return;
    }

    // Update job preferences and resume
    await jobService.updateJobPreferences(jobId, {
      preferredFormats: [selectedOption.format],
      preferredLanguages: [selectedOption.language],
      preferredScreens: selectedOption.screen ? [selectedOption.screen] : undefined,
      preferredTimes: [selectedTime],
    });

    await ctx.editMessageCaption({
      caption: `<b>Preferences Updated</b>\n\n` +
        `Format: ${selectedOption.format}\n` +
        `Language: ${selectedOption.language}\n` +
        (selectedOption.screen ? `Screen: ${selectedOption.screen}\n` : '') +
        `Time: ${selectedTime}\n\n` +
        `Resuming job with new preferences...`,
      parse_mode: 'HTML',
    });

    logger.info('User selected time, preferences updated', { jobId, optionIndex, timeIndex });
  } catch (error) {
    logger.error('Failed to handle mismatch time', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error updating preferences');
  }
}

export async function handleMismatchCancel(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery('Cancelling job...');

    await jobService.cancelJob(jobId);

    await ctx.editMessageCaption({
      caption: `<b>Job Cancelled</b>\n\nThe booking job has been cancelled.`,
      parse_mode: 'HTML',
    });

    logger.info('User cancelled job from mismatch', { jobId });
  } catch (error) {
    logger.error('Failed to handle mismatch cancel', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error cancelling job');
  }
}

export async function handleMismatchBack(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery();

    const job = await jobService.getJobWithOptions(jobId);
    if (!job) {
      await ctx.answerCallbackQuery('Job not found');
      return;
    }

    const keyboard = mismatchActionKeyboard(jobId);

    await ctx.editMessageCaption({
      caption: `<b>Preference Mismatch</b>\n\nWhat would you like to do?`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (error) {
    logger.error('Failed to handle mismatch back', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error going back');
  }
}
```

**Step 4: Add selectedMismatchOption to SessionData interface in bot/index.ts**

Update the SessionData interface:

```typescript
export interface SessionData {
  step?: string;
  jobDraft?: JobDraft;
  menuMessageId?: number;
  selectedDates?: string[];
  selectedFormats?: string[];
  selectedLanguages?: string[];
  selectedScreens?: string[];
  selectedMismatchOption?: {
    jobId: string;
    optionIndex: number;
    option: {
      language: string;
      format: string;
      screen?: string;
      times: string[];
    };
  };
}
```

**Step 5: Build and verify**

Run: `yarn build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/bot/index.ts src/bot/menus/index.ts
git commit -m "feat: add mismatch callback handlers"
```

---

### Task 10: Update Job Status Display

**Files:**
- Modify: `src/bot/menus/keyboards.ts`
- Modify: `src/bot/menus/index.ts`

**Step 1: Update jobListKeyboard status emojis**

Update the statusEmoji object in jobListKeyboard:

```typescript
export function jobListKeyboard(jobs: Array<{ id: string; movieName: string; status: string }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  const statusEmoji: Record<string, string> = {
    PENDING: '',
    WATCHING: '',
    BOOKING: '',
    AWAITING_CONSENT: '',
    AWAITING_INPUT: '',  // NEW
    PAUSED: '',          // NEW
    SUCCESS: '',
    FAILED: '',
    CANCELLED: '',
  };
  // ... rest of function
```

**Step 2: Update job detail display to show paused/awaiting state**

In menus/index.ts, update the showJobDetail function to handle new states:

```typescript
// Add after getting job details, before building message
let statusMessage = '';
if (job.status === 'AWAITING_INPUT') {
  statusMessage = '\n\n<b>Action Required:</b> Please respond to the preference mismatch notification.';
} else if (job.status === 'PAUSED') {
  statusMessage = '\n\n<b>Status:</b> Job is paused. Resume or cancel to continue.';
}

// Add keyboard for paused jobs
let keyboard = jobDetailKeyboard(jobId);
if (job.status === 'PAUSED') {
  keyboard = new InlineKeyboard()
    .text('Resume Job', `mismatch:keep:${jobId}`)
    .row()
    .text('Cancel Job', `job:cancel:${jobId}`)
    .row()
    .text('Back to Jobs', 'menu:jobs');
}
```

**Step 3: Build and verify**

Run: `yarn build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/bot/menus/keyboards.ts src/bot/menus/index.ts
git commit -m "feat: update job status display for new states"
```

---

### Task 11: Final Build and Test

**Step 1: Run full build**

Run: `yarn build`
Expected: Build succeeds with no errors

**Step 2: Run database migration (if not done)**

Run: `npx prisma migrate dev`
Expected: All migrations applied

**Step 3: Start the bot**

Run: `yarn dev`
Expected: Bot starts without errors

**Step 4: Test mismatch flow**

1. Create a job with specific preferences (e.g., English, IMAX, 9:00 PM)
2. Wait for the bot to check and detect a mismatch
3. Verify notification received with screenshot and buttons
4. Test each button: Keep Trying, Book Available, Update Prefs, Cancel

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete search fallback and mismatch handling implementation"
```

---

## Summary

This implementation adds:

1. **City fuzzy matching** - Handles common misspellings and aliases
2. **Theatre search** - Filter and scroll to find theatres in virtualized lists
3. **Available options scraping** - Captures all showtimes when preferences don't match
4. **Mismatch notifications** - Rich notifications with screenshots and action buttons
5. **User response handling** - Keep trying, book available, update preferences, or cancel
6. **15-minute timeout** - Pauses jobs when users don't respond
7. **Job state management** - New AWAITING_INPUT and PAUSED states

Total: 11 tasks
