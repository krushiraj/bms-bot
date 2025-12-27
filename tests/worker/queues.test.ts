import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis as a class
class MockRedis {
  on = vi.fn();
  quit = vi.fn();
}

// Mock Queue as a class
class MockQueue {
  add = vi.fn();
  close = vi.fn();
}

vi.mock('ioredis', () => ({
  default: MockRedis,
}));

vi.mock('bullmq', () => ({
  Queue: MockQueue,
}));

describe('Queue Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export watch and booking queues', async () => {
    const { watchQueue, bookingQueue } = await import('../../src/worker/queues.js');
    expect(watchQueue).toBeDefined();
    expect(bookingQueue).toBeDefined();
  });
});
