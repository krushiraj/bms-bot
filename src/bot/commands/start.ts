import { CommandContext } from 'grammy';
import { userService } from '../../services/userService.js';
import { logger } from '../../utils/logger.js';
import { MyContext } from '../index.js';

export async function startCommand(ctx: CommandContext<MyContext>): Promise<void> {
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    await ctx.reply('Could not identify you. Please try again.');
    return;
  }

  try {
    const user = await userService.getOrCreate(telegramId);
    const isNew = user.createdAt.getTime() > Date.now() - 5000; // Created in last 5 seconds

    if (isNew) {
      logger.info('New user registered', { telegramId, userId: user.id });
      await ctx.reply(
        `Welcome to BMS Bot! 🎬\n\n` +
          `I can help you book movie tickets automatically on BookMyShow.\n\n` +
          `Here's how it works:\n` +
          `1. Add your gift cards with /addcard\n` +
          `2. Create a booking job with /newjob\n` +
          `3. I'll watch for tickets and book automatically!\n\n` +
          `Use /help to see all commands.`
      );
    } else {
      await ctx.reply(
        `Welcome back! 👋\n\n` +
          `Use /help to see available commands, or /newjob to create a booking.`
      );
    }
  } catch (error) {
    logger.error('Error in start command', { error, telegramId });
    await ctx.reply('Something went wrong. Please try again later.');
  }
}
