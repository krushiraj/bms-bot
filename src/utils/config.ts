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
