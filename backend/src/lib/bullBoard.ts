/**
 * Bull Board - Queue Monitoring Dashboard
 * 
 * Provides a web UI for monitoring and managing Bull queues:
 * - Transcoding queue
 * - Thumbnail queue
 * 
 * Access at /admin/queues (requires admin authentication)
 */

import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import logger from './logger.js';

// Queue configuration (same as in queue files)
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

let serverAdapter: ExpressAdapter | null = null;
let transcodingQueue: Bull.Queue | null = null;
let thumbnailQueue: Bull.Queue | null = null;

/**
 * Initialize Bull Board with queue adapters
 * Only creates the board if Redis is available
 */
export async function initBullBoard(): Promise<ExpressAdapter | null> {
  try {
    // Create queue instances for monitoring (read-only mode)
    transcodingQueue = new Bull('transcoding', { redis: REDIS_CONFIG });
    thumbnailQueue = new Bull('thumbnails', { redis: REDIS_CONFIG });

    // Test Redis connection
    await transcodingQueue.isReady();

    // Create Express adapter for routing
    serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    // Create Bull Board with queue adapters
    createBullBoard({
      queues: [
        new BullAdapter(transcodingQueue, { readOnlyMode: false }),
        new BullAdapter(thumbnailQueue, { readOnlyMode: false }),
      ],
      serverAdapter,
    });

    logger.info('Bull Board initialized successfully');
    return serverAdapter;
  } catch (error) {
    logger.warn('Bull Board initialization failed (Redis not available)', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return null;
  }
}

/**
 * Get the Express adapter for routing
 */
export function getBullBoardAdapter(): ExpressAdapter | null {
  return serverAdapter;
}

/**
 * Close Bull Board connections
 */
export async function closeBullBoard(): Promise<void> {
  if (transcodingQueue) {
    await transcodingQueue.close();
    transcodingQueue = null;
  }
  if (thumbnailQueue) {
    await thumbnailQueue.close();
    thumbnailQueue = null;
  }
  serverAdapter = null;
}
