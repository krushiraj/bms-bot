import { CommandContext, InlineKeyboard } from 'grammy';
import { MyContext } from '../index.js';

export async function helpCommand(ctx: CommandContext<MyContext>): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('New Job', 'menu:newjob')
    .text('My Jobs', 'menu:jobs')
    .row()
    .text('My Cards', 'menu:cards')
    .text('Settings', 'menu:settings');

  const text = `*BMS Bot Help*\n\n` +
    `*Features:*\n` +
    `- Automatic movie ticket booking\n` +
    `- Watch for ticket availability\n` +
    `- Smart seat selection\n` +
    `- Gift card payment support\n\n` +
    `*Quick Commands:*\n` +
    `/start - Main menu\n` +
    `/menu - Show menu\n` +
    `/quickjob - Create job with one command\n\n` +
    `Or use the buttons below:`;

  const msg = await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  ctx.session.menuMessageId = msg.message_id;
}
