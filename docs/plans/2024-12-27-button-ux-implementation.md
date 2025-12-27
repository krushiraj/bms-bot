# Button-Based UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert BMS Bot to full inline button experience with in-place message updates.

**Architecture:** Create a centralized menu system in `src/bot/menus/` that handles all button callbacks and screen navigation. Each screen is a function that returns message text + keyboard. Session tracks current message ID for in-place edits.

**Tech Stack:** Grammy (Telegram Bot), InlineKeyboard, session middleware

---

## Task 1: Filter Cancelled Jobs from myJobs

**Files:**
- Modify: `src/bot/commands/jobs.ts:229`

**Step 1: Update getJobsByUser filter**

In `myJobsCommand`, filter out cancelled and completed jobs. Change line 229:

```typescript
// Before:
const jobs = await jobService.getJobsByUser(user.id);

// After:
const jobs = await jobService.getActiveJobsByUser(user.id);
```

**Step 2: Verify the change**

Run: `yarn build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/bot/commands/jobs.ts
git commit -m "fix: hide cancelled/completed jobs from myjobs list"
```

---

## Task 2: Create Menu System Foundation

**Files:**
- Create: `src/bot/menus/index.ts`
- Create: `src/bot/menus/keyboards.ts`
- Modify: `src/bot/index.ts`

**Step 1: Create keyboards.ts with reusable keyboard builders**

```typescript
// src/bot/menus/keyboards.ts
import { InlineKeyboard } from 'grammy';

export const CITIES = ['hyderabad', 'bangalore', 'mumbai', 'delhi', 'chennai', 'kolkata', 'pune'];

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎬 New Job', 'menu:newjob')
    .text('📋 My Jobs', 'menu:jobs')
    .row()
    .text('💳 My Cards', 'menu:cards')
    .text('⚙️ Settings', 'menu:settings');
}

export function backToMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('◀️ Back', 'menu:main');
}

export function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Cancel', 'menu:main');
}

export function cityKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  // Row 1: hyderabad, bangalore, mumbai
  kb.text('Hyderabad', 'city:hyderabad')
    .text('Bangalore', 'city:bangalore')
    .text('Mumbai', 'city:mumbai')
    .row();
  // Row 2: delhi, chennai, kolkata
  kb.text('Delhi', 'city:delhi')
    .text('Chennai', 'city:chennai')
    .text('Kolkata', 'city:kolkata')
    .row();
  // Row 3: pune, other
  kb.text('Pune', 'city:pune')
    .text('Other...', 'city:other')
    .row();
  // Cancel
  kb.text('❌ Cancel', 'menu:main');
  return kb;
}

export function dateKeyboard(selectedDates: string[] = []): InlineKeyboard {
  const kb = new InlineKeyboard();
  const today = new Date();

  // Generate next 7 days
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const day = date.getDate().toString();
    const label = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const isSelected = selectedDates.includes(day);
    const prefix = isSelected ? '✓ ' : '';

    kb.text(`${prefix}${label}`, `date:toggle:${day}`);
    if ((i + 1) % 4 === 0) kb.row();
  }

  kb.row()
    .text('📅 Any Date', 'date:any')
    .row()
    .text('✅ Done', 'date:done')
    .row()
    .text('◀️ Back', 'job:back:theatre')
    .text('❌ Cancel', 'menu:main');

  return kb;
}

export function jobListKeyboard(jobs: Array<{ id: string; movieName: string; status: string }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  const statusEmoji: Record<string, string> = {
    PENDING: '⏳',
    WATCHING: '👀',
    BOOKING: '🎫',
    AWAITING_CONSENT: '❓',
  };

  for (const job of jobs.slice(0, 6)) {
    const emoji = statusEmoji[job.status] || '❓';
    const shortName = job.movieName.length > 15
      ? job.movieName.substring(0, 15) + '...'
      : job.movieName;
    kb.text(`${emoji} ${shortName}`, `job:view:${job.id}`).row();
  }

  kb.text('◀️ Back', 'menu:main');
  return kb;
}

export function jobDetailKeyboard(jobId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Cancel Job', `job:cancel:${jobId}`)
    .row()
    .text('◀️ Back to Jobs', 'menu:jobs');
}

export function confirmCancelJobKeyboard(jobId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Yes, Cancel', `job:confirm_cancel:${jobId}`)
    .text('◀️ No, Go Back', `job:view:${jobId}`);
}

export function cardListKeyboard(cards: Array<{ id: string; maskedNumber: string }>): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const card of cards.slice(0, 6)) {
    kb.text(`💳 ${card.maskedNumber}`, `card:view:${card.id}`).row();
  }

  kb.text('➕ Add Card', 'card:add')
    .row()
    .text('◀️ Back', 'menu:main');
  return kb;
}

export function cardDetailKeyboard(cardId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Remove Card', `card:remove:${cardId}`)
    .row()
    .text('◀️ Back to Cards', 'menu:cards');
}

export function confirmRemoveCardKeyboard(cardId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Yes, Remove', `card:confirm_remove:${cardId}`)
    .text('◀️ No, Go Back', `card:view:${cardId}`);
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔔 Notifications', 'settings:notifications')
    .row()
    .text('📱 Contact Info', 'settings:contact')
    .row()
    .text('◀️ Back', 'menu:main');
}

export function notificationKeyboard(notifyOnlySuccess: boolean): InlineKeyboard {
  return new InlineKeyboard()
    .text(notifyOnlySuccess ? '✓ Success only' : 'Success only', 'notify:success_only')
    .text(!notifyOnlySuccess ? '✓ All updates' : 'All updates', 'notify:all')
    .row()
    .text('◀️ Back to Settings', 'settings:main');
}

export function contactKeyboard(hasContact: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasContact) {
    kb.text('✏️ Update Contact', 'contact:update').row();
  } else {
    kb.text('➕ Set Contact', 'contact:update').row();
  }
  kb.text('◀️ Back to Settings', 'settings:main');
  return kb;
}
```

**Step 2: Create menus/index.ts with callback router**

```typescript
// src/bot/menus/index.ts
import { InlineKeyboard } from 'grammy';
import { MyContext, SessionData } from '../index.js';
import { userService } from '../../services/userService.js';
import { jobService } from '../../worker/jobService.js';
import { giftCardService } from '../../services/giftCardService.js';
import { logger } from '../../utils/logger.js';
import {
  mainMenuKeyboard,
  cityKeyboard,
  dateKeyboard,
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
  } catch (error) {
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
  const text = `🎬 *BMS Bot - Main Menu*\n\nWhat would you like to do?`;
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
      .text('🎬 Create New Job', 'menu:newjob')
      .row()
      .text('◀️ Back', 'menu:main');
    await editOrSend(ctx, `📋 *Your Booking Jobs*\n\nYou don't have any active jobs.`, kb);
    return;
  }

  const statusEmoji: Record<string, string> = {
    PENDING: '⏳',
    WATCHING: '👀',
    BOOKING: '🎫',
    AWAITING_CONSENT: '❓',
  };

  let text = `📋 *Your Booking Jobs*\n\n`;
  for (let i = 0; i < Math.min(jobs.length, 6); i++) {
    const job = jobs[i];
    if (!job) continue;
    const emoji = statusEmoji[job.status] || '❓';
    const prefs = job.showtimePrefs as { preferredDates?: string[] };
    const seatPrefs = job.seatPrefs as { count?: number };
    text += `${i + 1}. ${emoji} *${job.movieName}* - ${job.status}\n`;
    text += `   ${job.theatres[0] || 'Any'} • ${prefs.preferredDates?.[0] || 'Any'} • ${seatPrefs.count || 2} seats\n\n`;
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
  };

  const prefs = job.showtimePrefs as { preferredDates?: string[]; preferredTimes?: string[] };
  const seatPrefs = job.seatPrefs as { count?: number };
  const emoji = statusEmoji[job.status] || '❓';

  const watchUntil = job.watchUntilDate.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const text = `📋 *Job Details*\n\n` +
    `🎬 *${job.movieName}*\n` +
    `📍 ${job.city} - ${job.theatres.join(', ')}\n` +
    `📅 ${prefs.preferredDates?.join(', ') || 'Any'} • 🕐 ${prefs.preferredTimes?.[0] || 'Any'}\n` +
    `🎫 ${seatPrefs.count || 2} seats\n` +
    `${emoji} Status: ${job.status}\n\n` +
    `Watch until: ${watchUntil}`;

  await editOrSend(ctx, text, jobDetailKeyboard(jobId));
}

export async function showCancelJobConfirm(ctx: MyContext, jobId: string): Promise<void> {
  const job = await jobService.getJobById(jobId);
  if (!job) {
    await showJobsList(ctx);
    return;
  }

  const text = `⚠️ *Cancel Job?*\n\n` +
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
    .text('📋 My Jobs', 'menu:jobs')
    .text('◀️ Main Menu', 'menu:main');

  await editOrSend(
    ctx,
    `✅ *Job Cancelled*\n\n*${job.movieName}* booking job has been cancelled.`,
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
      .text('➕ Add Card', 'card:add')
      .row()
      .text('◀️ Back', 'menu:main');
    await editOrSend(ctx, `💳 *Your Gift Cards*\n\nYou don't have any gift cards saved.`, kb);
    return;
  }

  let text = `💳 *Your Gift Cards*\n\n`;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card) continue;
    const balance = card.balance !== null ? `₹${card.balance}` : 'Unknown';
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

  const balance = card.balance !== null ? `₹${card.balance}` : 'Unknown';
  const text = `💳 *Card Details*\n\n` +
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

  const text = `⚠️ *Remove Card?*\n\n` +
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
    .text('💳 My Cards', 'menu:cards')
    .text('◀️ Main Menu', 'menu:main');

  await editOrSend(
    ctx,
    `✅ *Card Removed*\n\nCard ${card.maskedNumber} has been removed.`,
    kb
  );
}

export async function showAddCardPrompt(ctx: MyContext): Promise<void> {
  ctx.session.step = 'card_add';

  const text = `💳 *Add Gift Card*\n\n` +
    `Enter card number and PIN separated by space:\n\n` +
    `Example: \`1234567890123456 123456\``;

  await editOrSend(ctx, text, cancelKeyboard());
}

// ============ SETTINGS ============

export async function showSettings(ctx: MyContext): Promise<void> {
  await editOrSend(ctx, `⚙️ *Settings*`, settingsKeyboard());
}

export async function showNotifications(ctx: MyContext): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) return;

  const text = `🔔 *Notification Preferences*\n\n` +
    `• *All updates*: Get notified for every step\n` +
    `• *Success only*: Only booking success/failure\n\n` +
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
    text = `📱 *Contact Info*\n\n` +
      `Email: ${user.email}\n` +
      `Phone: ${maskedPhone}\n\n` +
      `This info is used for BMS booking confirmation.`;
  } else {
    text = `📱 *Contact Info*\n\n` +
      `No contact info set yet.\n` +
      `Required for BMS booking confirmation.`;
  }

  await editOrSend(ctx, text, contactKeyboard(hasContact));
}

export async function showContactPrompt(ctx: MyContext): Promise<void> {
  ctx.session.step = 'contact_update';

  const text = `📱 *Update Contact Info*\n\n` +
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
      .text('📱 Set Contact', 'contact:update')
      .row()
      .text('◀️ Back', 'menu:main');
    await editOrSend(
      ctx,
      `⚠️ *Contact Info Required*\n\nPlease set your email and phone first. This is needed for BMS booking confirmation.`,
      kb
    );
    return;
  }

  // Initialize job draft
  ctx.session.step = 'job_movie';
  ctx.session.jobDraft = {};

  const text = `🎬 *Create New Booking Job*\n\n` +
    `*Step 1/5: Movie Name*\n\n` +
    `What movie do you want to book?\n\n` +
    `Type the movie name:`;

  await editOrSend(ctx, text, cancelKeyboard());
}

export async function showCitySelection(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};

  const text = `🎬 *Create New Booking Job*\n\n` +
    `✅ Movie: *${draft.movieName}*\n\n` +
    `*Step 2/5: City*\n\n` +
    `Select your city:`;

  await editOrSend(ctx, text, cityKeyboard());
}

export async function showTheatrePrompt(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};

  ctx.session.step = 'job_theatre';

  const text = `🎬 *Create New Booking Job*\n\n` +
    `✅ Movie: *${draft.movieName}*\n` +
    `✅ City: *${draft.city}*\n\n` +
    `*Step 3/5: Theatre(s)*\n\n` +
    `Which theatre(s)? (comma separated)\n\n` +
    `Popular: AMB Cinemas, PVR, INOX, Cinepolis\n\n` +
    `Type theatre names:`;

  const kb = new InlineKeyboard()
    .text('◀️ Back', 'job:back:city')
    .text('❌ Cancel', 'menu:main');
  await editOrSend(ctx, text, kb);
}

export async function showDateSelection(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};
  const selectedDates = ctx.session.selectedDates || [];

  const text = `🎬 *Create New Booking Job*\n\n` +
    `✅ Movie: *${draft.movieName}*\n` +
    `✅ City: *${draft.city}*\n` +
    `✅ Theatre(s): *${draft.theatres?.join(', ')}*\n\n` +
    `*Step 4/5: Preferred Date*\n\n` +
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
```

**Step 3: Verify build**

Run: `yarn build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/bot/menus/keyboards.ts src/bot/menus/index.ts
git commit -m "feat: add menu system with keyboard builders and handlers"
```

---

## Task 3: Update Session and Bot Index

**Files:**
- Modify: `src/bot/index.ts`

**Step 1: Update SessionData interface**

Add new session fields at line 37-40:

```typescript
export interface SessionData {
  step?: string;
  jobDraft?: JobDraft;
  menuMessageId?: number;
  selectedDates?: string[];
}
```

**Step 2: Add menu imports and callback handler**

After line 26, add:

```typescript
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
} from './menus/index.js';
```

**Step 3: Add menu command**

After line 78 (setcontact command), add:

```typescript
bot.command('menu', async (ctx) => {
  const msg = await ctx.reply('Loading menu...', { parse_mode: 'Markdown' });
  ctx.session.menuMessageId = msg.message_id;
  await showMainMenu(ctx);
});
```

**Step 4: Replace callback query handler**

Replace the entire callback handler block (lines 92-103) with:

```typescript
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
          `🎬 *Create New Booking Job*\n\n` +
          `✅ Movie: *${ctx.session.jobDraft?.movieName}*\n\n` +
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
      ctx.session.step = 'job_time';
      await handleTimeSelection(ctx);
    } else if (data === 'date:done') {
      const selectedDates = ctx.session.selectedDates || [];
      ctx.session.jobDraft = { ...ctx.session.jobDraft, preferredDates: selectedDates };
      ctx.session.step = 'job_time';
      await handleTimeSelection(ctx);
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
```

**Step 5: Add helper function for time selection**

After the callback handler, add:

```typescript
async function handleTimeSelection(ctx: MyContext): Promise<void> {
  const draft = ctx.session.jobDraft || {};
  const TIME_RANGES = {
    midnight: { label: '🌌 Midnight', times: ['12:00 AM', '1:00 AM', '2:00 AM', '3:00 AM'] },
    early: { label: '🌄 Early (4-8 AM)', times: ['4:00 AM', '5:00 AM', '6:00 AM', '7:00 AM', '8:00 AM'] },
    morning: { label: '🌅 Morning', times: ['9:00 AM', '10:00 AM', '11:00 AM'] },
    afternoon: { label: '☀️ Afternoon', times: ['12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM'] },
    evening: { label: '🌆 Evening', times: ['4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM'] },
    night: { label: '🌙 Night', times: ['8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'] },
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
    .text('🕐 Any Time', 'time:any')
    .row()
    .text('◀️ Back', 'job:back:dates')
    .text('❌ Cancel', 'menu:main');

  await ctx.editMessageText(
    `🎬 *Create New Booking Job*\n\n` +
    `✅ Movie: *${draft.movieName}*\n` +
    `✅ City: *${draft.city}*\n` +
    `✅ Theatre(s): *${draft.theatres?.join(', ')}*\n` +
    `✅ Date(s): *${draft.preferredDates?.join(', ') || 'Any'}*\n\n` +
    `*Step 5/6: Preferred Time*\n\n` +
    `Select your preferred showtime:`,
    { parse_mode: 'Markdown', reply_markup: timeKeyboard }
  );
}
```

**Step 6: Verify build**

Run: `yarn build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add src/bot/index.ts
git commit -m "feat: integrate menu system with callback routing"
```

---

## Task 4: Update Start Command with Main Menu

**Files:**
- Modify: `src/bot/commands/start.ts`

**Step 1: Update startCommand to show main menu**

Replace the entire file:

```typescript
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
      .text('🎬 New Job', 'menu:newjob')
      .text('📋 My Jobs', 'menu:jobs')
      .row()
      .text('💳 My Cards', 'menu:cards')
      .text('⚙️ Settings', 'menu:settings');

    let text: string;
    if (isNew) {
      logger.info('New user registered', { telegramId, userId: user.id });
      text = `🎬 *Welcome to BMS Bot!*\n\n` +
        `I can help you book movie tickets automatically on BookMyShow.\n\n` +
        `*How it works:*\n` +
        `1. Add your gift cards\n` +
        `2. Create a booking job\n` +
        `3. I'll watch for tickets and book automatically!\n\n` +
        `What would you like to do?`;
    } else {
      text = `🎬 *BMS Bot - Main Menu*\n\n` +
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
```

**Step 2: Verify build**

Run: `yarn build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/bot/commands/start.ts
git commit -m "feat: update start command to show main menu with buttons"
```

---

## Task 5: Update Job Message Handler for Button Flow

**Files:**
- Modify: `src/bot/commands/jobs.ts`

**Step 1: Update handleJobMessage for button-integrated flow**

Find the `handleJobMessage` function and update the switch cases to work with the button flow. Update the city text handler and add proper navigation:

In the switch statement, update case 'job_movie':

```typescript
case 'job_movie':
  draft.movieName = text;
  ctx.session.jobDraft = draft;
  ctx.session.step = 'job_city';

  // Show city selection with buttons
  const { showCitySelection } = await import('../menus/index.js');
  await showCitySelection(ctx);
  return true;
```

Add a new case for city text input:

```typescript
case 'job_city_text':
  draft.city = text.toLowerCase();
  ctx.session.jobDraft = draft;
  ctx.session.step = 'job_theatre';

  const { showTheatrePrompt } = await import('../menus/index.js');
  await showTheatrePrompt(ctx);
  return true;
```

Update case 'job_theatre' to show date selection with buttons:

```typescript
case 'job_theatre':
  draft.theatres = text.split(',').map(t => t.trim()).filter(Boolean);
  ctx.session.jobDraft = draft;
  ctx.session.step = 'job_date';
  ctx.session.selectedDates = [];

  const { showDateSelection } = await import('../menus/index.js');
  await showDateSelection(ctx);
  return true;
```

Remove or simplify case 'job_date' since dates are now button-based.

**Step 2: Verify build**

Run: `yarn build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/bot/commands/jobs.ts
git commit -m "feat: update job message handler for button-integrated flow"
```

---

## Task 6: Add Card and Contact Text Input Handlers

**Files:**
- Modify: `src/bot/index.ts`

**Step 1: Update message handler for card and contact text input**

Update the message handler (around line 84) to handle card_add and contact_update steps:

```typescript
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
      } catch {}

      ctx.session.step = undefined;

      const { InlineKeyboard } = await import('grammy');
      const kb = new InlineKeyboard()
        .text('💳 My Cards', 'menu:cards')
        .text('◀️ Main Menu', 'menu:main');

      await ctx.reply(
        `✅ *Card Added!*\n\nCard ****${cardNumber.slice(-4)} has been saved securely.`,
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
      } catch {}

      ctx.session.step = undefined;

      const { InlineKeyboard } = await import('grammy');
      const kb = new InlineKeyboard()
        .text('⚙️ Settings', 'settings:main')
        .text('◀️ Main Menu', 'menu:main');

      await ctx.reply(
        `✅ *Contact Updated!*\n\nEmail: ${email}\nPhone: ****${phone.slice(-4)}`,
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
```

**Step 2: Add imports at top of file**

After the existing imports, add:

```typescript
import { giftCardService } from '../services/giftCardService.js';
```

**Step 3: Verify build**

Run: `yarn build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/bot/index.ts
git commit -m "feat: add card and contact text input handlers with button responses"
```

---

## Task 7: Update Help Command

**Files:**
- Modify: `src/bot/commands/help.ts`

**Step 1: Update help command to be button-based**

```typescript
import { CommandContext, InlineKeyboard } from 'grammy';
import { MyContext } from '../index.js';

export async function helpCommand(ctx: CommandContext<MyContext>): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('🎬 New Job', 'menu:newjob')
    .text('📋 My Jobs', 'menu:jobs')
    .row()
    .text('💳 My Cards', 'menu:cards')
    .text('⚙️ Settings', 'menu:settings');

  const text = `🎬 *BMS Bot Help*\n\n` +
    `*Features:*\n` +
    `• Automatic movie ticket booking\n` +
    `• Watch for ticket availability\n` +
    `• Smart seat selection\n` +
    `• Gift card payment support\n\n` +
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
```

**Step 2: Verify build**

Run: `yarn build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/bot/commands/help.ts
git commit -m "feat: update help command with menu buttons"
```

---

## Task 8: Final Integration and Testing

**Step 1: Build the project**

Run: `yarn build`
Expected: Build succeeds with no errors

**Step 2: Run linter (if available)**

Run: `yarn lint` or `yarn check`
Expected: No critical errors

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete button-based UX implementation"
```

**Step 4: Manual testing checklist**

Test these flows:
- [ ] /start shows main menu with buttons
- [ ] New Job flow: movie text → city buttons → theatre text → date buttons → time buttons → seats buttons
- [ ] My Jobs shows active jobs only (no cancelled)
- [ ] Tapping job shows details with cancel button
- [ ] Cancel confirmation works
- [ ] My Cards shows cards with add/remove
- [ ] Add card text input works
- [ ] Settings → Notifications toggle works
- [ ] Settings → Contact update works
- [ ] Back buttons navigate correctly
- [ ] Cancel buttons return to main menu
