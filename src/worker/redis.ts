import Redis from 'ioredis';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

// Track all connections for cleanup
const connections: Redis[] = [];

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

  connections.push(connection);
  return connection;
}

/**
 * Test if Redis is available
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const testConn = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
    });

    await testConn.ping();
    await testConn.quit();
    return true;
  } catch (error) {
    logger.warn('Redis connection test failed', { error: String(error) });
    return false;
  }
}

/**
 * Close all Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
  const closePromises = connections.map(async (conn) => {
    try {
      await conn.quit();
    } catch {
      // Ignore errors during cleanup
    }
  });

  await Promise.all(closePromises);
  connections.length = 0;
  logger.info('Redis connections closed');
}
