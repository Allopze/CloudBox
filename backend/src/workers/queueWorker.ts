/**
 * Standalone Bull Worker Process
 * 
 * Run this in a separate process/container to offload heavy queue processing
 * from the main API server. This prevents transcoding/thumbnail generation
 * from competing with upload/download CPU/IO.
 * 
 * Usage:
 *   # Development
 *   npx tsx src/workers/queueWorker.ts
 *   
 *   # Production
 *   node dist/workers/queueWorker.js
 *   
 *   # Docker/Container
 *   docker run cloudbox-worker node dist/workers/queueWorker.js
 * 
 * Environment variables:
 *   REDIS_HOST, REDIS_PORT, REDIS_PASSWORD - Redis connection
 *   WORKER_CONCURRENCY - Number of concurrent jobs (default: 2)
 *   WORKER_TYPE - 'all' | 'transcoding' | 'thumbnails' (default: 'all')
 */

import Bull, { Job } from 'bull';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import prisma from '../lib/prisma.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { getStoragePath } from '../lib/storage.js';
import logger from '../lib/logger.js';

// Worker configuration
const WORKER_CONFIG = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2'),
  workerType: (process.env.WORKER_TYPE || 'all') as 'all' | 'transcoding' | 'thumbnails',
};

// Quality presets for FFmpeg (same as in transcodingQueue.ts)
const QUALITY_PRESETS = {
  low: { videoBitrate: '500k', audioBitrate: '96k', scale: '640:-2', preset: 'ultrafast' },
  medium: { videoBitrate: '1500k', audioBitrate: '128k', scale: '1280:-2', preset: 'fast' },
  high: { videoBitrate: '4000k', audioBitrate: '192k', scale: '1920:-2', preset: 'medium' },
};

// Job interfaces
interface TranscodingJobData {
  fileId: string;
  inputPath: string;
  outputPath: string;
  userId: string;
  format: 'mp4' | 'webm';
  quality: 'low' | 'medium' | 'high';
}

interface ThumbnailJob {
  fileId: string;
  filePath: string;
  mimeType: string;
  userId?: string;
}

/**
 * Process transcoding job
 */
async function processTranscodingJob(job: Job<TranscodingJobData>): Promise<void> {
  const { fileId, inputPath, outputPath, format, quality } = job.data;
  const preset = QUALITY_PRESETS[quality];

  logger.info('Worker processing transcoding job', { jobId: job.id, fileId });

  // Update status to processing
  await prisma.transcodingJob.upsert({
    where: { fileId },
    create: { fileId, status: 'PROCESSING', progress: 0 },
    update: { status: 'PROCESSING', progress: 0, error: null },
  });

  try {
    await fs.access(inputPath);
    
    // Get duration for progress
    const duration = await getVideoDuration(inputPath);
    
    // Transcode
    await transcodeVideo(inputPath, outputPath, format, preset, async (progress) => {
      job.progress(progress);
      if (progress % 10 === 0) {
        await prisma.transcodingJob.update({
          where: { fileId },
          data: { progress },
        }).catch(() => {});
      }
    }, duration);

    // Update file with transcoded path
    await prisma.file.update({
      where: { id: fileId },
      data: { transcodedPath: outputPath },
    });

    await prisma.transcodingJob.update({
      where: { fileId },
      data: { status: 'COMPLETED', progress: 100 },
    });

    logger.info('Worker completed transcoding job', { jobId: job.id, fileId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.transcodingJob.update({
      where: { fileId },
      data: { status: 'FAILED', error: errorMessage },
    }).catch(() => {});
    throw error;
  }
}

/**
 * Process thumbnail job
 */
async function processThumbnailJob(job: Job<ThumbnailJob>): Promise<void> {
  const { fileId, filePath, mimeType } = job.data;

  logger.info('Worker processing thumbnail job', { jobId: job.id, fileId });

  try {
    const thumbnailPath = await generateThumbnail(filePath, fileId, mimeType);
    if (thumbnailPath) {
      await prisma.file.update({
        where: { id: fileId },
        data: { thumbnailPath },
      }).catch(() => {});
    }
    logger.debug('Worker completed thumbnail job', { jobId: job.id, fileId });
  } catch (error) {
    logger.error('Worker thumbnail job failed', { jobId: job.id, fileId }, error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => { output += data.toString(); });
    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        resolve(0);
      }
    });
    ffprobe.on('error', () => resolve(0));
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
    const outputDir = path.dirname(outputPath);
    fs.mkdir(outputDir, { recursive: true }).catch(() => {});

    const args = [
      '-i', inputPath,
      '-c:v', format === 'mp4' ? 'libx264' : 'libvpx-vp9',
      '-preset', preset.preset,
      '-b:v', preset.videoBitrate,
      '-vf', `scale=${preset.scale}`,
      '-c:a', format === 'mp4' ? 'aac' : 'libopus',
      '-b:a', preset.audioBitrate,
      '-movflags', '+faststart',
      '-y',
      '-progress', 'pipe:1',
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

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}

/**
 * Main worker entry point
 */
async function startWorker(): Promise<void> {
  logger.info('Starting Bull worker process', {
    workerType: WORKER_CONFIG.workerType,
    concurrency: WORKER_CONFIG.concurrency,
    redis: `${WORKER_CONFIG.redis.host}:${WORKER_CONFIG.redis.port}`,
  });

  // Connect to database
  await prisma.$connect();
  logger.info('Worker connected to database');

  const queues: Bull.Queue[] = [];

  // Initialize transcoding queue worker
  if (WORKER_CONFIG.workerType === 'all' || WORKER_CONFIG.workerType === 'transcoding') {
    const transcodingQueue = new Bull<TranscodingJobData>('transcoding', {
      redis: WORKER_CONFIG.redis,
    });

    transcodingQueue.process(WORKER_CONFIG.concurrency, processTranscodingJob);

    transcodingQueue.on('completed', (job) => {
      logger.info('Transcoding job completed', { jobId: job.id, fileId: job.data.fileId });
    });

    transcodingQueue.on('failed', (job, error) => {
      logger.error('Transcoding job failed', { jobId: job.id, fileId: job.data.fileId, error: error.message });
    });

    queues.push(transcodingQueue);
    logger.info('Transcoding worker started', { concurrency: WORKER_CONFIG.concurrency });
  }

  // Initialize thumbnail queue worker
  if (WORKER_CONFIG.workerType === 'all' || WORKER_CONFIG.workerType === 'thumbnails') {
    const thumbnailQueue = new Bull<ThumbnailJob>('thumbnails', {
      redis: WORKER_CONFIG.redis,
    });

    thumbnailQueue.process(WORKER_CONFIG.concurrency * 2, processThumbnailJob); // Thumbnails are lighter

    thumbnailQueue.on('completed', (job) => {
      logger.debug('Thumbnail job completed', { jobId: job.id, fileId: job.data.fileId });
    });

    thumbnailQueue.on('failed', (job, error) => {
      logger.warn('Thumbnail job failed', { jobId: job?.id, fileId: job?.data.fileId, error: error.message });
    });

    queues.push(thumbnailQueue);
    logger.info('Thumbnail worker started', { concurrency: WORKER_CONFIG.concurrency * 2 });
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info('Worker received shutdown signal', { signal });

    for (const queue of queues) {
      await queue.close();
    }

    await prisma.$disconnect();
    logger.info('Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('Worker is running and waiting for jobs...');
}

startWorker().catch((error) => {
  logger.error('Worker failed to start', {}, error);
  process.exit(1);
});
