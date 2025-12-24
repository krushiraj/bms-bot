import { CommandContext, Context } from 'grammy';
import { giftCardService } from '../../services/giftCardService.js';
import { userService } from '../../services/userService.js';
import { logger } from '../../utils/logger.js';

export async function addCardCommand(ctx: CommandContext<Context>): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  await ctx.reply(
    `To add a gift card, send me the details in this format:\n\n` +
      `/addcard <card-number> <pin>\n\n` +
      `Example:\n` +
      `/addcard 1234567890123456 1234\n\n` +
      `Your card details are encrypted and stored securely.`
  );
}

export async function addCardWithArgs(
  ctx: CommandContext<Context>,
  args: string[]
): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  if (args.length < 2) {
    await addCardCommand(ctx);
    return;
  }

  const [cardNumber, pin] = args;
  if (!cardNumber || !pin) {
    await ctx.reply('Please provide both card number and PIN.');
    return;
  }

  // Basic validation
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
    const cardId = await giftCardService.addCard(user.id, cardNumber, pin);

    logger.info('Gift card added', { userId: user.id, cardId });

    // Delete the message containing card details for security
    try {
      await ctx.deleteMessage();
    } catch {
      // May fail if bot doesn't have delete permission
    }

    await ctx.reply(
      `✅ Gift card added successfully!\n\n` +
        `Card: ****${cardNumber.slice(-4)}\n` +
        `ID: ${cardId.slice(0, 8)}...\n\n` +
        `Use /mycards to see all your cards.`
    );
  } catch (error) {
    logger.error('Error adding gift card', { error, telegramId });
    await ctx.reply('Failed to add card. Please try again.');
  }
}

export async function myCardsCommand(ctx: CommandContext<Context>): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  try {
    const user = await userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start to register first.');
      return;
    }

    const cards = await giftCardService.listCards(user.id);

    if (cards.length === 0) {
      await ctx.reply(
        `You don't have any gift cards yet.\n\n` +
          `Use /addcard to add one.`
      );
      return;
    }

    const cardList = cards
      .map((card, i) => {
        const balance = card.balance !== null ? `Rs.${card.balance}` : 'Unknown';
        return `${i + 1}. ${card.maskedNumber} (Balance: ${balance})`;
      })
      .join('\n');

    await ctx.reply(
      `🎫 *Your Gift Cards*\n\n${cardList}\n\n` +
        `To remove a card, use /removecard <number>`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Error listing gift cards', { error, telegramId });
    await ctx.reply('Failed to fetch cards. Please try again.');
  }
}

export async function removeCardCommand(
  ctx: CommandContext<Context>,
  args: string[]
): Promise<void> {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply('Could not identify you.');
    return;
  }

  if (args.length < 1) {
    await ctx.reply('Usage: /removecard <card-number>\n\nUse /mycards to see your cards.');
    return;
  }

  const cardIndex = parseInt(args[0] ?? '', 10) - 1;

  try {
    const user = await userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start to register first.');
      return;
    }

    const cards = await giftCardService.listCards(user.id);

    if (cardIndex < 0 || cardIndex >= cards.length) {
      await ctx.reply('Invalid card number. Use /mycards to see your cards.');
      return;
    }

    const card = cards[cardIndex];
    if (!card) {
      await ctx.reply('Card not found.');
      return;
    }

    await giftCardService.removeCard(user.id, card.id);

    logger.info('Gift card removed', { userId: user.id, cardId: card.id });

    await ctx.reply(`✅ Card ${card.maskedNumber} removed.`);
  } catch (error) {
    logger.error('Error removing gift card', { error, telegramId });
    await ctx.reply('Failed to remove card. Please try again.');
  }
}
