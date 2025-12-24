# Phase 1: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up the project foundation with TypeScript, database, Telegram bot, user registration, and gift card management.

**Architecture:** Monorepo with API server (Fastify), Telegram bot (grammY), and shared services. Prisma for database access, BullMQ for job queue. Single entry point runs all services.

**Tech Stack:** TypeScript, Fastify, grammY, Prisma, PostgreSQL, Redis, BullMQ, Zod, Vitest

---

## Task 1: Project Setup - TypeScript Configuration

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json`
- Delete: `src/index.js`, `src/config/config.js`, `src/pages/*.js`, `src/utils/*.js`

**Step 1: Remove old JavaScript files**

```bash
rm -rf src/ tests/demo.spec.js playwright.config.js mock-site/ QUICKSTART.md
mkdir -p src
```

**Step 2: Update package.json for TypeScript**

Replace `package.json` with:

```json
{
  "name": "bms-bot",
  "version": "1.0.0",
  "description": "BookMyShow ticket booking automation service",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["bookmyshow", "automation", "telegram-bot", "playwright"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "@prisma/client": "^5.7.0",
    "bullmq": "^5.1.0",
    "fastify": "^4.25.0",
    "grammy": "^1.21.0",
    "ioredis": "^5.3.2",
    "playwright": "^1.40.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "prisma": "^5.7.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0",
    "vitest": "^1.1.0"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Install dependencies**

```bash
yarn install
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: setup TypeScript project structure"
```

---

## Task 2: Environment Configuration

**Files:**
- Create: `src/utils/config.ts`
- Create: `src/utils/logger.ts`
- Create: `.env.example`

**Step 1: Create .env.example**

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/bms_bot

# Redis
REDIS_URL=redis://localhost:6379

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather

# Security
ENCRYPTION_KEY=generate-32-byte-hex-key-here
JWT_SECRET=your-jwt-secret

# App
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
```

**Step 2: Create src/utils/config.ts**

```typescript
import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  databaseUrl: z.string().url(),

  // Redis
  redisUrl: z.string().url(),

  // Telegram
  telegramBotToken: z.string().min(1),

  // Security
  encryptionKey: z.string().length(64, 'Must be 32 bytes (64 hex chars)'),
  jwtSecret: z.string().min(32),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    encryptionKey: process.env.ENCRYPTION_KEY,
    jwtSecret: process.env.JWT_SECRET,
  });

  if (!result.success) {
    console.error('Invalid configuration:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
```

**Step 3: Create src/utils/logger.ts**

```typescript
import { config } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[config.logLevel];
}

function formatMessage(level: LogLevel, message: string, data?: object): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  if (data) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

export const logger = {
  debug(message: string, data?: object) {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', message, data));
    }
  },
  info(message: string, data?: object) {
    if (shouldLog('info')) {
      console.log(formatMessage('info', message, data));
    }
  },
  warn(message: string, data?: object) {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, data));
    }
  },
  error(message: string, data?: object) {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, data));
    }
  },
};
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add environment config and logger"
```

---

## Task 3: Docker Compose for Local Development

**Files:**
- Create: `docker-compose.yml`
- Update: `.gitignore`

**Step 1: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: bms-postgres
    environment:
      POSTGRES_USER: bms
      POSTGRES_PASSWORD: bms_password
      POSTGRES_DB: bms_bot
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bms -d bms_bot"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: bms-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

**Step 2: Update .gitignore**

Append to `.gitignore`:

```
# Environment
.env
.env.local

# Build
dist/

# Prisma
prisma/*.db
prisma/*.db-journal

# Logs
*.log

# IDE
.idea/
*.swp
*.swo
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add docker-compose for local development"
```

---

## Task 4: Database Schema with Prisma

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/db/client.ts`

**Step 1: Initialize Prisma**

```bash
npx prisma init
```

**Step 2: Create prisma/schema.prisma**

Replace generated file with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id         String   @id @default(cuid())
  telegramId String   @unique
  email      String?
  phone      String?
  isAdmin    Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  giftCards  GiftCard[]
  jobs       BookingJob[]
}

model GiftCard {
  id              String    @id @default(cuid())
  userId          String
  cardNumber      String    // Encrypted
  pin             String    // Encrypted
  balance         Float?
  isActive        Boolean   @default(true)
  addedAt         DateTime  @default(now())
  lastUsedAt      DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model BookingJob {
  id        String   @id @default(cuid())
  userId    String
  status    JobStatus @default(PENDING)

  // Movie details
  movieName String
  city      String

  // Scheduling
  watchFromDate  DateTime
  watchUntilDate DateTime

  // Preferences (stored as JSON)
  theatres      String[]
  showtimePrefs Json
  seatPrefs     Json

  // Result
  bookingResult Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([status])
}

enum JobStatus {
  PENDING
  WATCHING
  BOOKING
  AWAITING_CONSENT
  SUCCESS
  FAILED
  CANCELLED
}
```

**Step 3: Create src/db/client.ts**

```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
```

**Step 4: Generate Prisma client**

```bash
# Start database first
docker-compose up -d postgres

# Create .env for local dev
cp .env.example .env
# Edit .env with: DATABASE_URL=postgresql://bms:bms_password@localhost:5432/bms_bot

# Push schema to database
yarn db:push
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema for users, gift cards, and jobs"
```

---

## Task 5: Encryption Utilities

**Files:**
- Create: `src/utils/crypto.ts`
- Create: `src/utils/crypto.test.ts`

**Step 1: Write the failing test**

Create `src/utils/crypto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto.js';

describe('crypto', () => {
  it('should encrypt and decrypt a string', () => {
    const original = 'GIFT-CARD-1234-5678';
    const encrypted = encrypt(original);

    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':'); // IV:AuthTag:Ciphertext format

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should produce different ciphertexts for same input', () => {
    const original = 'same-input';
    const encrypted1 = encrypt(original);
    const encrypted2 = encrypt(original);

    expect(encrypted1).not.toBe(encrypted2); // Different IVs
  });

  it('should fail to decrypt tampered data', () => {
    const encrypted = encrypt('test');
    const tampered = encrypted.slice(0, -4) + 'xxxx';

    expect(() => decrypt(tampered)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
yarn test src/utils/crypto.test.ts
```

Expected: FAIL with "Cannot find module './crypto.js'"

**Step 3: Write implementation**

Create `src/utils/crypto.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from './config.js';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  return Buffer.from(config.encryptionKey, 'hex');
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const key = getKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

**Step 5: Create test setup**

Create `src/test-setup.ts`:

```typescript
// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough';
```

**Step 6: Run tests**

```bash
yarn test
```

Expected: PASS

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add AES-256-GCM encryption utilities"
```

---

## Task 6: Gift Card Service

**Files:**
- Create: `src/services/giftCardService.ts`
- Create: `src/services/giftCardService.test.ts`

**Step 1: Write the failing test**

Create `src/services/giftCardService.test.ts`:

```typescript
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
          cardNumber: 'encrypted-value',
          pin: 'encrypted-pin',
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
```

**Step 2: Run test to verify it fails**

```bash
yarn test src/services/giftCardService.test.ts
```

Expected: FAIL

**Step 3: Write implementation**

Create `src/services/giftCardService.ts`:

```typescript
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
```

**Step 4: Run tests**

```bash
yarn test
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add gift card service with encryption"
```

---

## Task 7: User Service

**Files:**
- Create: `src/services/userService.ts`

**Step 1: Create src/services/userService.ts**

```typescript
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
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add user service"
```

---

## Task 8: Basic Telegram Bot Setup

**Files:**
- Create: `src/bot/index.ts`
- Create: `src/bot/commands/start.ts`
- Create: `src/bot/commands/help.ts`

**Step 1: Create src/bot/index.ts**

```typescript
import { Bot, session, GrammyError, HttpError } from 'grammy';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { startCommand } from './commands/start.js';
import { helpCommand } from './commands/help.js';

export interface SessionData {
  step?: string;
  jobDraft?: Record<string, unknown>;
}

export type BotContext = Parameters<typeof bot.command>[1] extends (
  ctx: infer C
) => unknown
  ? C & { session: SessionData }
  : never;

export const bot = new Bot(config.telegramBotToken);

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

  // Start polling (use webhooks in production)
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
```

**Step 2: Create src/bot/commands/start.ts**

```typescript
import { CommandContext, Context } from 'grammy';
import { userService } from '../../services/userService.js';
import { logger } from '../../utils/logger.js';

export async function startCommand(ctx: CommandContext<Context>): Promise<void> {
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    await ctx.reply('Could not identify you. Please try again.');
    return;
  }

  try {
    const user = await userService.getOrCreate(telegramId);
    const isNew = user.createdAt.getTime() > Date.now() - 5000; // Created in last 5 seconds

    if (isNew) {
      logger.info('New user registered', { telegramId, userId: user.id });
      await ctx.reply(
        `Welcome to BMS Bot! 🎬\n\n` +
          `I can help you book movie tickets automatically on BookMyShow.\n\n` +
          `Here's how it works:\n` +
          `1. Add your gift cards with /addcard\n` +
          `2. Create a booking job with /newjob\n` +
          `3. I'll watch for tickets and book automatically!\n\n` +
          `Use /help to see all commands.`
      );
    } else {
      await ctx.reply(
        `Welcome back! 👋\n\n` +
          `Use /help to see available commands, or /newjob to create a booking.`
      );
    }
  } catch (error) {
    logger.error('Error in start command', { error, telegramId });
    await ctx.reply('Something went wrong. Please try again later.');
  }
}
```

**Step 3: Create src/bot/commands/help.ts**

```typescript
import { CommandContext, Context } from 'grammy';

export async function helpCommand(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(
    `📚 *BMS Bot Commands*\n\n` +
      `*Booking*\n` +
      `/newjob - Create a new booking job\n` +
      `/myjobs - List your active jobs\n` +
      `/cancel <id> - Cancel a job\n\n` +
      `*Gift Cards*\n` +
      `/addcard - Add a gift card\n` +
      `/mycards - List your cards\n` +
      `/removecard <id> - Remove a card\n\n` +
      `*Other*\n` +
      `/start - Show welcome message\n` +
      `/help - Show this message`,
    { parse_mode: 'Markdown' }
  );
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add basic Telegram bot with start and help commands"
```

---

## Task 9: Gift Card Commands

**Files:**
- Create: `src/bot/commands/cards.ts`
- Update: `src/bot/index.ts`

**Step 1: Create src/bot/commands/cards.ts**

```typescript
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
```

**Step 2: Update src/bot/index.ts to register card commands**

Add imports and command registrations:

```typescript
import { Bot, session, GrammyError, HttpError } from 'grammy';
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

export interface SessionData {
  step?: string;
  jobDraft?: Record<string, unknown>;
}

export const bot = new Bot(config.telegramBotToken);

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
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add gift card commands (add, list, remove)"
```

---

## Task 10: Main Entry Point

**Files:**
- Create: `src/index.ts`

**Step 1: Create src/index.ts**

```typescript
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './db/client.js';
import { startBot, stopBot } from './bot/index.js';

async function main(): Promise<void> {
  logger.info('Starting BMS Bot...', { nodeEnv: config.nodeEnv });

  // Connect to database
  await connectDatabase();
  logger.info('Database connected');

  // Start Telegram bot
  await startBot();

  logger.info('BMS Bot is running!');
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down...');

  await stopBot();
  await disconnectDatabase();

  logger.info('Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

// Start the application
main().catch((error) => {
  logger.error('Failed to start', { error });
  process.exit(1);
});
```

**Step 2: Verify build works**

```bash
yarn build
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add main entry point with graceful shutdown"
```

---

## Task 11: Railway Deployment Configuration

**Files:**
- Create: `Dockerfile`
- Create: `railway.toml`
- Create: `.dockerignore`

**Step 1: Create Dockerfile**

```dockerfile
FROM node:20-slim

# Install dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client
RUN yarn db:generate

# Build TypeScript
RUN yarn build

# Install Playwright browsers
RUN npx playwright install chromium

# Run as non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

CMD ["node", "dist/index.js"]
```

**Step 2: Create .dockerignore**

```
node_modules
dist
.env
.env.local
*.log
.git
.gitignore
README.md
docs/
```

**Step 3: Create railway.toml**

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Railway deployment configuration"
```

---

## Task 12: Final Testing and Documentation Update

**Step 1: Update README.md**

```markdown
# BMS Bot

Automated movie ticket booking for BookMyShow via Telegram bot.

## Features

- Telegram bot interface for creating booking jobs
- Gift card management with encryption
- Watch mode: monitors BMS for ticket availability
- Smart seat selection algorithm
- Automatic booking when tickets go live

## Setup

### Prerequisites

- Node.js 20+
- Docker (for local Postgres + Redis)
- Telegram Bot Token (from @BotFather)

### Local Development

1. Start databases:
   ```bash
   docker-compose up -d
   ```

2. Create `.env` from example:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. Generate encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Setup database:
   ```bash
   yarn db:push
   ```

5. Run in development:
   ```bash
   yarn dev
   ```

### Deployment (Railway)

1. Create new Railway project
2. Add PostgreSQL and Redis services
3. Connect GitHub repo
4. Set environment variables
5. Deploy!

## Commands

| Command | Description |
|---------|-------------|
| /start | Register and get welcome message |
| /help | Show available commands |
| /newjob | Create a new booking job |
| /myjobs | List your booking jobs |
| /addcard | Add a gift card |
| /mycards | List your gift cards |

## Architecture

See [Design Document](docs/plans/2025-12-25-bms-automation-design.md) for full details.
```

**Step 2: Create yarn.lock**

```bash
yarn install
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "docs: update README for Phase 1"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `yarn install` succeeds
- [ ] `yarn build` compiles without errors
- [ ] `yarn test` passes all tests
- [ ] `docker-compose up -d` starts Postgres and Redis
- [ ] `yarn dev` starts the bot (with valid .env)
- [ ] Bot responds to /start, /help, /addcard, /mycards

---

**End of Phase 1 Plan**
