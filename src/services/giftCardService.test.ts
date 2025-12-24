import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GiftCardService } from './giftCardService.js';
import { prisma } from '../db/client.js';

// Mock Prisma
vi.mock('../db/client.js', () => ({
  prisma: {
    giftCard: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock crypto utilities
vi.mock('../utils/crypto.js', () => ({
  encrypt: vi.fn((text: string) => {
    // Create a simple hash-like representation for testing
    const hash = Buffer.from(text).toString('base64');
    return `enc_${hash.slice(0, 16)}`;
  }),
  decrypt: vi.fn((encrypted: string) => {
    // For testing, we'll use a lookup map
    const decryptMap: Record<string, string> = {
      'enc_MTIzNC01Njc4LT': '1234-5678-9012-3456',
      'enc_MTIzNA==': '1234',
    };
    return decryptMap[encrypted] || 'decrypted-value';
  }),
}));

describe('GiftCardService', () => {
  const service = new GiftCardService();
  const mockUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addCard', () => {
    it('should encrypt card number and PIN before storing', async () => {
      const cardNumber = '1234-5678-9012-3456';
      const pin = '1234';

      vi.mocked(prisma.giftCard.create).mockResolvedValue({
        id: 'card-1',
        userId: mockUserId,
        cardNumber: 'encrypted',
        pin: 'encrypted',
        balance: null,
        isActive: true,
        addedAt: new Date(),
        lastUsedAt: null,
      });

      await service.addCard(mockUserId, cardNumber, pin);

      expect(prisma.giftCard.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          cardNumber: expect.not.stringContaining(cardNumber),
          pin: expect.not.stringContaining(pin),
        }),
      });
    });
  });

  describe('listCards', () => {
    it('should return cards with masked numbers', async () => {
      vi.mocked(prisma.giftCard.findMany).mockResolvedValue([
        {
          id: 'card-1',
          userId: mockUserId,
          cardNumber: 'enc_MTIzNC01Njc4LT',
          pin: 'enc_MTIzNA==',
          balance: 500,
          isActive: true,
          addedAt: new Date(),
          lastUsedAt: null,
        },
      ]);

      const cards = await service.listCards(mockUserId);

      expect(cards).toHaveLength(1);
      expect(cards[0]?.maskedNumber).toMatch(/^\*+\d{4}$/);
      expect(cards[0]).not.toHaveProperty('cardNumber');
      expect(cards[0]).not.toHaveProperty('pin');
    });
  });

  describe('removeCard', () => {
    it('should delete card belonging to user', async () => {
      vi.mocked(prisma.giftCard.findFirst).mockResolvedValue({
        id: 'card-1',
        userId: mockUserId,
        cardNumber: 'enc',
        pin: 'enc',
        balance: null,
        isActive: true,
        addedAt: new Date(),
        lastUsedAt: null,
      });
      vi.mocked(prisma.giftCard.delete).mockResolvedValue({} as any);

      await service.removeCard(mockUserId, 'card-1');

      expect(prisma.giftCard.delete).toHaveBeenCalledWith({
        where: { id: 'card-1' },
      });
    });

    it('should throw if card does not belong to user', async () => {
      vi.mocked(prisma.giftCard.findFirst).mockResolvedValue(null);

      await expect(service.removeCard(mockUserId, 'card-1')).rejects.toThrow(
        'Card not found'
      );
    });
  });
});
