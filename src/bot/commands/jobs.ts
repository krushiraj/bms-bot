import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { JobStatus } from '@prisma/client';
import { jobService } from '../../worker/jobService.js';
import { notificationService } from '../../worker/notificationService.js';
import { userService } from '../../services/userService.js';
import { logger } from '../../utils/logger.js';
import { MyContext, JobDraft } from '../index.js';

const CITIES = ['hyderabad', 'bangalore', 'mumbai', 'delhi', 'chennai', 'kolkata', 'pune'];
const DEFAULT_THEATRES = ['AMB Cinemas', 'PVR', 'INOX', 'Cinepolis'];

// BMS-style time ranges (including midnight premieres)
const TIME_RANGES = {
  midnight: { label: '🌌 Midnight', times: ['12:00 AM', '1:00 AM', '2:00 AM', '3:00 AM'] },
  early: { label: '🌄 Early (4-8 AM)', times: ['4:00 AM', '5:00 AM', '6:00 AM', '7:00 AM', '8:00 AM'] },
  morning: { label: '🌅 Morning', times: ['9:00 AM', '10:00 AM', '11:00 AM'] },
  afternoon: { label: '☀️ Afternoon', times: ['12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM'] },
  evening: { label: '🌆 Evening', times: ['4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM'] },
  night: { label: '🌙 Night', times: ['8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'] },
};

// Seat count options
const SEAT_COUNTS = [1, 2, 3, 4, 5, 6];

/**
 * Start creating a new booking job (interactive flow)
 */
export async function newJobCommand(ctx: CommandContext<MyContext>): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  try {
    const user = await userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start to register first.');
      return;
    }

    // Check if user has contact info
    if (!user.email || !user.phone) {
      await ctx.reply(
        'Please set your contact details first:\n\n' +
        '/setcontact email@example.com 9876543210\n\n' +
        'This is required for BMS booking confirmation.'
      );
      return;
    }

    // Initialize job draft in session
    ctx.session.step = 'job_movie';
    ctx.session.jobDraft = {};

    await ctx.reply(
      '🎬 *Create New Booking Job*\n\n' +
      'I\'ll help you set up automatic ticket booking.\n\n' +
      '*Step 1/5: Movie Name*\n' +
      'What movie do you want to book tickets for?\n\n' +
      'Just type the movie name:',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error starting new job', { error, telegramId });
    await ctx.reply('Failed to start job creation. Please try again.');
  }
}

/**
 * Quick job creation with all parameters
 * Usage: /quickjob <movie> | <city> | <theatre> | <date> | <time> | <seats>
 */
export async function quickJobCommand(ctx: CommandContext<Context>): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  const args = ctx.match?.toString();
  if (!args) {
    await ctx.reply(
      '*Quick Job Creation*\n\n' +
      'Usage:\n' +
      '`/quickjob Movie Name | city | theatre | date | time | seats`\n\n' +
      'Example:\n' +
      '`/quickjob Pushpa 2 | hyderabad | AMB Cinemas | 28 | 7:00 PM | 2`\n\n' +
      'Or use /newjob for interactive setup.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const parts = args.split('|').map(p => p.trim());
  if (parts.length < 6) {
    await ctx.reply('Please provide all parameters. Use /quickjob without arguments for help.');
    return;
  }

  const [movieName, city, theatre, date, time, seatsStr] = parts;
  const seatCount = parseInt(seatsStr || '2', 10);

  if (!movieName || !city || !theatre || !date || !time) {
    await ctx.reply('Invalid parameters. Use /quickjob without arguments for help.');
    return;
  }

  if (seatCount < 1 || seatCount > 10) {
    await ctx.reply('Seat count must be between 1 and 10.');
    return;
  }

  try {
    const user = await userService.getOrCreate(telegramId);

    // Calculate watch window (now to 7 days from now)
    const now = new Date();
    const watchUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const job = await jobService.createJob({
      userId: user.id,
      movieName,
      city: city.toLowerCase(),
      watchFromDate: now,
      watchUntilDate: watchUntil,
      theatres: [theatre],
      showtimePrefs: {
        preferredDates: [date],
        preferredTimes: [time],
      },
      seatPrefs: {
        count: seatCount,
        avoidBottomRows: 3,
        preferCenter: true,
        needAdjacent: true,
      },
    });

    logger.info('Quick job created', { userId: user.id, jobId: job.id, movieName });

    // Send notification
    await notificationService.notify(telegramId, {
      type: 'job_created',
      jobId: job.id,
      movieName,
      theatre,
    });

    await ctx.reply(
      `✅ *Booking Job Created!*\n\n` +
      `Job ID: \`${job.id.substring(0, 8)}\`\n` +
      `Movie: ${movieName}\n` +
      `City: ${city}\n` +
      `Theatre: ${theatre}\n` +
      `Date: ${date}\n` +
      `Time: ${time}\n` +
      `Seats: ${seatCount}\n\n` +
      `I'll monitor for tickets and book automatically when available.\n\n` +
      `Use /myjobs to see all your jobs.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error creating quick job', { error, telegramId });
    await ctx.reply('Failed to create job. Please try again.');
  }
}

/**
 * List all booking jobs for the user
 */
export async function myJobsCommand(ctx: CommandContext<Context>): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  try {
    const user = await userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start to register first.');
      return;
    }

    const jobs = await jobService.getJobsByUser(user.id);

    if (jobs.length === 0) {
      await ctx.reply(
        'You don\'t have any booking jobs yet.\n\n' +
        'Use /newjob to create one.'
      );
      return;
    }

    const statusEmoji: Record<string, string> = {
      PENDING: '⏳',
      WATCHING: '👀',
      BOOKING: '🎫',
      AWAITING_CONSENT: '❓',
      SUCCESS: '✅',
      FAILED: '❌',
      CANCELLED: '🚫',
    };

    const jobList = jobs.slice(0, 10).map((job, i) => {
      const emoji = statusEmoji[job.status] || '❓';
      const shortId = job.id.substring(0, 8);
      const date = job.createdAt.toLocaleDateString();
      return `${i + 1}. ${emoji} \`${shortId}\` - ${job.movieName} (${job.status})\n   Created: ${date}`;
    }).join('\n\n');

    await ctx.reply(
      `🎬 *Your Booking Jobs*\n\n${jobList}\n\n` +
      `Use /jobstatus <id> for details\n` +
      `Use /canceljob <id> to cancel`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error listing jobs', { error, telegramId });
    await ctx.reply('Failed to fetch jobs. Please try again.');
  }
}

/**
 * Check status of a specific job
 */
export async function jobStatusCommand(ctx: CommandContext<Context>): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  const jobIdPrefix = ctx.match?.toString().trim();
  if (!jobIdPrefix) {
    await ctx.reply('Usage: /jobstatus <job-id>\n\nUse /myjobs to see your job IDs.');
    return;
  }

  try {
    const user = await userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start to register first.');
      return;
    }

    // Find job by prefix
    const jobs = await jobService.getJobsByUser(user.id);
    const job = jobs.find(j => j.id.startsWith(jobIdPrefix));

    if (!job) {
      await ctx.reply('Job not found. Use /myjobs to see your jobs.');
      return;
    }

    const showtimePrefs = job.showtimePrefs as { preferredDates?: string[]; preferredTimes?: string[] };
    const seatPrefs = job.seatPrefs as { count: number };

    let statusDetails = '';
    if (job.status === JobStatus.SUCCESS && job.bookingResult) {
      const result = job.bookingResult as { bookingId?: string; seats?: string[]; totalAmount?: number };
      statusDetails = `\n\n*Booking Details:*\n` +
        `Booking ID: \`${result.bookingId || 'N/A'}\`\n` +
        `Seats: ${result.seats?.join(', ') || 'N/A'}\n` +
        `Amount: ₹${result.totalAmount || 'N/A'}`;
    } else if (job.status === JobStatus.FAILED && job.bookingResult) {
      const result = job.bookingResult as { error?: string };
      statusDetails = `\n\n*Error:* ${result.error || 'Unknown error'}`;
    }

    await ctx.reply(
      `📋 *Job Details*\n\n` +
      `ID: \`${job.id.substring(0, 8)}\`\n` +
      `Status: ${job.status}\n` +
      `Movie: ${job.movieName}\n` +
      `City: ${job.city}\n` +
      `Theatres: ${job.theatres.join(', ')}\n` +
      `Dates: ${showtimePrefs.preferredDates?.join(', ') || 'Any'}\n` +
      `Times: ${showtimePrefs.preferredTimes?.join(', ') || 'Any'}\n` +
      `Seats: ${seatPrefs.count}\n` +
      `Watch Until: ${job.watchUntilDate.toLocaleDateString()}` +
      statusDetails,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error getting job status', { error, telegramId });
    await ctx.reply('Failed to get job status. Please try again.');
  }
}

/**
 * Cancel a booking job
 */
export async function cancelJobCommand(ctx: CommandContext<Context>): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  const jobIdPrefix = ctx.match?.toString().trim();
  if (!jobIdPrefix) {
    await ctx.reply('Usage: /canceljob <job-id>\n\nUse /myjobs to see your job IDs.');
    return;
  }

  try {
    const user = await userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start to register first.');
      return;
    }

    // Find job by prefix
    const jobs = await jobService.getJobsByUser(user.id);
    const job = jobs.find(j => j.id.startsWith(jobIdPrefix));

    if (!job) {
      await ctx.reply('Job not found. Use /myjobs to see your jobs.');
      return;
    }

    // Check if job can be cancelled
    if (job.status === JobStatus.SUCCESS) {
      await ctx.reply('This job has already completed successfully and cannot be cancelled.');
      return;
    }

    if (job.status === JobStatus.CANCELLED) {
      await ctx.reply('This job is already cancelled.');
      return;
    }

    await jobService.cancelJob(job.id);

    logger.info('Job cancelled by user', { userId: user.id, jobId: job.id });

    await ctx.reply(
      `✅ Job \`${job.id.substring(0, 8)}\` cancelled.\n\n` +
      `Movie: ${job.movieName}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error cancelling job', { error, telegramId });
    await ctx.reply('Failed to cancel job. Please try again.');
  }
}

/**
 * Set contact details for the user
 */
export async function setContactCommand(ctx: CommandContext<Context>): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  const args = ctx.match?.toString().split(/\s+/).filter(Boolean) ?? [];
  if (args.length < 2) {
    await ctx.reply(
      'Usage: /setcontact <email> <phone>\n\n' +
      'Example: /setcontact john@example.com 9876543210'
    );
    return;
  }

  const [email, phone] = args;
  if (!email || !phone) {
    await ctx.reply('Please provide both email and phone.');
    return;
  }

  // Basic validation
  if (!email.includes('@') || !email.includes('.')) {
    await ctx.reply('Please enter a valid email address.');
    return;
  }

  if (!/^\d{10}$/.test(phone)) {
    await ctx.reply('Please enter a valid 10-digit phone number.');
    return;
  }

  try {
    const user = await userService.getOrCreate(telegramId);
    await userService.updateContactInfo(user.id, { email, phone });

    // Delete message for privacy
    try {
      await ctx.deleteMessage();
    } catch {
      // May fail if bot doesn't have delete permission
    }

    await ctx.reply(
      `✅ Contact details updated!\n\n` +
      `Email: ${email}\n` +
      `Phone: ****${phone.slice(-4)}\n\n` +
      `You can now create booking jobs with /newjob`
    );
  } catch (error) {
    logger.error('Error setting contact', { error, telegramId });
    await ctx.reply('Failed to update contact details. Please try again.');
  }
}

/**
 * Handle message for interactive job creation
 */
export async function handleJobMessage(ctx: MyContext): Promise<boolean> {
  const step = ctx.session.step;
  if (!step?.startsWith('job_')) {
    return false;
  }

  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  const draft: JobDraft = ctx.session.jobDraft || {};

  try {
    switch (step) {
      case 'job_movie':
        draft.movieName = text;
        ctx.session.jobDraft = draft;
        ctx.session.step = 'job_city';

        await ctx.reply(
          `✅ Movie: *${text}*\n\n` +
          `*Step 2/5: City*\n` +
          `Which city?\n\n` +
          `Options: ${CITIES.join(', ')}\n\n` +
          `Or type your city name:`,
          { parse_mode: 'Markdown' }
        );
        return true;

      case 'job_city':
        draft.city = text.toLowerCase();
        ctx.session.jobDraft = draft;
        ctx.session.step = 'job_theatre';

        await ctx.reply(
          `✅ City: *${text}*\n\n` +
          `*Step 3/5: Theatre*\n` +
          `Which theatre(s)? (comma separated)\n\n` +
          `Popular: ${DEFAULT_THEATRES.join(', ')}\n\n` +
          `Example: AMB Cinemas, PVR Forum`,
          { parse_mode: 'Markdown' }
        );
        return true;

      case 'job_theatre':
        draft.theatres = text.split(',').map(t => t.trim()).filter(Boolean);
        ctx.session.jobDraft = draft;
        ctx.session.step = 'job_date';

        await ctx.reply(
          `✅ Theatre(s): *${draft.theatres.join(', ')}*\n\n` +
          `*Step 4/5: Date*\n` +
          `Which date(s)? (day of month, comma separated)\n\n` +
          `Example: 28, 29, 30\n\n` +
          `Or type "any" for any available date:`,
          { parse_mode: 'Markdown' }
        );
        return true;

      case 'job_date':
        if (text.toLowerCase() !== 'any') {
          draft.preferredDates = text.split(',').map(d => d.trim()).filter(Boolean);
        }
        ctx.session.jobDraft = draft;
        ctx.session.step = 'job_time';

        // Show time range buttons (including midnight premieres for release days)
        const timeKeyboard = new InlineKeyboard()
          .text(TIME_RANGES.midnight.label, 'time:midnight')
          .text(TIME_RANGES.early.label, 'time:early')
          .row()
          .text(TIME_RANGES.morning.label, 'time:morning')
          .text(TIME_RANGES.afternoon.label, 'time:afternoon')
          .row()
          .text(TIME_RANGES.evening.label, 'time:evening')
          .text(TIME_RANGES.night.label, 'time:night')
          .row()
          .text('🕐 Any Time', 'time:any');

        await ctx.reply(
          `✅ Date(s): *${draft.preferredDates?.join(', ') || 'Any'}*\n\n` +
          `*Step 5/6: Preferred Time*\n` +
          `Select your preferred showtime:`,
          { parse_mode: 'Markdown', reply_markup: timeKeyboard }
        );
        return true;

      default:
        ctx.session.step = undefined;
        return false;
    }
  } catch (error) {
    logger.error('Error in job creation flow', { error, step, telegramId });
    ctx.session.step = undefined;
    ctx.session.jobDraft = undefined;
    await ctx.reply('Something went wrong. Please start over with /newjob');
    return true;
  }
}

/**
 * Handle time range selection callback
 */
export async function handleTimeCallback(ctx: MyContext): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData?.startsWith('time:')) return;

  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const timeRange = callbackData.replace('time:', '') as keyof typeof TIME_RANGES | 'any';
  const draft: JobDraft = ctx.session.jobDraft || {};

  // Set preferred times based on selection
  if (timeRange === 'any') {
    draft.preferredTimes = undefined;
  } else {
    draft.preferredTimes = TIME_RANGES[timeRange].times;
  }

  ctx.session.jobDraft = draft;
  ctx.session.step = 'job_seats';

  // Answer callback to remove loading state
  await ctx.answerCallbackQuery();

  // Show seat count buttons
  const seatKeyboard = new InlineKeyboard();
  SEAT_COUNTS.forEach((count, i) => {
    seatKeyboard.text(`${count} 🎫`, `seats:${count}`);
    if ((i + 1) % 3 === 0) seatKeyboard.row();
  });

  const timeLabel = timeRange === 'any'
    ? 'Any Time'
    : TIME_RANGES[timeRange].label;

  await ctx.editMessageText(
    `✅ Time: *${timeLabel}*\n\n` +
    `*Step 6/6: Number of Seats*\n` +
    `How many tickets do you need?`,
    { parse_mode: 'Markdown', reply_markup: seatKeyboard }
  );
}

/**
 * Handle seat count selection callback and create the job
 */
export async function handleSeatsCallback(ctx: MyContext): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData?.startsWith('seats:')) return;

  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const seatCount = parseInt(callbackData.replace('seats:', ''), 10);
  const draft: JobDraft = ctx.session.jobDraft || {};
  draft.seatCount = seatCount;

  // Answer callback
  await ctx.answerCallbackQuery({ text: `Selected ${seatCount} seats` });

  try {
    // Create the job
    const user = await userService.getOrCreate(telegramId);
    const now = new Date();
    const watchUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const job = await jobService.createJob({
      userId: user.id,
      movieName: draft.movieName || 'Unknown',
      city: draft.city || 'hyderabad',
      watchFromDate: now,
      watchUntilDate: watchUntil,
      theatres: draft.theatres || DEFAULT_THEATRES,
      showtimePrefs: {
        preferredDates: draft.preferredDates,
        preferredTimes: draft.preferredTimes,
      },
      seatPrefs: {
        count: seatCount,
        avoidBottomRows: 3,
        preferCenter: true,
        needAdjacent: true,
      },
    });

    // Clear session
    ctx.session.step = undefined;
    ctx.session.jobDraft = undefined;

    logger.info('Interactive job created', { userId: user.id, jobId: job.id });

    // Send notification
    await notificationService.notify(telegramId, {
      type: 'job_created',
      jobId: job.id,
      movieName: draft.movieName,
      theatre: draft.theatres?.join(', '),
    });

    // Update the message with job details
    await ctx.editMessageText(
      `🎉 *Booking Job Created!*\n\n` +
      `Job ID: \`${job.id.substring(0, 8)}\`\n` +
      `Movie: ${draft.movieName}\n` +
      `City: ${draft.city}\n` +
      `Theatre(s): ${draft.theatres?.join(', ')}\n` +
      `Date(s): ${draft.preferredDates?.join(', ') || 'Any'}\n` +
      `Time(s): ${draft.preferredTimes?.join(', ') || 'Any'}\n` +
      `Seats: ${seatCount}\n\n` +
      `I'll monitor for tickets and book automatically!\n\n` +
      `Use /myjobs to see all your jobs.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error creating job from callback', { error, telegramId });
    ctx.session.step = undefined;
    ctx.session.jobDraft = undefined;
    await ctx.editMessageText('Something went wrong. Please start over with /newjob');
  }
}
