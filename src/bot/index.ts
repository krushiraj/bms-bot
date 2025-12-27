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
  handleTimeCallback,
  handleSeatsCallback,
} from './commands/jobs.js';
import {
  notificationsCommand,
  handleNotificationCallback,
} from './commands/settings.js';
import {
  showMainMenu,
  showJobsList,
  showJobDetail,
  showCancelJobConfirm,
  cancelJob,
  showCardsList,
  showCardDetail,
  showRemoveCardConfirm,
  removeCard,
  showAddCardPrompt,
  showSettings,
  showNotifications,
  toggleNotification,
  showContactInfo,
  showContactPrompt,
  showNewJobStart,
  showCitySelection,
  showTheatrePrompt,
  showDateSelection,
  toggleDateSelection,
  showFormatSelection,
  toggleFormatSelection,
  showLanguageSelection,
  toggleLanguageSelection,
  showScreenSelection,
  toggleScreenSelection,
} from './menus/index.js';
import { userService } from '../services/userService.js';
import { giftCardService } from '../services/giftCardService.js';

export interface JobDraft {
  movieName?: string;
  city?: string;
  theatres?: string[];
  preferredDates?: string[];
  preferredFormats?: string[];
  preferredLanguages?: string[];
  preferredScreens?: string[];
  preferredTimes?: string[];
  seatCount?: number;
}

export interface SessionData {
  step?: string;
  jobDraft?: JobDraft;
  menuMessageId?: number;
  selectedDates?: string[];
  selectedFormats?: string[];
  selectedLanguages?: string[];
  selectedScreens?: string[];
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

// Settings commands
bot.command('notifications', notificationsCommand);

// Menu command
bot.command('menu', async (ctx) => {
  const msg = await ctx.reply('Loading menu...', { parse_mode: 'Markdown' });
  ctx.session.menuMessageId = msg.message_id;
  await showMainMenu(ctx);
});

// Handle messages for interactive flows
bot.on('message:text', async (ctx, next) => {
  const step = ctx.session.step;
  const text = ctx.message.text?.trim();
  const telegramId = ctx.from?.id.toString();

  if (!text || !telegramId) {
    await next();
    return;
  }

  // Card add flow
  if (step === 'card_add') {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('Please provide both card number and PIN separated by space.');
      return;
    }

    const [cardNumber, pin] = parts;
    if (!cardNumber || !pin) {
      await ctx.reply('Please provide both card number and PIN.');
      return;
    }

    if (cardNumber.length < 10 || cardNumber.length > 20) {
      await ctx.reply('Invalid card number format.');
      return;
    }

    if (pin.length < 4 || pin.length > 8) {
      await ctx.reply('PIN must be 4-8 digits.');
      return;
    }

    try {
      const user = await userService.getOrCreate(telegramId);
      await giftCardService.addCard(user.id, cardNumber, pin);

      // Delete message for security
      try {
        await ctx.deleteMessage();
      } catch {
        // May fail if bot doesn't have delete permission
      }

      ctx.session.step = undefined;

      const { InlineKeyboard } = await import('grammy');
      const kb = new InlineKeyboard()
        .text('My Cards', 'menu:cards')
        .text('Main Menu', 'menu:main');

      await ctx.reply(
        `*Card Added!*\n\nCard ****${cardNumber.slice(-4)} has been saved securely.`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
    } catch (error) {
      logger.error('Error adding card', { error });
      await ctx.reply('Failed to add card. Please try again.');
    }
    return;
  }

  // Contact update flow
  if (step === 'contact_update') {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply('Please provide both email and phone separated by space.');
      return;
    }

    const [email, phone] = parts;
    if (!email || !phone) {
      await ctx.reply('Please provide both email and phone.');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      await ctx.reply('Please enter a valid email address.');
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      await ctx.reply('Please enter a valid 10-digit phone number.');
      return;
    }

    try {
      const user = await userService.getOrCreate(telegramId);
      await userService.updateContactInfo(user.id, { email, phone });

      // Delete message for privacy
      try {
        await ctx.deleteMessage();
      } catch {
        // May fail if bot doesn't have delete permission
      }

      ctx.session.step = undefined;

      const { InlineKeyboard } = await import('grammy');
      const kb = new InlineKeyboard()
        .text('Settings', 'settings:main')
        .text('Main Menu', 'menu:main');

      await ctx.reply(
        `*Contact Updated!*\n\nEmail: ${email}\nPhone: ****${phone.slice(-4)}`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
    } catch (error) {
      logger.error('Error updating contact', { error });
      await ctx.reply('Failed to update contact. Please try again.');
    }
    return;
  }

  // Existing job message handler
  const handled = await handleJobMessage(ctx);
  if (!handled) {
    await next();
  }
});

// Handle all callback queries
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;

  try {
    // Menu navigation
    if (data === 'menu:main') {
      ctx.session.step = undefined;
      ctx.session.selectedDates = undefined;
      await showMainMenu(ctx);
    } else if (data === 'menu:jobs') {
      await showJobsList(ctx);
    } else if (data === 'menu:cards') {
      await showCardsList(ctx);
    } else if (data === 'menu:settings') {
      await showSettings(ctx);
    } else if (data === 'menu:newjob') {
      await showNewJobStart(ctx);
    }

    // Job actions
    else if (data.startsWith('job:view:')) {
      await showJobDetail(ctx, data.replace('job:view:', ''));
    } else if (data.startsWith('job:cancel:')) {
      await showCancelJobConfirm(ctx, data.replace('job:cancel:', ''));
    } else if (data.startsWith('job:confirm_cancel:')) {
      await cancelJob(ctx, data.replace('job:confirm_cancel:', ''));
    } else if (data === 'job:back:city') {
      ctx.session.step = 'job_city';
      await showCitySelection(ctx);
    } else if (data === 'job:back:theatre') {
      ctx.session.step = 'job_theatre';
      await showTheatrePrompt(ctx);
    }

    // City selection
    else if (data.startsWith('city:')) {
      const city = data.replace('city:', '');
      if (city === 'other') {
        ctx.session.step = 'job_city_text';
        await ctx.editMessageText(
          `*Create New Booking Job*\n\n` +
          `Movie: *${ctx.session.jobDraft?.movieName}*\n\n` +
          `*Step 2/5: City*\n\n` +
          `Type your city name:`,
          { parse_mode: 'Markdown' }
        );
      } else {
        ctx.session.jobDraft = { ...ctx.session.jobDraft, city };
        ctx.session.step = 'job_theatre';
        await showTheatrePrompt(ctx);
      }
    }

    // Date selection
    else if (data.startsWith('date:toggle:')) {
      await toggleDateSelection(ctx, data.replace('date:toggle:', ''));
    } else if (data === 'date:any') {
      ctx.session.selectedDates = [];
      ctx.session.jobDraft = { ...ctx.session.jobDraft, preferredDates: undefined };
      ctx.session.step = 'job_format';
      ctx.session.selectedFormats = [];
      await showFormatSelection(ctx);
    } else if (data === 'date:done') {
      const selectedDates = ctx.session.selectedDates || [];
      ctx.session.jobDraft = { ...ctx.session.jobDraft, preferredDates: selectedDates };
      ctx.session.step = 'job_format';
      ctx.session.selectedFormats = [];
      await showFormatSelection(ctx);
    }

    // Format selection
    else if (data.startsWith('format:toggle:')) {
      await toggleFormatSelection(ctx, data.replace('format:toggle:', ''));
    } else if (data === 'format:any') {
      ctx.session.selectedFormats = [];
      ctx.session.jobDraft = { ...ctx.session.jobDraft, preferredFormats: undefined };
      ctx.session.step = 'job_lang';
      ctx.session.selectedLanguages = [];
      await showLanguageSelection(ctx);
    } else if (data === 'format:done') {
      const selectedFormats = ctx.session.selectedFormats || [];
      ctx.session.jobDraft = { ...ctx.session.jobDraft, preferredFormats: selectedFormats.length > 0 ? selectedFormats : undefined };
      ctx.session.step = 'job_lang';
      ctx.session.selectedLanguages = [];
      await showLanguageSelection(ctx);
    } else if (data === 'job:back:format') {
      ctx.session.step = 'job_format';
      await showFormatSelection(ctx);
    }

    // Language selection
    else if (data.startsWith('lang:toggle:')) {
      await toggleLanguageSelection(ctx, data.replace('lang:toggle:', ''));
    } else if (data === 'lang:any') {
      ctx.session.selectedLanguages = [];
      ctx.session.jobDraft = { ...ctx.session.jobDraft, preferredLanguages: undefined };
      ctx.session.step = 'job_screen';
      ctx.session.selectedScreens = [];
      await showScreenSelection(ctx);
    } else if (data === 'lang:done') {
      const selectedLanguages = ctx.session.selectedLanguages || [];
      ctx.session.jobDraft = { ...ctx.session.jobDraft, preferredLanguages: selectedLanguages.length > 0 ? selectedLanguages : undefined };
      ctx.session.step = 'job_screen';
      ctx.session.selectedScreens = [];
      await showScreenSelection(ctx);
    } else if (data === 'job:back:lang') {
      ctx.session.step = 'job_lang';
      await showLanguageSelection(ctx);
    }

    // Screen selection
    else if (data.startsWith('screen:toggle:')) {
      await toggleScreenSelection(ctx, data.replace('screen:toggle:', ''));
    } else if (data === 'screen:any') {
      ctx.session.selectedScreens = [];
      ctx.session.jobDraft = { ...ctx.session.jobDraft, preferredScreens: undefined };
      ctx.session.step = 'job_time';
      await handleTimeSelection(ctx);
    } else if (data === 'screen:done') {
      const selectedScreens = ctx.session.selectedScreens || [];
      ctx.session.jobDraft = { ...ctx.session.jobDraft, preferredScreens: selectedScreens.length > 0 ? selectedScreens : undefined };
      ctx.session.step = 'job_time';
      await handleTimeSelection(ctx);
    } else if (data === 'job:back:screen') {
      ctx.session.step = 'job_screen';
      await showScreenSelection(ctx);
    } else if (data === 'job:back:dates') {
      ctx.session.step = 'job_date';
      await showDateSelection(ctx);
    }

    // Time and seats (existing handlers)
    else if (data.startsWith('time:')) {
      await handleTimeCallback(ctx);
    } else if (data.startsWith('seats:')) {
      await handleSeatsCallback(ctx);
    }

    // Card actions
    else if (data === 'card:add') {
      await showAddCardPrompt(ctx);
    } else if (data.startsWith('card:view:')) {
      await showCardDetail(ctx, data.replace('card:view:', ''));
    } else if (data.startsWith('card:remove:')) {
      await showRemoveCardConfirm(ctx, data.replace('card:remove:', ''));
    } else if (data.startsWith('card:confirm_remove:')) {
      await removeCard(ctx, data.replace('card:confirm_remove:', ''));
    }

    // Settings
    else if (data === 'settings:main') {
      await showSettings(ctx);
    } else if (data === 'settings:notifications') {
      await showNotifications(ctx);
    } else if (data === 'settings:contact') {
      await showContactInfo(ctx);
    } else if (data.startsWith('notify:')) {
      await toggleNotification(ctx, data.replace('notify:', ''));
    } else if (data === 'contact:update') {
      await showContactPrompt(ctx);
    }

    // Answer callback if not already answered
    if (!ctx.callbackQuery.data.startsWith('notify:')) {
      await ctx.answerCallbackQuery().catch(() => {});
    }
  } catch (error) {
    logger.error('Callback query error', { error: String(error), data });
    await ctx.answerCallbackQuery({ text: 'Something went wrong' }).catch(() => {});
  }
});

// Helper function for time selection
async function handleTimeSelection(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};
  const TIME_RANGES = {
    midnight: { label: 'Midnight', times: ['12:00 AM', '1:00 AM', '2:00 AM', '3:00 AM'] },
    early: { label: 'Early (4-8 AM)', times: ['4:00 AM', '5:00 AM', '6:00 AM', '7:00 AM', '8:00 AM'] },
    morning: { label: 'Morning', times: ['9:00 AM', '10:00 AM', '11:00 AM'] },
    afternoon: { label: 'Afternoon', times: ['12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM'] },
    evening: { label: 'Evening', times: ['4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM'] },
    night: { label: 'Night', times: ['8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'] },
  };

  const { InlineKeyboard } = await import('grammy');
  const timeKeyboard = new InlineKeyboard()
    .text(TIME_RANGES.midnight.label, 'time:midnight')
    .text(TIME_RANGES.early.label, 'time:early')
    .row()
    .text(TIME_RANGES.morning.label, 'time:morning')
    .text(TIME_RANGES.afternoon.label, 'time:afternoon')
    .row()
    .text(TIME_RANGES.evening.label, 'time:evening')
    .text(TIME_RANGES.night.label, 'time:night')
    .row()
    .text('Any Time', 'time:any')
    .row()
    .text('Back', 'job:back:screen')
    .text('Cancel', 'menu:main');

  await ctx.editMessageText(
    `*Create New Booking Job*\n\n` +
    `Movie: *${draft.movieName}*\n` +
    `City: *${draft.city}*\n` +
    `Theatre(s): *${draft.theatres?.join(', ')}*\n` +
    `Date(s): *${draft.preferredDates?.join(', ') || 'Any'}*\n` +
    `Format: *${draft.preferredFormats?.join(', ') || 'Any'}*\n` +
    `Language: *${draft.preferredLanguages?.join(', ') || 'Any'}*\n` +
    `Screen: *${draft.preferredScreens?.join(', ') || 'Any'}*\n\n` +
    `*Step 8/8: Preferred Time*\n\n` +
    `Select your preferred showtime:`,
    { parse_mode: 'Markdown', reply_markup: timeKeyboard }
  );
}

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
    { command: 'notifications', description: 'Manage notification preferences' },
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
