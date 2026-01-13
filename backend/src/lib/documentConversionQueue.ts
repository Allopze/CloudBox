/**
 * Document Conversion Queue using Bull (Redis-based job queue)
 * 
 * Converts Office documents (Word, Excel, PowerPoint) to PDF using LibreOffice.
 * Features:
 * - Background processing with Bull queue
 * - PDF caching to avoid re-conversion
 * - Fallback mode for development without Redis
 */

import Bull, { Job, Queue } from 'bull';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import pLimit from 'p-limit';
import { config } from '../config/index.js';
import logger from './logger.js';
import { getStoragePath, fileExists as checkFileExists } from './storage.js';

// Job data interface
interface ConversionJobData {
    fileId: string;
    inputPath: string;
    outputPath: string;
    userId: string;
}

// Job result interface
interface ConversionJobResult {
    success: boolean;
    outputPath?: string;
    error?: string;
    duration?: number;
}

// In-memory job tracking (for when Redis is not available)
const conversionJobs = new Map<string, {
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    error?: string;
    outputPath?: string;
}>();

// Queue configuration
const QUEUE_CONFIG = {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 3,
    },
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'exponential' as const,
            delay: 3000,
        },
        removeOnComplete: 50,
        removeOnFail: 20,
    },
    limiter: {
        max: 2, // Max 2 concurrent conversion jobs
        duration: 1000,
    },
};

// LibreOffice executable path
const SOFFICE_PATH = process.platform === 'win32'
    ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
    : 'soffice';

// Fallback concurrency limiter
const FALLBACK_CONCURRENCY = parseInt(process.env.CONVERSION_FALLBACK_CONCURRENCY || '2');
const fallbackLimiter = pLimit(FALLBACK_CONCURRENCY);

let conversionQueue: Queue<ConversionJobData> | null = null;
let isRedisAvailable = false;
let conversionEnabled = false;
const requireRedis = process.env.REQUIRE_REDIS_CONVERSION === 'true' || config.nodeEnv === 'production';

/**
 * Check if Redis is available
 */
async function checkRedisConnection(): Promise<boolean> {
    try {
        const { default: Redis } = await import('ioredis');
        const redis = new (Redis as any)({
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
    } catch {
        return false;
    }
}

/**
 * Check if LibreOffice is available
 */
async function checkLibreOffice(): Promise<boolean> {
    // On Windows, check if the file exists directly
    if (process.platform === 'win32') {
        try {
            await fs.access(SOFFICE_PATH);
            return true;
        } catch {
            return false;
        }
    }

    // On Unix, check via which command
    return new Promise((resolve) => {
        const proc = spawn('which', ['soffice'], { shell: true });

        proc.on('close', (code) => {
            resolve(code === 0);
        });

        proc.on('error', () => {
            resolve(false);
        });

        setTimeout(() => {
            proc.kill();
            resolve(false);
        }, 5000);
    });
}

/**
 * Initialize the document conversion queue
 */
export async function initDocumentConversionQueue(): Promise<void> {
    // Check LibreOffice availability
    const libreOfficeAvailable = await checkLibreOffice();
    if (!libreOfficeAvailable) {
        logger.warn('LibreOffice not found, document conversion will be disabled', {
            expectedPath: SOFFICE_PATH,
        });
        conversionEnabled = false;
        return;
    }

    logger.info('LibreOffice detected for document conversion');
    conversionEnabled = true;

    isRedisAvailable = await checkRedisConnection();

    if (!isRedisAvailable) {
        if (requireRedis) {
            logger.error('Document conversion disabled: Redis required in production', {
                hint: 'Set REDIS_HOST and REDIS_PORT or disable conversion endpoints.',
            });
            conversionEnabled = false;
            return;
        }
        logger.info('Document conversion queue running in fallback mode (no Redis)', {
            concurrencyLimit: FALLBACK_CONCURRENCY,
        });
        return;
    }

    conversionQueue = new Bull<ConversionJobData>('document-conversion', {
        redis: QUEUE_CONFIG.redis,
        defaultJobOptions: QUEUE_CONFIG.defaultJobOptions,
        limiter: QUEUE_CONFIG.limiter,
    });

    // Process jobs
    conversionQueue.process(2, async (job: Job<ConversionJobData>) => {
        return processConversionJob(job);
    });

    // Event handlers
    conversionQueue.on('completed', (job: Job<ConversionJobData>, result: ConversionJobResult) => {
        logger.info('Document conversion completed', {
            jobId: job.id,
            fileId: job.data.fileId,
            duration: result.duration,
        });
    });

    conversionQueue.on('failed', (job: Job<ConversionJobData>, error: Error) => {
        logger.error('Document conversion failed', {
            jobId: job.id,
            fileId: job.data.fileId,
            error: error.message,
        });
    });

    logger.info('Document conversion queue initialized with Redis');
}

/**
 * Process a conversion job using LibreOffice
 */
async function processConversionJob(job: Job<ConversionJobData>): Promise<ConversionJobResult> {
    const { fileId, inputPath, outputPath } = job.data;
    const startTime = Date.now();

    // Update in-memory status
    conversionJobs.set(fileId, { status: 'processing', progress: 50 });

    try {
        // Check if input file exists
        await fs.access(inputPath);

        // Get the output directory
        const outputDir = path.dirname(outputPath);
        await fs.mkdir(outputDir, { recursive: true });

        // Convert using LibreOffice
        await convertWithLibreOffice(inputPath, outputDir);

        // LibreOffice outputs with same name but .pdf extension
        const inputBasename = path.basename(inputPath, path.extname(inputPath));
        const libreOfficePdfPath = path.join(outputDir, `${inputBasename}.pdf`);

        // Rename to our expected output path if different
        if (libreOfficePdfPath !== outputPath) {
            await fs.rename(libreOfficePdfPath, outputPath);
        }

        // Verify output exists
        await fs.access(outputPath);

        // Update status
        conversionJobs.set(fileId, {
            status: 'completed',
            progress: 100,
            outputPath
        });

        const duration = Date.now() - startTime;
        return {
            success: true,
            outputPath,
            duration,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        conversionJobs.set(fileId, {
            status: 'failed',
            progress: 0,
            error: errorMessage
        });

        throw error;
    }
}

/**
 * Convert document using LibreOffice headless mode
 */
async function convertWithLibreOffice(inputPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const args = [
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', outputDir,
            inputPath,
        ];

        logger.debug('Running LibreOffice conversion', { args });

        const proc = spawn(SOFFICE_PATH, args);

        let stderr = '';
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`LibreOffice exited with code ${code}: ${stderr}`));
            }
        });

        proc.on('error', (error) => {
            reject(new Error(`LibreOffice error: ${error.message}`));
        });

        // Timeout after 60 seconds
        setTimeout(() => {
            proc.kill();
            reject(new Error('LibreOffice conversion timeout (60s)'));
        }, 60000);
    });
}

/**
 * Add a document conversion job
 */
export async function addConversionJob(
    fileId: string,
    inputPath: string,
    userId: string
): Promise<string | null> {
    if (!conversionEnabled) {
        logger.warn('Document conversion unavailable', { fileId, reason: 'disabled' });
        return null;
    }
    // Generate output path
    const outputPath = getStoragePath('files', userId, `${fileId}_preview.pdf`);

    // Check if already converted
    if (await checkFileExists(outputPath)) {
        conversionJobs.set(fileId, {
            status: 'completed',
            progress: 100,
            outputPath
        });
        return fileId;
    }

    const jobData: ConversionJobData = {
        fileId,
        inputPath,
        outputPath,
        userId,
    };

    // If Redis is available, use Bull queue
    if (conversionQueue && isRedisAvailable) {
        const job = await conversionQueue.add(jobData, {
            jobId: fileId,
        });
        conversionJobs.set(fileId, { status: 'queued', progress: 0 });
        return job.id?.toString() || null;
    }

    // Fallback: Process with concurrency limit
    logger.info('Processing document conversion in fallback mode', { fileId });

    conversionJobs.set(fileId, { status: 'queued', progress: 0 });

    const fakeJob = {
        id: fileId,
        data: jobData,
        progress: () => { },
    } as unknown as Job<ConversionJobData>;

    fallbackLimiter(() => processConversionJob(fakeJob)).catch((error) => {
        logger.error('Fallback document conversion failed', { fileId, error: error.message });
    });

    return fileId;
}

/**
 * Get conversion job status
 */
export async function getConversionJobStatus(fileId: string): Promise<{
    status: string;
    progress: number;
    error?: string;
    outputPath?: string;
} | null> {
    const job = conversionJobs.get(fileId);
    if (!job) return null;

    return {
        status: job.status,
        progress: job.progress,
        error: job.error,
        outputPath: job.outputPath,
    };
}

/**
 * Get the PDF preview path for a file
 */
export function getPreviewPdfPath(fileId: string, userId: string): string {
    return getStoragePath('files', userId, `${fileId}_preview.pdf`);
}

/**
 * Check if a PDF preview already exists
 */
export async function hasPreviewPdf(fileId: string, userId: string): Promise<boolean> {
    const previewPath = getPreviewPdfPath(fileId, userId);
    return checkFileExists(previewPath);
}
