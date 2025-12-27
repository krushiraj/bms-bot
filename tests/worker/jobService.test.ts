import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobStatus } from '@prisma/client';

// Mock Prisma client - define mock inside vi.mock factory
vi.mock('../../src/db/client.js', () => ({
  prisma: {
    bookingJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Import after mocking
import { prisma } from '../../src/db/client.js';
import { JobService, CreateJobInput } from '../../src/worker/jobService.js';

// Get the mocked prisma for type-safe access
const mockPrisma = prisma as unknown as {
  bookingJob: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

describe('JobService', () => {
  let jobService: JobService;

  const mockJobInput: CreateJobInput = {
    userId: 'user-123',
    movieName: 'Test Movie',
    city: 'hyderabad',
    watchFromDate: new Date('2024-01-01T00:00:00Z'),
    watchUntilDate: new Date('2024-01-07T23:59:59Z'),
    theatres: ['AMB Cinemas', 'PVR'],
    showtimePrefs: {
      preferredTimes: ['7:00 PM', '9:00 PM'],
    },
    seatPrefs: {
      count: 2,
      avoidBottomRows: 3,
      preferCenter: true,
      needAdjacent: true,
    },
  };

  const mockJob = {
    id: 'job-123',
    userId: 'user-123',
    status: JobStatus.PENDING,
    movieName: 'Test Movie',
    city: 'hyderabad',
    watchFromDate: new Date('2024-01-01T00:00:00Z'),
    watchUntilDate: new Date('2024-01-07T23:59:59Z'),
    theatres: ['AMB Cinemas', 'PVR'],
    showtimePrefs: { preferredTimes: ['7:00 PM', '9:00 PM'] },
    seatPrefs: { count: 2, avoidBottomRows: 3, preferCenter: true, needAdjacent: true },
    bookingResult: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    jobService = new JobService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createJob', () => {
    it('should create a new booking job', async () => {
      mockPrisma.bookingJob.create.mockResolvedValue(mockJob);

      const result = await jobService.createJob(mockJobInput);

      expect(mockPrisma.bookingJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockJobInput.userId,
          movieName: mockJobInput.movieName,
          city: mockJobInput.city,
          status: JobStatus.PENDING,
        }),
      });
      expect(result.id).toBe('job-123');
    });
  });

  describe('getJobById', () => {
    it('should return job when found', async () => {
      mockPrisma.bookingJob.findUnique.mockResolvedValue(mockJob);

      const result = await jobService.getJobById('job-123');

      expect(mockPrisma.bookingJob.findUnique).toHaveBeenCalledWith({
        where: { id: 'job-123' },
      });
      expect(result).toEqual(mockJob);
    });

    it('should return null when not found', async () => {
      mockPrisma.bookingJob.findUnique.mockResolvedValue(null);

      const result = await jobService.getJobById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getJobsByUser', () => {
    it('should return all jobs for a user', async () => {
      mockPrisma.bookingJob.findMany.mockResolvedValue([mockJob]);

      const result = await jobService.getJobsByUser('user-123');

      expect(mockPrisma.bookingJob.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('getActiveJobsByUser', () => {
    it('should return only active jobs', async () => {
      mockPrisma.bookingJob.findMany.mockResolvedValue([mockJob]);

      const result = await jobService.getActiveJobsByUser('user-123');

      expect(mockPrisma.bookingJob.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: {
            in: [JobStatus.PENDING, JobStatus.WATCHING, JobStatus.BOOKING, JobStatus.AWAITING_CONSENT],
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('updateJobStatus', () => {
    it('should update job status', async () => {
      const updatedJob = { ...mockJob, status: JobStatus.WATCHING };
      mockPrisma.bookingJob.update.mockResolvedValue(updatedJob);

      const result = await jobService.updateJobStatus('job-123', JobStatus.WATCHING);

      expect(mockPrisma.bookingJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: { status: JobStatus.WATCHING },
      });
      expect(result.status).toBe(JobStatus.WATCHING);
    });
  });

  describe('updateJobResult', () => {
    it('should update job with booking result', async () => {
      const bookingResult = {
        bookingId: 'BMS-12345',
        seats: ['H-10', 'H-11'],
        theatre: 'AMB Cinemas',
        showtime: '7:00 PM',
        totalAmount: 500,
      };
      const updatedJob = {
        ...mockJob,
        status: JobStatus.SUCCESS,
        bookingResult,
      };
      mockPrisma.bookingJob.update.mockResolvedValue(updatedJob);

      const result = await jobService.updateJobResult('job-123', JobStatus.SUCCESS, bookingResult);

      expect(mockPrisma.bookingJob.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: {
          status: JobStatus.SUCCESS,
          bookingResult,
        },
      });
      expect(result.bookingResult).toEqual(bookingResult);
    });
  });

  describe('cancelJob', () => {
    it('should cancel a job', async () => {
      const cancelledJob = { ...mockJob, status: JobStatus.CANCELLED };
      mockPrisma.bookingJob.update.mockResolvedValue(cancelledJob);

      const result = await jobService.cancelJob('job-123');

      expect(result.status).toBe(JobStatus.CANCELLED);
    });
  });

  describe('getJobStats', () => {
    it('should return job statistics', async () => {
      const jobs = [
        { ...mockJob, status: JobStatus.PENDING },
        { ...mockJob, id: 'job-2', status: JobStatus.WATCHING },
        { ...mockJob, id: 'job-3', status: JobStatus.SUCCESS },
        { ...mockJob, id: 'job-4', status: JobStatus.FAILED },
      ];
      mockPrisma.bookingJob.findMany.mockResolvedValue(jobs);

      const stats = await jobService.getJobStats('user-123');

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.watching).toBe(1);
      expect(stats.success).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });
});
