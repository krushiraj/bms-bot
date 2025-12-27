import { Job } from 'bullmq';
import { JobStatus } from '@prisma/client';
import { InputFile } from 'grammy';
import { jobService, JobWithUser } from '../jobService.js';
import { notificationService } from '../notificationService.js';
import { bookingQueue } from '../queues.js';
import { logger } from '../../utils/logger.js';
import { launchBrowser, createContext, createPage } from '../../automation/browser.js';
import { HomePage } from '../../automation/pages/HomePage.js';
import { ShowtimesPage } from '../../automation/pages/ShowtimesPage.js';
import { mismatchActionKeyboard } from '../../bot/menus/keyboards.js';
import { bot } from '../../bot/index.js';
import * as fs from 'fs';
import * as path from 'path';

export interface WatchJobData {
  jobId: string;
}

export interface WatchResult {
  ticketsFound: boolean;
  theatre?: string;
  showtime?: string;
  error?: string;
}

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

const DEBUG_DIR = 'screenshots/watch-debug';

// Ensure debug directory exists
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

async function saveDebugInfo(page: any, jobId: string, stage: string): Promise<void> {
  const timestamp = Date.now();
  const prefix = `${DEBUG_DIR}/${jobId}-${stage}-${timestamp}`;

  try {
    // Save screenshot
    await page.screenshot({ path: `${prefix}.png`, fullPage: true });
    logger.info('Debug screenshot saved', { path: `${prefix}.png` });

    // Save page HTML
    const html = await page.content();
    fs.writeFileSync(`${prefix}.html`, html);
    logger.info('Debug HTML saved', { path: `${prefix}.html` });

    // Save relevant element info
    const debugInfo: any = {
      url: page.url(),
      timestamp: new Date().toISOString(),
      stage,
    };

    // Check for various elements
    const selectors = [
      { name: 'venueList', selector: '[class*="venue"]' },
      { name: 'cinemaList', selector: '[class*="cinema"]' },
      { name: 'theatreList', selector: '[class*="theatre"]' },
      { name: 'showtimeList', selector: '[class*="showtime"]' },
      { name: 'virtualizedGrid', selector: '.ReactVirtualized__Grid' },
      { name: 'scE8nk8f', selector: '[class*="sc-e8nk8f"]' },
      { name: 'sc1la7659', selector: '[class*="sc-1la7659"]' },
      { name: 'buytickets', selector: 'a[href*="/buytickets/"]' },
      { name: 'sessionBtn', selector: '[class*="session"]' },
      { name: 'datePill', selector: '[id^="2025"], [id^="2026"]' },
    ];

    for (const { name, selector } of selectors) {
      const count = await page.locator(selector).count();
      debugInfo[name] = { count };
      if (count > 0 && count <= 5) {
        const texts: string[] = [];
        for (let i = 0; i < count; i++) {
          const text = await page.locator(selector).nth(i).textContent().catch(() => '');
          texts.push(text?.substring(0, 100) || '');
        }
        debugInfo[name].samples = texts;
      }
    }

    fs.writeFileSync(`${prefix}.json`, JSON.stringify(debugInfo, null, 2));
    logger.info('Debug info saved', { path: `${prefix}.json` });
  } catch (error) {
    logger.error('Failed to save debug info', { error: String(error) });
  }
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
    browser = await launchBrowser();
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

    // Handle language/format dialog if it appears
    const showtimePrefs = bookingJob.showtimePrefs as {
      preferredDates?: string[];
      preferredTimes?: string[];
      preferredFormats?: string[];
      preferredLanguages?: string[];
      preferredScreens?: string[];
    };
    await homePage.handleLanguageFormatDialog(
      showtimePrefs.preferredLanguages,
      showtimePrefs.preferredFormats
    );

    // Check showtimes page
    const showtimesPage = new ShowtimesPage(page);

    // Wait a bit longer for page to fully load
    await page.waitForTimeout(3000);

    // Save debug info before checking showtimes
    await saveDebugInfo(page, jobId, 'before-showtime-check');

    const hasShowtimes = await showtimesPage.waitForShowtimes();

    if (!hasShowtimes) {
      logger.info('No showtimes available', { jobId, movieName: bookingJob.movieName });
      // Save additional debug info when no showtimes found
      await saveDebugInfo(page, jobId, 'no-showtimes-found');

      await context.close();
      await browser.close();
      return { ticketsFound: false };
    }

    // Select the preferred date if provided
    if (showtimePrefs.preferredDates?.[0]) {
      const dateSelected = await showtimesPage.selectDateByDay(showtimePrefs.preferredDates[0]);
      if (dateSelected) {
        logger.info('Date selected', { date: showtimePrefs.preferredDates[0] });
        await saveDebugInfo(page, jobId, 'after-date-selection');
        // Wait for showtimes to refresh after date selection
        await page.waitForTimeout(2000);
      } else {
        logger.warn('Could not select preferred date', { date: showtimePrefs.preferredDates[0] });
      }
    }

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
        logger.info('Adding job to booking queue', { jobId });
        await bookingQueue.add(
          `booking-${jobId}`,
          { jobId },
          { jobId: `booking-${jobId}` }
        );
        logger.info('Job added to booking queue', { jobId });

        await context.close();
        await browser.close();

        return {
          ticketsFound: true,
          theatre,
        };
      }
    }

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
        new InputFile(screenshotPath),
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

  } catch (error) {
    logger.error('Watch job failed', { jobId, error: String(error) });

    if (browser) {
      await browser.close().catch(() => {});
    }

    return { ticketsFound: false, error: String(error) };
  }
}
