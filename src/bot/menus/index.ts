// src/bot/menus/index.ts
import { InlineKeyboard } from 'grammy';
import { MyContext } from '../index.js';
import { userService } from '../../services/userService.js';
import { jobService } from '../../worker/jobService.js';
import { giftCardService } from '../../services/giftCardService.js';
import { logger } from '../../utils/logger.js';
import {
  mainMenuKeyboard,
  cityKeyboard,
  dateKeyboard,
  formatKeyboard,
  languageKeyboard,
  screenKeyboard,
  jobListKeyboard,
  jobDetailKeyboard,
  confirmCancelJobKeyboard,
  cardListKeyboard,
  cardDetailKeyboard,
  confirmRemoveCardKeyboard,
  settingsKeyboard,
  notificationKeyboard,
  contactKeyboard,
  cancelKeyboard,
  mismatchOptionsKeyboard,
  mismatchTimesKeyboard,
  mismatchActionKeyboard,
} from './keyboards.js';

// Helper to edit message or send new if edit fails
async function editOrSend(
  ctx: MyContext,
  text: string,
  keyboard: InlineKeyboard
): Promise<void> {
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } catch {
    // Message might be too old or unchanged, send new one
    const msg = await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    ctx.session.menuMessageId = msg.message_id;
  }
}

// ============ MAIN MENU ============

export async function showMainMenu(ctx: MyContext): Promise<void> {
  const text = `*BMS Bot - Main Menu*\n\nWhat would you like to do?`;
  await editOrSend(ctx, text, mainMenuKeyboard());
}

// ============ JOBS ============

export async function showJobsList(ctx: MyContext): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) {
    await editOrSend(ctx, 'Please use /start to register first.', mainMenuKeyboard());
    return;
  }

  const jobs = await jobService.getActiveJobsByUser(user.id);

  if (jobs.length === 0) {
    const kb = new InlineKeyboard()
      .text('Create New Job', 'menu:newjob')
      .row()
      .text('Back', 'menu:main');
    await editOrSend(ctx, `*Your Booking Jobs*\n\nYou don't have any active jobs.`, kb);
    return;
  }

  const statusEmoji: Record<string, string> = {
    PENDING: '⏳',
    WATCHING: '👀',
    BOOKING: '🎫',
    AWAITING_CONSENT: '❓',
    AWAITING_INPUT: '⚠️',
    PAUSED: '⏸️',
    SUCCESS: '✅',
    FAILED: '❌',
    CANCELLED: '🚫',
  };

  let text = `*Your Booking Jobs*\n\n`;
  for (let i = 0; i < Math.min(jobs.length, 6); i++) {
    const job = jobs[i];
    if (!job) continue;
    const emoji = statusEmoji[job.status] || '❓';
    const prefs = job.showtimePrefs as { preferredDates?: string[] };
    const seatPrefs = job.seatPrefs as { count?: number };
    text += `${i + 1}. ${emoji} *${job.movieName}* - ${job.status}\n`;
    text += `   ${job.theatres[0] || 'Any'} | ${prefs.preferredDates?.[0] || 'Any'} | ${seatPrefs.count || 2} seats\n\n`;
  }

  await editOrSend(ctx, text, jobListKeyboard(jobs));
}

export async function showJobDetail(ctx: MyContext, jobId: string): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) return;

  const job = await jobService.getJobById(jobId);
  if (!job || job.userId !== user.id) {
    await showJobsList(ctx);
    return;
  }

  const statusEmoji: Record<string, string> = {
    PENDING: '⏳',
    WATCHING: '👀',
    BOOKING: '🎫',
    AWAITING_CONSENT: '❓',
    AWAITING_INPUT: '⚠️',
    PAUSED: '⏸️',
    SUCCESS: '✅',
    FAILED: '❌',
    CANCELLED: '🚫',
  };

  const prefs = job.showtimePrefs as {
    preferredDates?: string[];
    preferredTimes?: string[];
    preferredFormats?: string[];
    preferredLanguages?: string[];
    preferredScreens?: string[];
  };
  const seatPrefs = job.seatPrefs as { count?: number };
  const emoji = statusEmoji[job.status] || '❓';

  const watchUntil = job.watchUntilDate.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  let text = `*Job Details*\n\n` +
    `*${job.movieName}*\n` +
    `${job.city} - ${job.theatres.join(', ')}\n` +
    `Date: ${prefs.preferredDates?.join(', ') || 'Any'}\n` +
    `Time: ${prefs.preferredTimes?.[0] || 'Any'}\n`;

  // Add format, language, screen if set
  if (prefs.preferredFormats?.length) {
    text += `Format: ${prefs.preferredFormats.join(', ')}\n`;
  }
  if (prefs.preferredLanguages?.length) {
    text += `Language: ${prefs.preferredLanguages.join(', ')}\n`;
  }
  if (prefs.preferredScreens?.length) {
    text += `Screen: ${prefs.preferredScreens.join(', ')} _(preferred)_\n`;
  }

  text += `Seats: ${seatPrefs.count || 2}\n` +
    `${emoji} Status: ${job.status}\n\n` +
    `Watch until: ${watchUntil}`;

  // Add status-specific message
  let statusMessage = '';
  if (job.status === 'AWAITING_INPUT') {
    statusMessage = '\n\n⚠️ *Action Required:* Please respond to the preference mismatch notification.';
  } else if (job.status === 'PAUSED') {
    statusMessage = '\n\n⏸️ *Status:* Job is paused. Resume or cancel to continue.';
  }

  text += statusMessage;

  // For PAUSED jobs, show Resume button instead of normal Cancel button
  let keyboard;
  if (job.status === 'PAUSED') {
    keyboard = new InlineKeyboard()
      .text('▶️ Resume Job', `mismatch:keep:${jobId}`)
      .row()
      .text('🚫 Cancel Job', `job:cancel:${jobId}`)
      .row()
      .text('◀️ Back to Jobs', 'menu:jobs');
  } else {
    keyboard = jobDetailKeyboard(jobId);
  }

  await editOrSend(ctx, text, keyboard);
}

export async function showCancelJobConfirm(ctx: MyContext, jobId: string): Promise<void> {
  const job = await jobService.getJobById(jobId);
  if (!job) {
    await showJobsList(ctx);
    return;
  }

  const text = `*Cancel Job?*\n\n` +
    `Are you sure you want to cancel the booking job for *${job.movieName}*?`;

  await editOrSend(ctx, text, confirmCancelJobKeyboard(jobId));
}

export async function cancelJob(ctx: MyContext, jobId: string): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) return;

  const job = await jobService.getJobById(jobId);
  if (!job || job.userId !== user.id) {
    await showJobsList(ctx);
    return;
  }

  await jobService.cancelJob(jobId);
  logger.info('Job cancelled via button', { jobId, telegramId });

  const kb = new InlineKeyboard()
    .text('My Jobs', 'menu:jobs')
    .text('Main Menu', 'menu:main');

  await editOrSend(
    ctx,
    `*Job Cancelled*\n\n*${job.movieName}* booking job has been cancelled.`,
    kb
  );
}

// ============ CARDS ============

export async function showCardsList(ctx: MyContext): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) {
    await editOrSend(ctx, 'Please use /start to register first.', mainMenuKeyboard());
    return;
  }

  const cards = await giftCardService.listCards(user.id);

  if (cards.length === 0) {
    const kb = new InlineKeyboard()
      .text('Add Card', 'card:add')
      .row()
      .text('Back', 'menu:main');
    await editOrSend(ctx, `*Your Gift Cards*\n\nYou don't have any gift cards saved.`, kb);
    return;
  }

  let text = `*Your Gift Cards*\n\n`;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card) continue;
    const balance = card.balance !== null ? `Rs.${card.balance}` : 'Unknown';
    text += `${i + 1}. ${card.maskedNumber} - ${balance}\n`;
    text += `   Added: ${card.addedAt.toLocaleDateString()}\n\n`;
  }

  await editOrSend(ctx, text, cardListKeyboard(cards));
}

export async function showCardDetail(ctx: MyContext, cardId: string): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) return;

  const cards = await giftCardService.listCards(user.id);
  const card = cards.find(c => c.id === cardId);

  if (!card) {
    await showCardsList(ctx);
    return;
  }

  const balance = card.balance !== null ? `Rs.${card.balance}` : 'Unknown';
  const text = `*Card Details*\n\n` +
    `Card: ${card.maskedNumber}\n` +
    `Balance: ${balance}\n` +
    `Added: ${card.addedAt.toLocaleDateString()}`;

  await editOrSend(ctx, text, cardDetailKeyboard(cardId));
}

export async function showRemoveCardConfirm(ctx: MyContext, cardId: string): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) return;

  const cards = await giftCardService.listCards(user.id);
  const card = cards.find(c => c.id === cardId);

  if (!card) {
    await showCardsList(ctx);
    return;
  }

  const text = `*Remove Card?*\n\n` +
    `Are you sure you want to remove card ${card.maskedNumber}?`;

  await editOrSend(ctx, text, confirmRemoveCardKeyboard(cardId));
}

export async function removeCard(ctx: MyContext, cardId: string): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) return;

  const cards = await giftCardService.listCards(user.id);
  const card = cards.find(c => c.id === cardId);

  if (!card) {
    await showCardsList(ctx);
    return;
  }

  await giftCardService.removeCard(user.id, cardId);
  logger.info('Card removed via button', { cardId, telegramId });

  const kb = new InlineKeyboard()
    .text('My Cards', 'menu:cards')
    .text('Main Menu', 'menu:main');

  await editOrSend(
    ctx,
    `*Card Removed*\n\nCard ${card.maskedNumber} has been removed.`,
    kb
  );
}

export async function showAddCardPrompt(ctx: MyContext): Promise<void> {
  ctx.session.step = 'card_add';

  const text = `*Add Gift Card*\n\n` +
    `Enter card number and PIN separated by space:\n\n` +
    `Example: \`1234567890123456 123456\``;

  await editOrSend(ctx, text, cancelKeyboard());
}

// ============ SETTINGS ============

export async function showSettings(ctx: MyContext): Promise<void> {
  await editOrSend(ctx, `*Settings*`, settingsKeyboard());
}

export async function showNotifications(ctx: MyContext): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) return;

  const text = `*Notification Preferences*\n\n` +
    `- *All updates*: Get notified for every step\n` +
    `- *Success only*: Only booking success/failure\n\n` +
    `Tap to select:`;

  await editOrSend(ctx, text, notificationKeyboard(user.notifyOnlySuccess));
}

export async function toggleNotification(ctx: MyContext, mode: string): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const notifyOnlySuccess = mode === 'success_only';
  await userService.updateNotificationPreference(telegramId, notifyOnlySuccess);

  await ctx.answerCallbackQuery({ text: `Updated to: ${notifyOnlySuccess ? 'Success only' : 'All updates'}` });
  await showNotifications(ctx);
}

export async function showContactInfo(ctx: MyContext): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) return;

  const hasContact = Boolean(user.email && user.phone);

  let text: string;
  if (hasContact) {
    const maskedPhone = user.phone ? `****${user.phone.slice(-4)}` : 'Not set';
    text = `*Contact Info*\n\n` +
      `Email: ${user.email}\n` +
      `Phone: ${maskedPhone}\n\n` +
      `This info is used for BMS booking confirmation.`;
  } else {
    text = `*Contact Info*\n\n` +
      `No contact info set yet.\n` +
      `Required for BMS booking confirmation.`;
  }

  await editOrSend(ctx, text, contactKeyboard(hasContact));
}

export async function showContactPrompt(ctx: MyContext): Promise<void> {
  ctx.session.step = 'contact_update';

  const text = `*Update Contact Info*\n\n` +
    `Enter email and phone separated by space:\n\n` +
    `Example: \`john@example.com 9876543210\``;

  await editOrSend(ctx, text, cancelKeyboard());
}

// ============ JOB CREATION ============

export async function showNewJobStart(ctx: MyContext): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) {
    await editOrSend(ctx, 'Please use /start to register first.', mainMenuKeyboard());
    return;
  }

  // Check contact info
  if (!user.email || !user.phone) {
    const kb = new InlineKeyboard()
      .text('Set Contact', 'contact:update')
      .row()
      .text('Back', 'menu:main');
    await editOrSend(
      ctx,
      `*Contact Info Required*\n\nPlease set your email and phone first. This is needed for BMS booking confirmation.`,
      kb
    );
    return;
  }

  // Initialize job draft
  ctx.session.step = 'job_movie';
  ctx.session.jobDraft = {};

  const text = `*Create New Booking Job*\n\n` +
    `*Step 1/8: Movie Name*\n\n` +
    `What movie do you want to book?\n\n` +
    `Type the movie name:`;

  await editOrSend(ctx, text, cancelKeyboard());
}

export async function showCitySelection(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};

  const text = `*Create New Booking Job*\n\n` +
    `Movie: *${draft.movieName}*\n\n` +
    `*Step 2/8: City*\n\n` +
    `Select your city:`;

  await editOrSend(ctx, text, cityKeyboard());
}

export async function showTheatrePrompt(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};

  ctx.session.step = 'job_theatre';

  const text = `*Create New Booking Job*\n\n` +
    `Movie: *${draft.movieName}*\n` +
    `City: *${draft.city}*\n\n` +
    `*Step 3/8: Theatre(s)*\n\n` +
    `Which theatre(s)? (comma separated)\n\n` +
    `Popular: AMB Cinemas, PVR, INOX, Cinepolis\n\n` +
    `Type theatre names:`;

  const kb = new InlineKeyboard()
    .text('Back', 'job:back:city')
    .text('Cancel', 'menu:main');
  await editOrSend(ctx, text, kb);
}

export async function showDateSelection(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};
  const selectedDates = ctx.session.selectedDates || [];

  const text = `*Create New Booking Job*\n\n` +
    `Movie: *${draft.movieName}*\n` +
    `City: *${draft.city}*\n` +
    `Theatre(s): *${draft.theatres?.join(', ')}*\n\n` +
    `*Step 4/8: Preferred Date*\n\n` +
    `Select date(s), then tap Done:` +
    (selectedDates.length > 0 ? `\n\nSelected: ${selectedDates.join(', ')}` : '');

  await editOrSend(ctx, text, dateKeyboard(selectedDates));
}

export async function toggleDateSelection(ctx: MyContext, day: string): Promise<void> {
  const selectedDates = ctx.session.selectedDates || [];

  const index = selectedDates.indexOf(day);
  if (index > -1) {
    selectedDates.splice(index, 1);
  } else {
    selectedDates.push(day);
  }

  ctx.session.selectedDates = selectedDates;
  await ctx.answerCallbackQuery();
  await showDateSelection(ctx);
}

// ============ FORMAT SELECTION ============

export async function showFormatSelection(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};
  const selectedFormats = ctx.session.selectedFormats || [];

  const text = `*Create New Booking Job*\n\n` +
    `Movie: *${draft.movieName}*\n` +
    `City: *${draft.city}*\n` +
    `Theatre(s): *${draft.theatres?.join(', ')}*\n` +
    `Date(s): *${draft.preferredDates?.join(', ') || 'Any'}*\n\n` +
    `*Step 5/8: Preferred Format*\n\n` +
    `Select format(s), then tap Done:` +
    (selectedFormats.length > 0 ? `\n\nSelected: ${selectedFormats.join(', ')}` : '');

  await editOrSend(ctx, text, formatKeyboard(selectedFormats));
}

export async function toggleFormatSelection(ctx: MyContext, format: string): Promise<void> {
  const selectedFormats = ctx.session.selectedFormats || [];

  const index = selectedFormats.indexOf(format);
  if (index > -1) {
    selectedFormats.splice(index, 1);
  } else {
    selectedFormats.push(format);
  }

  ctx.session.selectedFormats = selectedFormats;
  await ctx.answerCallbackQuery();
  await showFormatSelection(ctx);
}

// ============ LANGUAGE SELECTION ============

export async function showLanguageSelection(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};
  const selectedLanguages = ctx.session.selectedLanguages || [];

  const text = `*Create New Booking Job*\n\n` +
    `Movie: *${draft.movieName}*\n` +
    `City: *${draft.city}*\n` +
    `Theatre(s): *${draft.theatres?.join(', ')}*\n` +
    `Date(s): *${draft.preferredDates?.join(', ') || 'Any'}*\n` +
    `Format: *${draft.preferredFormats?.join(', ') || 'Any'}*\n\n` +
    `*Step 6/8: Preferred Language*\n\n` +
    `Select language(s), then tap Done:` +
    (selectedLanguages.length > 0 ? `\n\nSelected: ${selectedLanguages.join(', ')}` : '');

  await editOrSend(ctx, text, languageKeyboard(selectedLanguages));
}

export async function toggleLanguageSelection(ctx: MyContext, language: string): Promise<void> {
  const selectedLanguages = ctx.session.selectedLanguages || [];

  const index = selectedLanguages.indexOf(language);
  if (index > -1) {
    selectedLanguages.splice(index, 1);
  } else {
    selectedLanguages.push(language);
  }

  ctx.session.selectedLanguages = selectedLanguages;
  await ctx.answerCallbackQuery();
  await showLanguageSelection(ctx);
}

// ============ SCREEN SELECTION ============

export async function showScreenSelection(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};
  const selectedScreens = ctx.session.selectedScreens || [];

  const text = `*Create New Booking Job*\n\n` +
    `Movie: *${draft.movieName}*\n` +
    `City: *${draft.city}*\n` +
    `Theatre(s): *${draft.theatres?.join(', ')}*\n` +
    `Date(s): *${draft.preferredDates?.join(', ') || 'Any'}*\n` +
    `Format: *${draft.preferredFormats?.join(', ') || 'Any'}*\n` +
    `Language: *${draft.preferredLanguages?.join(', ') || 'Any'}*\n\n` +
    `*Step 7/8: Screen Preference*\n\n` +
    `Select preferred screen(s), then tap Done:\n` +
    `_(These are prioritized when booking)_` +
    (selectedScreens.length > 0 ? `\n\nSelected: ${selectedScreens.join(', ')}` : '');

  await editOrSend(ctx, text, screenKeyboard(selectedScreens));
}

export async function toggleScreenSelection(ctx: MyContext, screen: string): Promise<void> {
  const selectedScreens = ctx.session.selectedScreens || [];

  const index = selectedScreens.indexOf(screen);
  if (index > -1) {
    selectedScreens.splice(index, 1);
  } else {
    selectedScreens.push(screen);
  }

  ctx.session.selectedScreens = selectedScreens;
  await ctx.answerCallbackQuery();
  await showScreenSelection(ctx);
}

// ============ MISMATCH HANDLING ============

export async function handleMismatchKeep(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery('Continuing to watch...');
    await jobService.resumeJob(jobId);
    await ctx.editMessageCaption({
      caption: `<b>Job Resumed</b>\n\nContinuing to watch for your preferred options...`,
      parse_mode: 'HTML',
    });
    logger.info('User chose to keep trying', { jobId });
  } catch (error) {
    logger.error('Failed to handle mismatch keep', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error resuming job');
  }
}

export async function handleMismatchBook(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery('Proceeding with available options...');
    const job = await jobService.getJobWithOptions(jobId);
    if (!job || !job.availableOptions) {
      await ctx.answerCallbackQuery('No available options found');
      return;
    }
    const options = (job.availableOptions as { options: Array<{ language: string; format: string; screen?: string; times: string[] }> }).options;
    const firstOption = options[0];
    if (firstOption) {
      await jobService.updateJobPreferences(jobId, {
        preferredFormats: [firstOption.format],
        preferredLanguages: [firstOption.language],
        preferredScreens: firstOption.screen ? [firstOption.screen] : undefined,
        preferredTimes: firstOption.times.slice(0, 1),
      });
      await ctx.editMessageCaption({
        caption: `<b>Booking Available Option</b>\n\n` +
          `Selected: ${firstOption.language} ${firstOption.format}${firstOption.screen ? ` (${firstOption.screen})` : ''}\n` +
          `Time: ${firstOption.times[0]}\n\n` +
          `Proceeding with booking...`,
        parse_mode: 'HTML',
      });
    }
    logger.info('User chose to book available', { jobId });
  } catch (error) {
    logger.error('Failed to handle mismatch book', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error processing request');
  }
}

export async function handleMismatchUpdate(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
    const job = await jobService.getJobWithOptions(jobId);
    if (!job || !job.availableOptions) {
      await ctx.answerCallbackQuery('No available options found');
      return;
    }
    const availableOptions = (job.availableOptions as { options: Array<{ language: string; format: string; screen?: string; times: string[] }> }).options;
    const keyboard = mismatchOptionsKeyboard(jobId, availableOptions);
    await ctx.editMessageCaption({
      caption: `<b>Select New Preference</b>\n\nChoose from available options:`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    logger.info('User chose to update preferences', { jobId });
  } catch (error) {
    logger.error('Failed to handle mismatch update', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error showing options');
  }
}

export async function handleMismatchSelect(ctx: MyContext, jobId: string, optionIndex: number): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
    const job = await jobService.getJobWithOptions(jobId);
    if (!job || !job.availableOptions) {
      await ctx.answerCallbackQuery('No available options found');
      return;
    }
    const availableOptions = (job.availableOptions as { options: Array<{ language: string; format: string; screen?: string; times: string[] }> }).options;
    const selectedOption = availableOptions[optionIndex];
    if (!selectedOption) {
      await ctx.answerCallbackQuery('Invalid option');
      return;
    }
    ctx.session.selectedMismatchOption = {
      jobId,
      optionIndex,
      option: selectedOption,
    };
    const keyboard = mismatchTimesKeyboard(jobId, selectedOption.times, optionIndex);
    await ctx.editMessageCaption({
      caption: `<b>Select Showtime</b>\n\n` +
        `Selected: ${selectedOption.language} ${selectedOption.format}${selectedOption.screen ? ` (${selectedOption.screen})` : ''}\n\n` +
        `Choose a showtime:`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    logger.info('User selected option', { jobId, optionIndex });
  } catch (error) {
    logger.error('Failed to handle mismatch select', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error processing selection');
  }
}

export async function handleMismatchTime(ctx: MyContext, jobId: string, optionIndex: number, timeIndex: number): Promise<void> {
  try {
    await ctx.answerCallbackQuery('Updating preferences...');
    const job = await jobService.getJobWithOptions(jobId);
    if (!job || !job.availableOptions) {
      await ctx.answerCallbackQuery('No available options found');
      return;
    }
    const availableOptions = (job.availableOptions as { options: Array<{ language: string; format: string; screen?: string; times: string[] }> }).options;
    const selectedOption = availableOptions[optionIndex];
    const selectedTime = selectedOption?.times[timeIndex];
    if (!selectedOption || !selectedTime) {
      await ctx.answerCallbackQuery('Invalid selection');
      return;
    }
    await jobService.updateJobPreferences(jobId, {
      preferredFormats: [selectedOption.format],
      preferredLanguages: [selectedOption.language],
      preferredScreens: selectedOption.screen ? [selectedOption.screen] : undefined,
      preferredTimes: [selectedTime],
    });
    await ctx.editMessageCaption({
      caption: `<b>Preferences Updated</b>\n\n` +
        `Format: ${selectedOption.format}\n` +
        `Language: ${selectedOption.language}\n` +
        (selectedOption.screen ? `Screen: ${selectedOption.screen}\n` : '') +
        `Time: ${selectedTime}\n\n` +
        `Resuming job with new preferences...`,
      parse_mode: 'HTML',
    });
    logger.info('User selected time, preferences updated', { jobId, optionIndex, timeIndex });
  } catch (error) {
    logger.error('Failed to handle mismatch time', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error updating preferences');
  }
}

export async function handleMismatchCancel(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery('Cancelling job...');
    await jobService.cancelJob(jobId);
    await ctx.editMessageCaption({
      caption: `<b>Job Cancelled</b>\n\nThe booking job has been cancelled.`,
      parse_mode: 'HTML',
    });
    logger.info('User cancelled job from mismatch', { jobId });
  } catch (error) {
    logger.error('Failed to handle mismatch cancel', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error cancelling job');
  }
}

export async function handleMismatchBack(ctx: MyContext, jobId: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
    const job = await jobService.getJobWithOptions(jobId);
    if (!job) {
      await ctx.answerCallbackQuery('Job not found');
      return;
    }
    const keyboard = mismatchActionKeyboard(jobId);
    await ctx.editMessageCaption({
      caption: `<b>Preference Mismatch</b>\n\nWhat would you like to do?`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (error) {
    logger.error('Failed to handle mismatch back', { jobId, error: String(error) });
    await ctx.answerCallbackQuery('Error going back');
  }
}
