import { CommandContext } from 'grammy';
import { MyContext } from '../index.js';

export async function helpCommand(ctx: CommandContext<MyContext>): Promise<void> {
  await ctx.reply(
    `📚 *BMS Bot Commands*\n\n` +
      `*Booking*\n` +
      `/newjob - Create a new booking job\n` +
      `/myjobs - List your active jobs\n` +
      `/cancel <id> - Cancel a job\n\n` +
      `*Gift Cards*\n` +
      `/addcard - Add a gift card\n` +
      `/mycards - List your cards\n` +
      `/removecard <id> - Remove a card\n\n` +
      `*Other*\n` +
      `/start - Show welcome message\n` +
      `/help - Show this message`,
    { parse_mode: 'Markdown' }
  );
}
