import { Queue } from 'bullmq';
import { createRedisConnection } from './redis.js';

const connection = createRedisConnection('queues');

export const watchQueue = new Queue('watch', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const bookingQueue = new Queue('booking', {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});
