import { prisma } from '../db/client.js';
import { encrypt, decrypt } from '../utils/crypto.js';

export interface CardSummary {
  id: string;
  maskedNumber: string;
  balance: number | null;
  isActive: boolean;
  addedAt: Date;
  lastUsedAt: Date | null;
}

export interface DecryptedCard {
  id: string;
  cardNumber: string;
  pin: string;
  balance: number | null;
}

export class GiftCardService {
  async addCard(
    userId: string,
    cardNumber: string,
    pin: string,
    balance?: number
  ): Promise<string> {
    const encryptedNumber = encrypt(cardNumber);
    const encryptedPin = encrypt(pin);

    const card = await prisma.giftCard.create({
      data: {
        userId,
        cardNumber: encryptedNumber,
        pin: encryptedPin,
        balance: balance ?? null,
      },
    });

    return card.id;
  }

  async listCards(userId: string): Promise<CardSummary[]> {
    const cards = await prisma.giftCard.findMany({
      where: { userId, isActive: true },
      orderBy: { addedAt: 'desc' },
    });

    return cards.map((card) => {
      const decryptedNumber = decrypt(card.cardNumber);
      const lastFour = decryptedNumber.slice(-4);

      return {
        id: card.id,
        maskedNumber: `****${lastFour}`,
        balance: card.balance,
        isActive: card.isActive,
        addedAt: card.addedAt,
        lastUsedAt: card.lastUsedAt,
      };
    });
  }

  async getDecryptedCard(
    userId: string,
    cardId: string
  ): Promise<DecryptedCard | null> {
    const card = await prisma.giftCard.findFirst({
      where: { id: cardId, userId, isActive: true },
    });

    if (!card) {
      return null;
    }

    return {
      id: card.id,
      cardNumber: decrypt(card.cardNumber),
      pin: decrypt(card.pin),
      balance: card.balance,
    };
  }

  async removeCard(userId: string, cardId: string): Promise<void> {
    const card = await prisma.giftCard.findFirst({
      where: { id: cardId, userId },
    });

    if (!card) {
      throw new Error('Card not found');
    }

    await prisma.giftCard.delete({
      where: { id: cardId },
    });
  }

  async updateBalance(cardId: string, balance: number): Promise<void> {
    await prisma.giftCard.update({
      where: { id: cardId },
      data: { balance, lastUsedAt: new Date() },
    });
  }

  async getCardsForBooking(
    userId: string,
    requiredAmount: number
  ): Promise<DecryptedCard[]> {
    const cards = await prisma.giftCard.findMany({
      where: {
        userId,
        isActive: true,
        OR: [
          { balance: { gte: requiredAmount } },
          { balance: null }, // Unknown balance
        ],
      },
      orderBy: { balance: 'desc' },
    });

    return cards.map((card) => ({
      id: card.id,
      cardNumber: decrypt(card.cardNumber),
      pin: decrypt(card.pin),
      balance: card.balance,
    }));
  }
}

export const giftCardService = new GiftCardService();
