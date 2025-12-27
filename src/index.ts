import 'dotenv/config';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './db/client.js';
import { startBot, stopBot } from './bot/index.js';
import { startWorkers, stopWorkers } from './worker/worker.js';
import { startScheduler, stopScheduler } from './worker/scheduler.js';
import { testRedisConnection, closeRedisConnections } from './worker/redis.js';

async function main(): Promise<void> {
  logger.info('Starting BMS Bot...', { nodeEnv: config.nodeEnv });

  // Connect to database
  await connectDatabase();
  logger.info('Database connected');

  // Test Redis connection
  const redisConnected = await testRedisConnection();
  if (redisConnected) {
    logger.info('Redis connected');

    // Start job workers
    startWorkers();
    logger.info('Job workers started');

    // Start job scheduler
    startScheduler();
    logger.info('Job scheduler started');
  } else {
    logger.warn('Redis not available - job processing disabled');
  }

  // Start Telegram bot
  await startBot();

  logger.info('BMS Bot is running!');
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down...');

  // Stop scheduler first
  stopScheduler();

  // Stop workers
  await stopWorkers();

  // Close Redis connections
  await closeRedisConnections();

  // Stop bot and database
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
