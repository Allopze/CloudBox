import Bull, { Job, Queue } from 'bull';
import pLimit, { LimitFunction } from 'p-limit';
import { generateThumbnail } from './thumbnail.js';
import prisma from './prisma.js';
import logger from './logger.js';

interface ThumbnailJob {
  fileId: string;
  filePath: string;
  mimeType: string;
  userId?: string; // Security: Track user for rate limiting
}

// Queue configuration
const QUEUE_CONFIG = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
  concurrency: parseInt(process.env.THUMBNAIL_CONCURRENCY || '4'), // Process N thumbnails at a time with Redis
  fallbackConcurrency: parseInt(process.env.THUMBNAIL_FALLBACK_CONCURRENCY || '2'), // Fallback concurrency
  // Rate limiting per user
  maxJobsPerUserPerHour: parseInt(process.env.THUMBNAIL_RATE_LIMIT_PER_HOUR || '1000'),
  rateLimitWindowMs: parseInt(process.env.THUMBNAIL_RATE_LIMIT_WINDOW_MS || '3600000'), // 1 hour default
};

// Production mode: require Redis for worker isolation
const isProduction = process.env.NODE_ENV === 'production';
const requireRedis = process.env.REQUIRE_REDIS_WORKERS === 'true' || isProduction;

// Bull queue instance
let bullQueue: Queue<ThumbnailJob> | null = null;
let isRedisAvailable = false;

// Security: Per-user rate limiting for thumbnail generation
interface UserThumbnailLimit {
  count: number;
  resetAt: number;
}

class ThumbnailQueue {
  private queue: ThumbnailJob[] = [];
  private processing = false;
  private maxQueueSize = 1000; // Maximum queue size to prevent memory leaks
  
  // p-limit for concurrency control in fallback mode
  private limiter: LimitFunction;
  
  // Security: Per-user limits to prevent abuse (configurable via env vars)
  private userLimits = new Map<string, UserThumbnailLimit>();

  constructor() {
    // Initialize the limiter with configured concurrency
    this.limiter = pLimit(QUEUE_CONFIG.fallbackConcurrency);
    logger.info('ThumbnailQueue initialized', { 
      fallbackConcurrency: QUEUE_CONFIG.fallbackConcurrency,
      maxJobsPerUserPerHour: QUEUE_CONFIG.maxJobsPerUserPerHour,
    });
  }

  private checkUserLimit(userId?: string): boolean {
    if (!userId) return true; // Allow anonymous jobs (shared files)
    
    const now = Date.now();
    const limit = this.userLimits.get(userId);
    
    if (!limit || limit.resetAt < now) {
      this.userLimits.set(userId, {
        count: 1,
        resetAt: now + QUEUE_CONFIG.rateLimitWindowMs,
      });
      return true;
    }
    
    if (limit.count >= QUEUE_CONFIG.maxJobsPerUserPerHour) {
      logger.warn('Thumbnail rate limit exceeded', { userId });
      return false;
    }
    
    limit.count++;
    return true;
  }

  add(job: ThumbnailJob): boolean {
    // Security: Check per-user rate limit
    if (!this.checkUserLimit(job.userId)) {
      return false;
    }

    // Use Bull queue if Redis is available
    if (isRedisAvailable && bullQueue) {
      bullQueue.add(job, QUEUE_CONFIG.defaultJobOptions);
      return true;
    }

    // Production mode: reject jobs if Redis is required but not available
    if (requireRedis) {
      logger.error('Thumbnail job rejected: Redis required in production but not available', { 
        fileId: job.fileId 
      });
      return false;
    }

    // Fallback to in-memory queue with p-limit concurrency control (development only)
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn('Thumbnail queue is full, dropping job', { fileId: job.fileId });
      return false;
    }
    
    this.queue.push(job);
    this.processQueue();
    return true;
  }

  addBatch(jobs: ThumbnailJob[]): number {
    let addedCount = 0;
    
    for (const job of jobs) {
      if (this.add(job)) {
        addedCount++;
      }
    }
    
    if (addedCount < jobs.length) {
      logger.warn('Thumbnail queue limited', { added: addedCount, requested: jobs.length });
    }
    
    return addedCount;
  }

  /**
   * Process the queue using p-limit for concurrency control
   * This is more efficient than manual activeJobs tracking
   */
  private processQueue(): void {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      // Use limiter to control concurrency - this returns immediately
      // but the actual work is queued and limited
      this.limiter(async () => {
        try {
          const thumbnailPath = await generateThumbnail(job.filePath, job.fileId, job.mimeType);
          if (thumbnailPath) {
            await prisma.file.update({
              where: { id: job.fileId },
              data: { thumbnailPath },
            }).catch((err) => {
              // File might have been deleted, ignore error
              logger.debug('Failed to update thumbnail path (file may be deleted)', { fileId: job.fileId, error: err.message });
            });
          }
        } catch (error) {
          logger.error('Thumbnail generation failed', { fileId: job.fileId }, error instanceof Error ? error : undefined);
        }
      });
    }
  }

  get pendingCount(): number {
    return this.queue.length + this.limiter.pendingCount;
  }

  get activeCount(): number {
    return this.limiter.activeCount;
  }
  
  // Cleanup old user limits periodically
  cleanupUserLimits(): void {
    const now = Date.now();
    for (const [userId, limit] of this.userLimits.entries()) {
      if (limit.resetAt < now) {
        this.userLimits.delete(userId);
      }
    }
  }

  // Check if using Redis
  get isUsingRedis(): boolean {
    return isRedisAvailable;
  }
}

// Singleton instance
export const thumbnailQueue = new ThumbnailQueue();

// Cleanup user limits every 10 minutes
setInterval(() => {
  thumbnailQueue.cleanupUserLimits();
}, 10 * 60 * 1000);

/**
 * Process a thumbnail job (used by Bull worker)
 */
async function processThumbnailJob(job: Job<ThumbnailJob>): Promise<string | null> {
  const { fileId, filePath, mimeType } = job.data;

  try {
    const thumbnailPath = await generateThumbnail(filePath, fileId, mimeType);
    if (thumbnailPath) {
      await prisma.file.update({
        where: { id: fileId },
        data: { thumbnailPath },
      }).catch((err) => {
        logger.debug('Failed to update thumbnail path (file may be deleted)', { fileId, error: err.message });
      });
    }
    return thumbnailPath;
  } catch (error) {
    logger.error('Thumbnail generation failed', { fileId }, error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Initialize the thumbnail queue with Redis
 */
export async function initThumbnailQueue(): Promise<void> {
  try {
    // Try to connect to Redis using dynamic import
    const Redis = (await import('ioredis')).default;
    // @ts-ignore - ioredis types issue with ESM
    const redis = new Redis({
      host: QUEUE_CONFIG.redis.host,
      port: QUEUE_CONFIG.redis.port,
      password: QUEUE_CONFIG.redis.password,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    let resolved = false;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          redis.disconnect();
        }
      };

      redis.once('ready', () => {
        cleanup();
        resolve();
      });
      
      redis.once('error', (err: Error) => {
        cleanup();
        reject(err);
      });
      
      setTimeout(() => {
        cleanup();
        reject(new Error('Redis connection timeout'));
      }, 3000);

      redis.connect().catch((err: Error) => {
        cleanup();
        reject(err);
      });
    });

    // Redis is available, create Bull queue
    bullQueue = new Bull<ThumbnailJob>('thumbnails', {
      redis: QUEUE_CONFIG.redis,
      defaultJobOptions: QUEUE_CONFIG.defaultJobOptions,
    });

    // Process jobs
    bullQueue.process(QUEUE_CONFIG.concurrency, processThumbnailJob);

    // Event handlers
    bullQueue.on('completed', (job) => {
      logger.debug('Thumbnail job completed', { fileId: job.data.fileId });
    });

    bullQueue.on('failed', (job, error) => {
      logger.warn('Thumbnail job failed', { 
        fileId: job?.data.fileId,
        error: error.message,
      });
    });

    bullQueue.on('error', (error: Error) => {
      logger.error('Thumbnail queue error', {}, error);
    });

    isRedisAvailable = true;
    logger.info('Thumbnail queue initialized with Redis');
  } catch (error) {
    logger.warn('Thumbnail queue using in-memory fallback (Redis not available)', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    isRedisAvailable = false;
  }
}

/**
 * Get thumbnail queue statistics
 */
export async function getThumbnailQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  usingRedis: boolean;
}> {
  if (isRedisAvailable && bullQueue) {
    const [waiting, active, completed, failed] = await Promise.all([
      bullQueue.getWaitingCount(),
      bullQueue.getActiveCount(),
      bullQueue.getCompletedCount(),
      bullQueue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed, usingRedis: true };
  }

  return {
    waiting: thumbnailQueue.pendingCount,
    active: thumbnailQueue.activeCount,
    completed: 0,
    failed: 0,
    usingRedis: false,
  };
}

/**
 * Close the thumbnail queue
 */
export async function closeThumbnailQueue(): Promise<void> {
  if (bullQueue) {
    await bullQueue.close();
    bullQueue = null;
  }
}
