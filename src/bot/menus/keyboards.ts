// src/bot/menus/keyboards.ts
import { InlineKeyboard } from 'grammy';

export const CITIES = ['hyderabad', 'bangalore', 'mumbai', 'delhi', 'chennai', 'kolkata', 'pune'];

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('New Job', 'menu:newjob')
    .text('My Jobs', 'menu:jobs')
    .row()
    .text('My Cards', 'menu:cards')
    .text('Settings', 'menu:settings');
}

export function backToMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Back', 'menu:main');
}

export function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Cancel', 'menu:main');
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
  kb.text('Cancel', 'menu:main');
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
    .text('Any Date', 'date:any')
    .row()
    .text('Done', 'date:done')
    .row()
    .text('Back', 'job:back:theatre')
    .text('Cancel', 'menu:main');

  return kb;
}

export const FORMATS = ['2D', '3D', 'IMAX', '4DX'];

export function formatKeyboard(selectedFormats: string[] = []): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Row 1: 2D, 3D
  for (const format of FORMATS.slice(0, 2)) {
    const isSelected = selectedFormats.includes(format);
    const prefix = isSelected ? '✓ ' : '';
    kb.text(`${prefix}${format}`, `format:toggle:${format}`);
  }
  kb.row();

  // Row 2: IMAX, 4DX
  for (const format of FORMATS.slice(2)) {
    const isSelected = selectedFormats.includes(format);
    const prefix = isSelected ? '✓ ' : '';
    kb.text(`${prefix}${format}`, `format:toggle:${format}`);
  }
  kb.row();

  kb.text('Any Format', 'format:any')
    .row()
    .text('Done', 'format:done')
    .row()
    .text('Back', 'job:back:dates')
    .text('Cancel', 'menu:main');

  return kb;
}

export const LANGUAGES = ['Hindi', 'English', 'Telugu', 'Tamil', 'Kannada', 'Malayalam'];

export function languageKeyboard(selectedLanguages: string[] = []): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Row 1: Hindi, English, Telugu
  for (const lang of LANGUAGES.slice(0, 3)) {
    const isSelected = selectedLanguages.includes(lang);
    const prefix = isSelected ? '✓ ' : '';
    kb.text(`${prefix}${lang}`, `lang:toggle:${lang}`);
  }
  kb.row();

  // Row 2: Tamil, Kannada, Malayalam
  for (const lang of LANGUAGES.slice(3)) {
    const isSelected = selectedLanguages.includes(lang);
    const prefix = isSelected ? '✓ ' : '';
    kb.text(`${prefix}${lang}`, `lang:toggle:${lang}`);
  }
  kb.row();

  kb.text('Any Language', 'lang:any')
    .row()
    .text('Done', 'lang:done')
    .row()
    .text('Back', 'job:back:format')
    .text('Cancel', 'menu:main');

  return kb;
}

export const SCREENS = ['IMAX', 'PCX', 'DOLBY', 'LASER', 'BARCO', 'ICE', 'ONYX', '4DX'];

export function screenKeyboard(selectedScreens: string[] = []): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Row 1: IMAX, PCX, DOLBY
  for (const screen of SCREENS.slice(0, 3)) {
    const isSelected = selectedScreens.includes(screen);
    const prefix = isSelected ? '✓ ' : '';
    kb.text(`${prefix}${screen}`, `screen:toggle:${screen}`);
  }
  kb.row();

  // Row 2: LASER, BARCO, ICE
  for (const screen of SCREENS.slice(3, 6)) {
    const isSelected = selectedScreens.includes(screen);
    const prefix = isSelected ? '✓ ' : '';
    kb.text(`${prefix}${screen}`, `screen:toggle:${screen}`);
  }
  kb.row();

  // Row 3: ONYX, 4DX
  for (const screen of SCREENS.slice(6)) {
    const isSelected = selectedScreens.includes(screen);
    const prefix = isSelected ? '✓ ' : '';
    kb.text(`${prefix}${screen}`, `screen:toggle:${screen}`);
  }
  kb.row();

  kb.text('Any Screen', 'screen:any')
    .row()
    .text('Done', 'screen:done')
    .row()
    .text('Back', 'job:back:lang')
    .text('Cancel', 'menu:main');

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

  kb.text('Back', 'menu:main');
  return kb;
}

export function jobDetailKeyboard(jobId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Cancel Job', `job:cancel:${jobId}`)
    .row()
    .text('Back to Jobs', 'menu:jobs');
}

export function confirmCancelJobKeyboard(jobId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Yes, Cancel', `job:confirm_cancel:${jobId}`)
    .text('No, Go Back', `job:view:${jobId}`);
}

export function cardListKeyboard(cards: Array<{ id: string; maskedNumber: string }>): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const card of cards.slice(0, 6)) {
    kb.text(`${card.maskedNumber}`, `card:view:${card.id}`).row();
  }

  kb.text('Add Card', 'card:add')
    .row()
    .text('Back', 'menu:main');
  return kb;
}

export function cardDetailKeyboard(cardId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Remove Card', `card:remove:${cardId}`)
    .row()
    .text('Back to Cards', 'menu:cards');
}

export function confirmRemoveCardKeyboard(cardId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Yes, Remove', `card:confirm_remove:${cardId}`)
    .text('No, Go Back', `card:view:${cardId}`);
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Notifications', 'settings:notifications')
    .row()
    .text('Contact Info', 'settings:contact')
    .row()
    .text('Back', 'menu:main');
}

export function notificationKeyboard(notifyOnlySuccess: boolean): InlineKeyboard {
  return new InlineKeyboard()
    .text(notifyOnlySuccess ? '✓ Success only' : 'Success only', 'notify:success_only')
    .text(!notifyOnlySuccess ? '✓ All updates' : 'All updates', 'notify:all')
    .row()
    .text('Back to Settings', 'settings:main');
}

export function contactKeyboard(hasContact: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasContact) {
    kb.text('Update Contact', 'contact:update').row();
  } else {
    kb.text('Set Contact', 'contact:update').row();
  }
  kb.text('Back to Settings', 'settings:main');
  return kb;
}
