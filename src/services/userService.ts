import { prisma } from '../db/client.js';
import type { User } from '@prisma/client';

export class UserService {
  async findByTelegramId(telegramId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { telegramId },
    });
  }

  async createFromTelegram(telegramId: string): Promise<User> {
    return prisma.user.create({
      data: { telegramId },
    });
  }

  async getOrCreate(telegramId: string): Promise<User> {
    const existing = await this.findByTelegramId(telegramId);
    if (existing) {
      return existing;
    }
    return this.createFromTelegram(telegramId);
  }

  async updateContactInfo(
    userId: string,
    data: { email?: string; phone?: string }
  ): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async hasContactInfo(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    return Boolean(user?.email && user?.phone);
  }
}

export const userService = new UserService();
