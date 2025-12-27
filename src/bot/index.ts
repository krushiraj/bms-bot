import { Bot, session, GrammyError, HttpError, Context, SessionFlavor } from 'grammy';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { startCommand } from './commands/start.js';
import { helpCommand } from './commands/help.js';
import {
  addCardCommand,
  addCardWithArgs,
  myCardsCommand,
  removeCardCommand,
} from './commands/cards.js';
import {
  newJobCommand,
  quickJobCommand,
  myJobsCommand,
  jobStatusCommand,
  cancelJobCommand,
  setContactCommand,
  handleJobMessage,
} from './commands/jobs.js';

export interface JobDraft {
  movieName?: string;
  city?: string;
  theatres?: string[];
  preferredDates?: string[];
  preferredTimes?: string[];
  seatCount?: number;
}

export interface SessionData {
  step?: string;
  jobDraft?: JobDraft;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export const bot = new Bot<MyContext>(config.telegramBotToken);

// Session middleware
bot.use(
  session({
    initial: (): SessionData => ({}),
  })
);

// Register commands
bot.command('start', startCommand);
bot.command('help', helpCommand);

// Gift card commands
bot.command('addcard', async (ctx) => {
  const args = ctx.match?.toString().split(/\s+/).filter(Boolean) ?? [];
  if (args.length >= 2) {
    await addCardWithArgs(ctx, args);
  } else {
    await addCardCommand(ctx);
  }
});
bot.command('mycards', myCardsCommand);
bot.command('removecard', async (ctx) => {
  const args = ctx.match?.toString().split(/\s+/).filter(Boolean) ?? [];
  await removeCardCommand(ctx, args);
});

// Job commands
bot.command('newjob', newJobCommand);
bot.command('quickjob', quickJobCommand);
bot.command('myjobs', myJobsCommand);
bot.command('jobstatus', jobStatusCommand);
bot.command('canceljob', cancelJobCommand);
bot.command('setcontact', setContactCommand);

// Handle messages for interactive job creation
bot.on('message:text', async (ctx, next) => {
  const handled = await handleJobMessage(ctx);
  if (!handled) {
    await next();
  }
});

// Error handler
bot.catch((err) => {
  const ctx = err.ctx;
  logger.error(`Error while handling update ${ctx.update.update_id}:`, {
    error: err.error,
  });

  if (err.error instanceof GrammyError) {
    logger.error('Error in request:', { description: err.error.description });
  } else if (err.error instanceof HttpError) {
    logger.error('Could not contact Telegram:', { error: err.error });
  } else {
    logger.error('Unknown error:', { error: err.error });
  }
});

export async function startBot(): Promise<void> {
  logger.info('Starting Telegram bot...');

  // Set bot commands menu
  await bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot and register' },
    { command: 'help', description: 'Show available commands' },
    { command: 'newjob', description: 'Create a new booking job (interactive)' },
    { command: 'quickjob', description: 'Quick job: movie|city|theatre|date|time|seats' },
    { command: 'myjobs', description: 'List your booking jobs' },
    { command: 'jobstatus', description: 'Check job status' },
    { command: 'canceljob', description: 'Cancel a booking job' },
    { command: 'setcontact', description: 'Set email and phone for booking' },
    { command: 'addcard', description: 'Add a gift card' },
    { command: 'mycards', description: 'List your gift cards' },
  ]);

  // Start polling
  bot.start({
    onStart: (botInfo) => {
      logger.info(`Bot started as @${botInfo.username}`);
    },
  });
}

export async function stopBot(): Promise<void> {
  await bot.stop();
  logger.info('Bot stopped');
}
