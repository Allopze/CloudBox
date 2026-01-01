/**
 * Transcoding Queue using Bull (Redis-based job queue)
 * 
 * Handles video transcoding in background workers without blocking the main server.
 * Features:
 * - Concurrent job processing with limits
 * - Progress tracking via Socket.io
 * - Automatic retries with exponential backoff
 * - Job persistence across server restarts
 * - Fallback mode with p-limit for concurrency control (development only)
 * 
 * PRODUCTION NOTE: In production, Redis is REQUIRED. The fallback mode is disabled
 * to prevent CPU-intensive transcoding from competing with the API server.
 * Set REQUIRE_REDIS_WORKERS=true or NODE_ENV=production to enforce this.
 */

import Bull, { Job, Queue } from 'bull';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import pLimit from 'p-limit';
import prisma from './prisma.js';
import { config } from '../config/index.js';
import { emitTranscodingProgress, emitTranscodingComplete } from './socket.js';
import logger from './logger.js';
import { getStoragePath } from './storage.js';

// Job data interfaces
interface VideoTranscodingJobData {
  type: 'video';
  fileId: string;
  inputPath: string;
  outputPath: string;
  userId: string;
  format: 'mp4' | 'webm';
  quality: 'low' | 'medium' | 'high';
}

interface MidiTranscodingJobData {
  type: 'midi';
  fileId: string;
  inputPath: string;
  outputPath: string;
  userId: string;
}

type TranscodingJobData = VideoTranscodingJobData | MidiTranscodingJobData;

// Job result interface
interface TranscodingJobResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  duration?: number;
}

// Queue configuration
const QUEUE_CONFIG = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
  },
  limiter: {
    max: 2, // Max 2 concurrent transcoding jobs
    duration: 1000,
  },
};

// Production mode: require Redis for worker isolation
const isProduction = process.env.NODE_ENV === 'production';
const requireRedis = process.env.REQUIRE_REDIS_WORKERS === 'true' || isProduction;

// Quality presets for FFmpeg
const QUALITY_PRESETS = {
  low: {
    videoBitrate: '500k',
    audioBitrate: '96k',
    scale: '640:-2',
    preset: 'ultrafast',
  },
  medium: {
    videoBitrate: '1500k',
    audioBitrate: '128k',
    scale: '1280:-2',
    preset: 'fast',
  },
  high: {
    videoBitrate: '4000k',
    audioBitrate: '192k',
    scale: '1920:-2',
    preset: 'medium',
  },
};

let transcodingQueue: Queue<TranscodingJobData> | null = null;
let isRedisAvailable = false;

// Fallback concurrency limiter: limits concurrent transcoding jobs when Redis is unavailable
// This prevents CPU saturation that would affect upload/download performance
const FALLBACK_CONCURRENCY = parseInt(process.env.TRANSCODING_FALLBACK_CONCURRENCY || '2');
const fallbackLimiter = pLimit(FALLBACK_CONCURRENCY);

/**
 * Check if Redis is available
 */
async function checkRedisConnection(): Promise<boolean> {
  try {
    const RedisModule = await import('ioredis');
    const Redis = RedisModule.default;
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

    return true;
  } catch (error) {
    logger.warn('Redis not available, transcoding queue will use fallback mode', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return false;
  }
}

/**
 * Initialize the transcoding queue
 */
export async function initTranscodingQueue(): Promise<void> {
  isRedisAvailable = await checkRedisConnection();

  if (!isRedisAvailable) {
    logger.info('Transcoding queue running in fallback mode (no Redis)', {
      concurrencyLimit: FALLBACK_CONCURRENCY,
    });
    return;
  }

  transcodingQueue = new Bull<TranscodingJobData>('transcoding', {
    redis: QUEUE_CONFIG.redis,
    defaultJobOptions: QUEUE_CONFIG.defaultJobOptions,
    limiter: QUEUE_CONFIG.limiter,
  });

  // Process jobs with explicit concurrency (default is 1)
  // Use 2 concurrent workers to balance throughput with resource usage
  const BULL_CONCURRENCY = parseInt(process.env.TRANSCODING_BULL_CONCURRENCY || '2');
  transcodingQueue.process(BULL_CONCURRENCY, async (job: Job<TranscodingJobData>) => {
    return processTranscodingJob(job);
  });

  // Event handlers
  transcodingQueue.on('completed', (job: Job<TranscodingJobData>, result: TranscodingJobResult) => {
    logger.info('Transcoding job completed', {
      jobId: job.id,
      fileId: job.data.fileId,
      duration: result.duration,
    });
  });

  transcodingQueue.on('failed', (job: Job<TranscodingJobData>, error: Error) => {
    logger.error('Transcoding job failed', {
      jobId: job.id,
      fileId: job.data.fileId,
      error: error.message,
    });
  });

  transcodingQueue.on('error', (error: Error) => {
    logger.error('Transcoding queue error', {}, error);
  });

  logger.info('Transcoding queue initialized with Redis');
}

/**
 * Process a transcoding job
 */
async function processTranscodingJob(job: Job<TranscodingJobData>): Promise<TranscodingJobResult> {
  const { fileId, inputPath, outputPath } = job.data;
  const startTime = Date.now();

  // Update job status in database
  await prisma.transcodingJob.upsert({
    where: { fileId },
    create: {
      fileId,
      status: 'PROCESSING',
      progress: 0,
    },
    update: {
      status: 'PROCESSING',
      progress: 0,
      error: null,
    },
  });

  // Emit progress
  emitTranscodingProgress(fileId, 0, 'PROCESSING');

  try {
    // Check if input file exists
    await fs.access(inputPath);

    if (job.data.type === 'video') {
      // Get video duration for progress calculation
      const duration = await getVideoDuration(inputPath);
      const preset = QUALITY_PRESETS[job.data.quality as keyof typeof QUALITY_PRESETS];

      // Transcode with progress tracking
      await transcodeVideo(inputPath, outputPath, job.data.format, preset, (progress) => {
        job.progress(progress);
        emitTranscodingProgress(fileId, progress, 'PROCESSING');

        // Update database periodically
        if (progress % 10 === 0) {
          prisma.transcodingJob.update({
            where: { fileId },
            data: { progress },
          }).catch(() => { });
        }
      }, duration);
    } else {
      const updateProgress = (progress: number) => {
        job.progress(progress);
        emitTranscodingProgress(fileId, progress, 'PROCESSING');
        prisma.transcodingJob.update({
          where: { fileId },
          data: { progress },
        }).catch(() => { });
      };

      updateProgress(10);
      await renderMidiToMp3(inputPath, outputPath, updateProgress);
      updateProgress(100);
    }

    // Update file record with transcoded path
    await prisma.file.update({
      where: { id: fileId },
      data: { transcodedPath: outputPath },
    });

    // Update job status
    await prisma.transcodingJob.update({
      where: { fileId },
      data: {
        status: 'COMPLETED',
        progress: 100,
      },
    });

    // Emit completion
    emitTranscodingComplete(fileId, outputPath);

    const processingDuration = Date.now() - startTime;
    return {
      success: true,
      outputPath,
      duration: processingDuration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update job status
    await prisma.transcodingJob.update({
      where: { fileId },
      data: {
        status: 'FAILED',
        error: errorMessage,
      },
    }).catch(() => { });

    // Emit error progress
    emitTranscodingProgress(fileId, 0, 'FAILED');

    throw error;
  }
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        resolve(0); // Default to 0 if we can't get duration
      }
    });

    ffprobe.on('error', () => {
      resolve(0);
    });
  });
}

/**
 * Transcode video using FFmpeg
 */
async function transcodeVideo(
  inputPath: string,
  outputPath: string,
  format: 'mp4' | 'webm',
  preset: typeof QUALITY_PRESETS.medium,
  onProgress: (progress: number) => void,
  totalDuration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    fs.mkdir(outputDir, { recursive: true }).catch(() => { });

    const args = [
      '-i', inputPath,
      '-c:v', format === 'mp4' ? 'libx264' : 'libvpx-vp9',
      '-preset', preset.preset,
      '-b:v', preset.videoBitrate,
      '-vf', `scale=${preset.scale}`,
      '-c:a', format === 'mp4' ? 'aac' : 'libopus',
      '-b:a', preset.audioBitrate,
      '-movflags', '+faststart', // For streaming
      '-y', // Overwrite output
      '-progress', 'pipe:1', // Progress to stdout
      outputPath,
    ];

    const ffmpeg = spawn('ffmpeg', args);
    let lastProgress = 0;

    ffmpeg.stdout.on('data', (data) => {
      const output = data.toString();
      const timeMatch = output.match(/out_time_us=(\d+)/);

      if (timeMatch && totalDuration > 0) {
        const currentTime = parseInt(timeMatch[1]) / 1000000;
        const progress = Math.min(99, Math.round((currentTime / totalDuration) * 100));

        if (progress > lastProgress) {
          lastProgress = progress;
          onProgress(progress);
        }
      }
    });

    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg outputs progress to stderr as well
      logger.debug('FFmpeg output', { output: data.toString().substring(0, 200) });
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (error) => {
      reject(error);
    });
  });
}

async function renderMidiToMp3(
  inputPath: string,
  outputPath: string,
  onProgress: (progress: number) => void
): Promise<void> {
  const { soundfontPath, fluidsynthPath, sampleRate, gain, mp3Quality, renderTimeoutMs } = config.midi;

  if (!soundfontPath) {
    throw new Error('MIDI soundfont path is not configured');
  }

  await fs.access(soundfontPath);

  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  const tempWavPath = getStoragePath('temp', `${path.basename(outputPath, '.mp3')}_${Date.now()}.wav`);

    try {
      await runProcessWithTimeout(
        fluidsynthPath,
        [
          '-ni',
          '-g', String(gain),
          '-r', String(sampleRate),
          '-F', tempWavPath,
          '-T', 'wav',
          soundfontPath,
          inputPath,
        ],
        renderTimeoutMs,
        'fluidsynth'
      );

    onProgress(50);

    await runProcessWithTimeout(
      'ffmpeg',
      [
        '-y',
        '-i', tempWavPath,
        '-codec:a', 'libmp3lame',
        '-q:a', String(mp3Quality),
        outputPath,
      ],
      renderTimeoutMs,
      'ffmpeg'
    );
  } finally {
    await fs.unlink(tempWavPath).catch(() => { });
  }
}

async function runProcessWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number,
  label: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}: ${stderr.substring(0, 500)}`));
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Add a transcoding job to the queue
 */
export async function addTranscodingJob(
  fileId: string,
  inputPath: string,
  userId: string,
  format: 'mp4' | 'webm' = 'mp4',
  quality: 'low' | 'medium' | 'high' = 'medium'
): Promise<string | null> {
  // Generate output path
  const ext = format === 'mp4' ? '.mp4' : '.webm';
  const outputPath = getStoragePath('files', userId, `${fileId}_transcoded${ext}`);

  const jobData: TranscodingJobData = {
    type: 'video',
    fileId,
    inputPath,
    outputPath,
    userId,
    format,
    quality,
  };

  return enqueueTranscodingJob(jobData);
}

export async function addMidiTranscodingJob(
  fileId: string,
  inputPath: string,
  userId: string
): Promise<string | null> {
  const outputPath = getStoragePath('files', userId, `${fileId}_transcoded.mp3`);

  const jobData: TranscodingJobData = {
    type: 'midi',
    fileId,
    inputPath,
    outputPath,
    userId,
  };

  return enqueueTranscodingJob(jobData);
}

async function enqueueTranscodingJob(jobData: TranscodingJobData): Promise<string | null> {
  const { fileId, userId } = jobData;

  // If Redis is available, use Bull queue
  if (transcodingQueue && isRedisAvailable) {
    const job = await transcodingQueue.add(jobData, {
      jobId: fileId, // Use fileId as job ID for deduplication
    });
    return job.id?.toString() || null;
  }

  // Production mode: reject jobs if Redis is required but not available
  if (requireRedis) {
    logger.error('Transcoding job rejected: Redis required in production but not available', {
      fileId,
      userId,
    });

    // Update job status to reflect the failure
    await prisma.transcodingJob.upsert({
      where: { fileId },
      create: {
        fileId,
        status: 'FAILED',
        progress: 0,
        error: 'Transcoding unavailable: Redis workers not configured',
      },
      update: {
        status: 'FAILED',
        error: 'Transcoding unavailable: Redis workers not configured',
      },
    });

    return null;
  }

  // Fallback: Process with concurrency limit to avoid CPU saturation (development only)
  // This ensures uploads/downloads aren't impacted by transcoding
  logger.warn('Processing transcoding job in fallback mode (development only)', {
    fileId,
    concurrencyLimit: FALLBACK_CONCURRENCY,
    pendingJobs: fallbackLimiter.pendingCount,
    activeJobs: fallbackLimiter.activeCount,
  });

  // Create a fake job object for the processor
  const fakeJob = {
    id: fileId,
    data: jobData,
    progress: (p: number) => {
      emitTranscodingProgress(fileId, p, 'PROCESSING');
    },
  } as unknown as Job<TranscodingJobData>;

  // Process with concurrency limiter - prevents blocking API resources
  fallbackLimiter(() => processTranscodingJob(fakeJob)).catch((error) => {
    logger.error('Fallback transcoding failed', { fileId, error: error.message });
  });

  return fileId;
}

/**
 * Get transcoding job status
 */
export async function getTranscodingJobStatus(fileId: string): Promise<{
  status: string;
  progress: number;
  error?: string;
} | null> {
  const job = await prisma.transcodingJob.findUnique({
    where: { fileId },
  });

  if (!job) return null;

  return {
    status: job.status,
    progress: job.progress,
    error: job.error || undefined,
  };
}

/**
 * Cancel a transcoding job
 */
export async function cancelTranscodingJob(fileId: string): Promise<boolean> {
  if (transcodingQueue && isRedisAvailable) {
    const job = await transcodingQueue.getJob(fileId);
    if (job) {
      await job.remove();
    }
  }

  await prisma.transcodingJob.update({
    where: { fileId },
    data: {
      status: 'CANCELLED',
    },
  }).catch(() => { });

  return true;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  isRedisAvailable: boolean;
}> {
  if (!transcodingQueue || !isRedisAvailable) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      isRedisAvailable: false,
    };
  }

  const [waiting, active, completed, failed] = await Promise.all([
    transcodingQueue.getWaitingCount(),
    transcodingQueue.getActiveCount(),
    transcodingQueue.getCompletedCount(),
    transcodingQueue.getFailedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    isRedisAvailable: true,
  };
}

/**
 * Cleanup completed jobs older than specified days
 */
export async function cleanupOldJobs(daysOld: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const { count } = await prisma.transcodingJob.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'CANCELLED'] },
      updatedAt: { lt: cutoffDate },
    },
  });

  return count;
}

/**
 * Retry all failed jobs in the queue
 */
export async function retryAllFailedJobs(): Promise<number> {
  if (!transcodingQueue || !isRedisAvailable) {
    return 0;
  }

  const failedJobs = await transcodingQueue.getFailed();
  let retriedCount = 0;

  for (const job of failedJobs) {
    try {
      await job.retry();
      retriedCount++;
    } catch (error) {
      logger.warn('Failed to retry job', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  // Also update database records
  await prisma.transcodingJob.updateMany({
    where: { status: 'FAILED' },
    data: { status: 'PENDING', error: null },
  });

  return retriedCount;
}

/**
 * Clear all stalled jobs from the queue
 */
export async function clearStalledJobs(): Promise<number> {
  if (!transcodingQueue || !isRedisAvailable) {
    return 0;
  }

  // Get stalled jobs count before clearing
  const stalledJobs = await transcodingQueue.getJobs(['active']);
  let clearedCount = 0;

  try {
    // Clean active jobs that may be stalled (older than 1 hour)
    await transcodingQueue.clean(3600000, 'active'); // 1 hour in ms
    clearedCount = stalledJobs.length;
  } catch (error) {
    logger.error('Failed to clear stalled jobs', {}, error instanceof Error ? error : new Error(String(error)));
  }

  return clearedCount;
}

/**
 * Remove all failed jobs without retry
 */
export async function cleanupAllFailedJobs(): Promise<number> {
  if (!transcodingQueue || !isRedisAvailable) {
    // Only cleanup database records
    const { count } = await prisma.transcodingJob.deleteMany({
      where: { status: 'FAILED' },
    });
    return count;
  }

  const failedJobs = await transcodingQueue.getFailed();
  let removedCount = 0;

  for (const job of failedJobs) {
    try {
      await job.remove();
      removedCount++;
    } catch (error) {
      logger.warn('Failed to remove job', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  // Also cleanup database records
  await prisma.transcodingJob.deleteMany({
    where: { status: 'FAILED' },
  });

  return removedCount;
}

/**
 * Get detailed queue statistics including stalled jobs
 */
export async function getDetailedQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  isRedisAvailable: boolean;
  dbStats: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
}> {
  // Get database stats
  const dbStats = await prisma.transcodingJob.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  const dbStatsMap = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const stat of dbStats) {
    const key = stat.status.toLowerCase() as keyof typeof dbStatsMap;
    if (key in dbStatsMap) {
      dbStatsMap[key] = stat._count.status;
    }
  }

  if (!transcodingQueue || !isRedisAvailable) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
      isRedisAvailable: false,
      dbStats: dbStatsMap,
    };
  }

  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    transcodingQueue.getWaitingCount(),
    transcodingQueue.getActiveCount(),
    transcodingQueue.getCompletedCount(),
    transcodingQueue.getFailedCount(),
    transcodingQueue.getDelayedCount(),
    transcodingQueue.getPausedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused,
    isRedisAvailable: true,
    dbStats: dbStatsMap,
  };
}
