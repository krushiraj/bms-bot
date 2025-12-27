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
  | 'job_expired';

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
