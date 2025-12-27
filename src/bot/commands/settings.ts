import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { userService } from '../../services/userService.js';
import { logger } from '../../utils/logger.js';
import { MyContext } from '../index.js';

/**
 * Show and manage notification settings
 * /notifications - Show current settings with toggle buttons
 */
export async function notificationsCommand(ctx: CommandContext<MyContext>): Promise<void> {
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

    const currentSetting = user.notifyOnlySuccess ? 'Success only' : 'All updates';

    const keyboard = new InlineKeyboard()
      .text(
        user.notifyOnlySuccess ? '✓ Success only' : 'Success only',
        'notify:success_only'
      )
      .text(
        !user.notifyOnlySuccess ? '✓ All updates' : 'All updates',
        'notify:all'
      );

    await ctx.reply(
      `*Notification Settings*\n\n` +
      `Current: *${currentSetting}*\n\n` +
      `• *All updates*: Get notifications for every step (job started, tickets found, booking progress)\n\n` +
      `• *Success only*: Only get notified on booking success or failure\n\n` +
      `Choose your preference:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    logger.error('Error showing notification settings', { error, telegramId });
    await ctx.reply('Failed to load settings. Please try again.');
  }
}

/**
 * Handle notification preference button callbacks
 */
export async function handleNotificationCallback(ctx: MyContext): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData?.startsWith('notify:')) return;

  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const preference = callbackData.replace('notify:', '');
  const notifyOnlySuccess = preference === 'success_only';

  try {
    await userService.updateNotificationPreference(telegramId, notifyOnlySuccess);

    const newSetting = notifyOnlySuccess ? 'Success only' : 'All updates';

    const keyboard = new InlineKeyboard()
      .text(
        notifyOnlySuccess ? '✓ Success only' : 'Success only',
        'notify:success_only'
      )
      .text(
        !notifyOnlySuccess ? '✓ All updates' : 'All updates',
        'notify:all'
      );

    await ctx.answerCallbackQuery({ text: `Updated to: ${newSetting}` });

    await ctx.editMessageText(
      `*Notification Settings*\n\n` +
      `Current: *${newSetting}*\n\n` +
      `• *All updates*: Get notifications for every step (job started, tickets found, booking progress)\n\n` +
      `• *Success only*: Only get notified on booking success or failure\n\n` +
      `Choose your preference:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );

    logger.info('Notification preference updated', { telegramId, notifyOnlySuccess });
  } catch (error) {
    logger.error('Error updating notification preference', { error, telegramId });
    await ctx.answerCallbackQuery({ text: 'Failed to update. Please try again.' });
  }
}
