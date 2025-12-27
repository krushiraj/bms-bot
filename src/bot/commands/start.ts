import { CommandContext, InlineKeyboard } from 'grammy';
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
    const isNew = user.createdAt.getTime() > Date.now() - 5000;

    const keyboard = new InlineKeyboard()
      .text('New Job', 'menu:newjob')
      .text('My Jobs', 'menu:jobs')
      .row()
      .text('My Cards', 'menu:cards')
      .text('Settings', 'menu:settings');

    let text: string;
    if (isNew) {
      logger.info('New user registered', { telegramId, userId: user.id });
      text = `*Welcome to BMS Bot!*\n\n` +
        `I can help you book movie tickets automatically on BookMyShow.\n\n` +
        `*How it works:*\n` +
        `1. Add your gift cards\n` +
        `2. Create a booking job\n` +
        `3. I'll watch for tickets and book automatically!\n\n` +
        `What would you like to do?`;
    } else {
      text = `*BMS Bot - Main Menu*\n\n` +
        `Welcome back! What would you like to do?`;
    }

    const msg = await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    ctx.session.menuMessageId = msg.message_id;
  } catch (error) {
    logger.error('Error in start command', { error, telegramId });
    await ctx.reply('Something went wrong. Please try again later.');
  }
}
