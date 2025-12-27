import { CommandContext } from 'grammy';
import { MyContext } from '../index.js';

export async function helpCommand(ctx: CommandContext<MyContext>): Promise<void> {
  await ctx.reply(
    `📚 *BMS Bot Commands*\n\n` +
      `*Booking Jobs*\n` +
      `/newjob - Create booking job (interactive)\n` +
      `/quickjob - Quick create: movie|city|theatre|date|time|seats\n` +
      `/myjobs - List your booking jobs\n` +
      `/jobstatus <id> - Check job details\n` +
      `/canceljob <id> - Cancel a job\n\n` +
      `*Account*\n` +
      `/setcontact - Set email & phone for booking\n` +
      `/notifications - Manage notification preferences\n\n` +
      `*Gift Cards*\n` +
      `/addcard - Add a gift card\n` +
      `/mycards - List your cards\n` +
      `/removecard <num> - Remove a card\n\n` +
      `*Other*\n` +
      `/start - Show welcome message\n` +
      `/help - Show this message\n\n` +
      `*Quick Job Example:*\n` +
      `\`/quickjob Pushpa 2 | hyderabad | AMB | 28 | 7:00 PM | 2\``,
    { parse_mode: 'Markdown' }
  );
}
