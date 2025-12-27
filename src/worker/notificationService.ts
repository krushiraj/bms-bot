import { bot } from '../bot/index.js';
import { InputFile } from 'grammy';
import { logger } from '../utils/logger.js';
import { prisma } from '../db/client.js';

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
  | 'preference_mismatch'
  | 'theatre_not_found'
  | 'movie_not_found'
  | 'job_paused'
  | 'job_resumed';

// Important notifications that are always sent (success/failure outcomes)
const IMPORTANT_NOTIFICATIONS: NotificationType[] = [
  'booking_success',
  'booking_failed',
  'job_completed',
  'job_failed',
  'job_expired',
];

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

/**
 * Service to send Telegram notifications to users about job status updates
 */
export class NotificationService {
  /**
   * Check if notification should be sent based on user/job preferences
   */
  private async shouldNotify(jobId: string, type: NotificationType): Promise<boolean> {
    // Important notifications are always sent
    if (IMPORTANT_NOTIFICATIONS.includes(type)) {
      return true;
    }

    try {
      // Get job with user to check preferences
      const job = await prisma.bookingJob.findUnique({
        where: { id: jobId },
        include: { user: true },
      });

      if (!job) {
        return true; // Default to sending if job not found
      }

      // Job-level preference overrides user-level
      const notifyOnlySuccess = job.notifyOnlySuccess ?? job.user.notifyOnlySuccess;

      if (notifyOnlySuccess) {
        logger.debug('Skipping notification (notifyOnlySuccess enabled)', { jobId, type });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking notification preferences', { jobId, error: String(error) });
      return true; // Default to sending on error
    }
  }

  /**
   * Send a notification to a user via Telegram
   */
  async notify(chatId: string | number, payload: NotificationPayload): Promise<boolean> {
    try {
      // Check if we should send this notification
      const shouldSend = await this.shouldNotify(payload.jobId, payload.type);
      if (!shouldSend) {
        return true; // Return success since skipping is intentional
      }

      const message = this.formatMessage(payload);

      await bot.api.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });

      logger.info('Notification sent', {
        chatId,
        type: payload.type,
        jobId: payload.jobId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to send notification', {
        chatId,
        type: payload.type,
        error: String(error),
      });
      return false;
    }
  }

  /**
   * Send a notification with a screenshot attachment
   */
  async notifyWithScreenshot(
    chatId: string | number,
    payload: NotificationPayload,
    screenshotPath: string
  ): Promise<boolean> {
    try {
      const caption = this.formatMessage(payload);

      // Send photo with caption
      await bot.api.sendPhoto(
        chatId,
        new InputFile(screenshotPath),
        {
          caption: caption.substring(0, 1024), // Telegram caption limit
          parse_mode: 'HTML',
        }
      );

      logger.info('Notification with screenshot sent', {
        chatId,
        type: payload.type,
        jobId: payload.jobId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to send notification with screenshot', {
        chatId,
        error: String(error),
      });

      // Fallback to text-only notification
      return this.notify(chatId, payload);
    }
  }

  /**
   * Format the notification message based on type
   */
  private formatMessage(payload: NotificationPayload): string {
    const { type, jobId, movieName, theatre, showtime, seats, bookingId, error, totalAmount } =
      payload;

    const jobIdShort = jobId.substring(0, 8);

    switch (type) {
      case 'job_created':
        return (
          `<b>New Booking Job Created</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `Movie: ${movieName || 'N/A'}\n` +
          `Theatre: ${theatre || 'Any'}\n` +
          `Showtime: ${showtime || 'Any'}\n\n` +
          `Status: Watching for tickets...`
        );

      case 'job_started':
        return (
          `<b>Job Started</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `Now monitoring for ticket availability.`
        );

      case 'tickets_found':
        return (
          `<b>Tickets Available!</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `Movie: ${movieName || 'N/A'}\n` +
          `Theatre: ${theatre || 'N/A'}\n` +
          (showtime ? `Showtime: ${showtime}\n` : '') +
          `\nStarting booking process...`
        );

      case 'booking_started':
        return (
          `<b>Booking In Progress</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `Selecting seats and proceeding to payment...`
        );

      case 'booking_success':
        return (
          `<b>Booking Successful!</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `Movie: ${movieName}\n` +
          `Theatre: ${theatre}\n` +
          `Showtime: ${showtime}\n` +
          `Seats: ${seats?.join(', ') || 'N/A'}\n` +
          (bookingId ? `Booking ID: <code>${bookingId}</code>\n` : '') +
          (totalAmount ? `Amount: ₹${totalAmount}\n` : '') +
          `\nYour tickets have been booked!`
        );

      case 'booking_failed':
        return (
          `<b>Booking Failed</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `Error: ${error || 'Unknown error'}\n\n` +
          `Will retry if attempts remaining.`
        );

      case 'job_completed':
        return (
          `<b>Job Completed</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `The booking job has finished successfully.`
        );

      case 'job_failed':
        return (
          `<b>Job Failed</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `Error: ${error || 'Max retries exceeded'}\n\n` +
          `Please create a new job to try again.`
        );

      case 'job_expired':
        return (
          `<b>Job Expired</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `The job has expired without finding tickets.\n` +
          `Create a new job if you still want to book.`
        );

      case 'preference_mismatch': {
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
      }

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

      default:
        return (
          `<b>Job Update</b>\n\n` +
          `Job ID: <code>${jobIdShort}</code>\n` +
          `Status: ${type}`
        );
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
