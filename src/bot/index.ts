import { Bot, session, GrammyError, HttpError, Context, SessionFlavor } from 'grammy';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { startCommand } from './commands/start.js';
import { helpCommand } from './commands/help.js';

export interface SessionData {
  step?: string;
  jobDraft?: Record<string, unknown>;
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
    { command: 'newjob', description: 'Create a new booking job' },
    { command: 'myjobs', description: 'List your booking jobs' },
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
