import Redis from 'ioredis';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export function createRedisConnection(name: string): Redis {
  const connection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on('error', (err) => {
    logger.error(`Redis ${name} connection error`, { error: String(err) });
  });

  connection.on('connect', () => {
    logger.info(`Redis ${name} connected`);
  });

  return connection;
}
