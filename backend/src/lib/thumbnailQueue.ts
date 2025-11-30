import { generateThumbnail } from './thumbnail.js';
import prisma from './prisma.js';

interface ThumbnailJob {
  fileId: string;
  filePath: string;
  mimeType: string;
  userId?: string; // Security: Track user for rate limiting
}

// Security: Per-user rate limiting for thumbnail generation
interface UserThumbnailLimit {
  count: number;
  resetAt: number;
}

class ThumbnailQueue {
  private queue: ThumbnailJob[] = [];
  private processing = false;
  private concurrency = 2; // Process 2 thumbnails at a time
  private activeJobs = 0;
  private maxQueueSize = 1000; // Maximum queue size to prevent memory leaks
  
  // Security: Per-user limits to prevent abuse
  private userLimits = new Map<string, UserThumbnailLimit>();
  private readonly maxJobsPerUserPerHour = 100;
  private readonly userLimitWindowMs = 60 * 60 * 1000; // 1 hour

  private checkUserLimit(userId?: string): boolean {
    if (!userId) return true; // Allow anonymous jobs (shared files)
    
    const now = Date.now();
    const limit = this.userLimits.get(userId);
    
    if (!limit || limit.resetAt < now) {
      this.userLimits.set(userId, {
        count: 1,
        resetAt: now + this.userLimitWindowMs,
      });
      return true;
    }
    
    if (limit.count >= this.maxJobsPerUserPerHour) {
      console.warn(`Thumbnail rate limit exceeded for user ${userId}`);
      return false;
    }
    
    limit.count++;
    return true;
  }

  add(job: ThumbnailJob): boolean {
    if (this.queue.length >= this.maxQueueSize) {
      console.warn('Thumbnail queue is full, dropping job for file:', job.fileId);
      return false;
    }
    
    // Security: Check per-user rate limit
    if (!this.checkUserLimit(job.userId)) {
      return false;
    }
    
    this.queue.push(job);
    this.processNext();
    return true;
  }

  addBatch(jobs: ThumbnailJob[]): number {
    const availableSlots = this.maxQueueSize - this.queue.length;
    let addedCount = 0;
    
    for (const job of jobs) {
      if (addedCount >= availableSlots) {
        break;
      }
      
      // Security: Check per-user rate limit for each job
      if (this.checkUserLimit(job.userId)) {
        this.queue.push(job);
        addedCount++;
      }
    }
    
    if (addedCount < jobs.length) {
      console.warn(`Thumbnail queue limited: only adding ${addedCount} of ${jobs.length} jobs`);
    }
    
    this.processNext();
    return addedCount;
  }

  private async processNext(): Promise<void> {
    if (this.activeJobs >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeJobs++;

    try {
      const thumbnailPath = await generateThumbnail(job.filePath, job.fileId, job.mimeType);
      if (thumbnailPath) {
        await prisma.file.update({
          where: { id: job.fileId },
          data: { thumbnailPath },
        }).catch((err) => {
          // File might have been deleted, ignore error
          console.error('Failed to update thumbnail path:', err.message);
        });
      }
    } catch (error) {
      console.error('Thumbnail generation failed for', job.fileId, ':', error);
    } finally {
      this.activeJobs--;
      // Process next job
      this.processNext();
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get activeCount(): number {
    return this.activeJobs;
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
}

// Singleton instance
export const thumbnailQueue = new ThumbnailQueue();

// Cleanup user limits every 10 minutes
setInterval(() => {
  thumbnailQueue.cleanupUserLimits();
}, 10 * 60 * 1000);
