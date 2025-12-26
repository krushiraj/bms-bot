import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    quit: vi.fn(),
  })),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    close: vi.fn(),
  })),
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
