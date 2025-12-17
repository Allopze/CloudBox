import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import http from 'http';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error.js';
import { initStorage, getStoragePath } from './lib/storage.js';
import prisma, { updateParentFolderSizes } from './lib/prisma.js';
import { auditContext, suspiciousActivityDetector } from './lib/audit.js';
import { logger } from './lib/logger.js';
import { initSocketIO, getConnectedUserCount } from './lib/socket.js';
import { initTranscodingQueue, getQueueStats, cleanupOldJobs } from './lib/transcodingQueue.js';
import { initDocumentConversionQueue } from './lib/documentConversionQueue.js';
import { initThumbnailQueue, getThumbnailQueueStats } from './lib/thumbnailQueue.js';
import { initCache, getCacheStats } from './lib/cache.js';
import { initSessionStore, getSessionStats } from './lib/sessionStore.js';
import { initBullBoard, closeBullBoard } from './lib/bullBoard.js';
import { authenticate, requireAdmin } from './middleware/auth.js';
import { initRateLimitRedis, getRateLimitStats } from './lib/security.js';

// Routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import fileRoutes from './routes/files.js';
import folderRoutes from './routes/folders.js';
import shareRoutes from './routes/shares.js';
import trashRoutes from './routes/trash.js';
import albumRoutes from './routes/albums.js';
import compressionRoutes from './routes/compression.js';
import activityRoutes from './routes/activity.js';
import adminRoutes from './routes/admin.js';
import documentPreviewRoutes from './routes/documentPreview.js';

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security headers with Helmet
// Production-hardened CSP and security headers
const isProduction = config.nodeEnv === 'production';

// Build CSP directives conditionally
const cspDirectives: Record<string, string[] | null> = {
  defaultSrc: ["'self'"],
  // In production, avoid 'unsafe-inline' - use nonces or hashes instead
  // For now, keeping it for backward compatibility but should be removed
  styleSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
  scriptSrc: ["'self'"],
  imgSrc: ["'self'", "data:", "blob:"],
  connectSrc: ["'self'"],
  fontSrc: ["'self'"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'", "blob:"],
  frameSrc: ["'self'"],
  // Security: Only allow framing from same origin in production
  frameAncestors: isProduction ? ["'self'"] : ["'self'", "http://localhost:*"],
  // Security: Prevent form submissions to external URLs
  formAction: ["'self'"],
};

// Security: Block mixed content in production only
if (isProduction) {
  cspDirectives.upgradeInsecureRequests = [];
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: cspDirectives,
  },
  // Security: Enable HSTS in production (browsers will remember to use HTTPS)
  strictTransportSecurity: isProduction ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  } : false,
  crossOriginEmbedderPolicy: false, // Allow loading media files
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin file access
  // Security: Additional headers
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true, // X-Content-Type-Options: nosniff
  // Note: xssFilter removed - deprecated in Helmet 8, X-XSS-Protection is ignored by modern browsers
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// Compression middleware - compress responses
app.use(compression({
  filter: (req, res) => {
    // Don't compress if client doesn't accept it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Don't compress already compressed files or streams
    const contentType = res.getHeader('Content-Type') as string;
    if (contentType && (
      contentType.includes('image/') ||
      contentType.includes('video/') ||
      contentType.includes('audio/') ||
      contentType.includes('application/zip') ||
      contentType.includes('application/x-7z')
    )) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Balanced compression level
}));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In development, allow any localhost port
    if (config.nodeEnv === 'development' && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }

    // In production, only allow configured frontend URL
    if (origin === config.frontendUrl) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
}));

// Body parsing with size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb', parameterLimit: 10000 }));
app.use(cookieParser());

// Audit context - attach audit helper to all requests
app.use(auditContext);

// Suspicious activity detection
app.use(suspiciousActivityDetector);

// Global rate limiting - more generous
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.originalUrl === '/api/health' || req.path === '/health';
  },
});
app.use('/api/', globalLimiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Security Fix: Rate limiting for password reset and email verification endpoints
const sensitiveAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour per IP
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/forgot-password', sensitiveAuthLimiter);
app.use('/api/auth/reset-password', sensitiveAuthLimiter);
app.use('/api/auth/verify-email', sensitiveAuthLimiter);

// Issue #22: Rate limiting for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window for admin operations (investigate reduced limit for prod)
  message: { error: 'Too many admin requests, please try again later' },
});
app.use('/api/admin', adminLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/files', documentPreviewRoutes); // Document preview routes (before main file routes)
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/trash', trashRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/compression', compressionRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/admin', adminRoutes);

// Public config endpoint for upload limits (no auth required for frontend to fetch)
app.get('/api/config/upload-limits', async (req, res) => {
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['upload_max_file_size', 'upload_chunk_size', 'upload_concurrent_chunks'] },
      },
    });

    const limits: Record<string, string> = {};
    settings.forEach((s: { key: string; value: string }) => {
      limits[s.key.replace('upload_', '')] = s.value;
    });

    const hardMaxChunkSize = config.limits.maxChunkSize;
    const configuredChunkSize = parseInt(limits['chunk_size'] || '', 10);
    const defaultChunkSize = 20 * 1024 * 1024; // 20MB default
    const effectiveChunkSize = Math.min(
      Number.isFinite(configuredChunkSize) && configuredChunkSize > 0 ? configuredChunkSize : defaultChunkSize,
      hardMaxChunkSize
    );

    res.json({
      maxFileSize: limits['max_file_size'] || String(config.storage.maxFileSize),
      chunkSize: String(effectiveChunkSize),
      concurrentChunks: limits['concurrent_chunks'] || '4',
    });
  } catch (error) {
    // Return defaults on error
    res.json({
      maxFileSize: String(config.storage.maxFileSize),
      chunkSize: String(Math.min(20 * 1024 * 1024, config.limits.maxChunkSize)),
      concurrentChunks: '4',
    });
  }
});

// Public health ping (for load balancers - no details exposed)
app.get('/api/health/ping', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Detailed health check endpoint (admin only - exposes infrastructure details)
app.get('/api/health', authenticate, requireAdmin, async (req, res) => {
  const healthChecks: Record<string, { status: 'healthy' | 'unhealthy' | 'degraded' | 'warning'; message?: string;[key: string]: any }> = {};
  let overallHealthy = true;
  const isProduction = config.nodeEnv === 'production';

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    healthChecks.database = { status: 'healthy' };
  } catch (error) {
    healthChecks.database = { status: 'unhealthy', message: 'Database connection failed' };
    overallHealthy = false;
  }


  // Check storage directory
  try {
    const fs = await import('fs/promises');
    const storagePath = getStoragePath('files');
    await fs.access(storagePath);
    healthChecks.storage = { status: 'healthy' };
  } catch (error) {
    healthChecks.storage = { status: 'unhealthy', message: 'Storage directory not accessible' };
    overallHealthy = false;
  }

  // Check SMTP configuration (optional - don't fail if not configured)
  try {
    const smtpSettings = await prisma.settings.findFirst({
      where: { key: 'smtp_host' },
    });
    if (smtpSettings?.value) {
      healthChecks.smtp = { status: 'healthy', message: 'SMTP configured' };
    } else {
      healthChecks.smtp = { status: 'healthy', message: 'SMTP not configured (optional)' };
    }
  } catch (error) {
    healthChecks.smtp = { status: 'healthy', message: 'SMTP check skipped' };
  }

  // Check Redis/transcoding queue
  try {
    const queueStats = await getQueueStats();

    if (queueStats.isRedisAvailable) {
      healthChecks.transcoding = {
        status: 'healthy',
        message: `Redis connected, ${queueStats.active} active jobs`,
        usingRedis: true,
        workerMode: 'dedicated',
      };
    } else if (isProduction) {
      // Production without Redis is unhealthy
      healthChecks.transcoding = {
        status: 'unhealthy',
        message: 'CRITICAL: Redis required for transcoding in production - jobs will be rejected',
        usingRedis: false,
        workerMode: 'disabled',
      };
      overallHealthy = false;
    } else {
      // Development fallback warning
      healthChecks.transcoding = {
        status: 'warning',
        message: 'Fallback mode (dev only) - CPU competes with API. Set up Redis for production.',
        usingRedis: false,
        workerMode: 'inline-fallback',
      };
    }
  } catch (error) {
    healthChecks.transcoding = { status: 'degraded', message: 'Queue check failed' };
  }

  // Check thumbnail queue
  try {
    const thumbnailStats = await getThumbnailQueueStats();

    if (thumbnailStats.usingRedis) {
      healthChecks.thumbnails = {
        status: 'healthy',
        message: `Redis connected, ${thumbnailStats.active} active, ${thumbnailStats.waiting} waiting`,
        usingRedis: true,
        workerMode: 'dedicated',
      };
    } else if (isProduction) {
      // Production without Redis is unhealthy
      healthChecks.thumbnails = {
        status: 'unhealthy',
        message: 'CRITICAL: Redis required for thumbnails in production - jobs will be rejected',
        usingRedis: false,
        workerMode: 'disabled',
      };
      overallHealthy = false;
    } else {
      // Development fallback warning
      healthChecks.thumbnails = {
        status: 'warning',
        message: `Fallback mode (dev only), ${thumbnailStats.active} active - Set up Redis for production.`,
        usingRedis: false,
        workerMode: 'inline-fallback',
      };
    }
  } catch (error) {
    healthChecks.thumbnails = { status: 'degraded', message: 'Thumbnail queue check failed' };
  }

  // Check cache
  try {
    const cacheStats = await getCacheStats();
    healthChecks.cache = {
      status: cacheStats ? 'healthy' : 'degraded',
      message: cacheStats
        ? `Redis connected, ${cacheStats.keys} keys, ${cacheStats.memory} memory`
        : 'Cache disabled - all queries hit database directly',
      usingRedis: !!cacheStats,
    };
  } catch (error) {
    healthChecks.cache = { status: 'degraded', message: 'Cache check failed' };
  }

  // Check session store
  try {
    const sessionStats = await getSessionStats();
    healthChecks.sessions = {
      status: sessionStats ? 'healthy' : 'degraded',
      message: sessionStats
        ? `Redis connected, ${sessionStats.totalSessions} active sessions`
        : 'Session store using database fallback - no instant invalidation',
      usingRedis: !!sessionStats,
    };
  } catch (error) {
    healthChecks.sessions = { status: 'degraded', message: 'Session store check failed' };
  }

  // Check rate limiting
  try {
    const rateLimitStats = getRateLimitStats();
    healthChecks.rateLimiting = {
      status: rateLimitStats.usingRedis ? 'healthy' : 'degraded',
      message: rateLimitStats.usingRedis
        ? 'Redis connected - distributed rate limiting active'
        : `In-memory fallback (single-node only), ${rateLimitStats.inMemoryEntries} tracked users`,
      usingRedis: rateLimitStats.usingRedis,
    };
  } catch (error) {
    healthChecks.rateLimiting = { status: 'degraded', message: 'Rate limiting check failed' };
  }

  // Check WebSocket connections
  try {
    const connectedUsers = getConnectedUserCount();
    healthChecks.websocket = {
      status: 'healthy',
      message: `${connectedUsers} users connected`,
    };
  } catch (error) {
    healthChecks.websocket = { status: 'healthy', message: 'WebSocket check skipped' };
  }

  // Security: Only expose version in development mode
  const response: Record<string, any> = {
    status: overallHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: healthChecks,
  };

  if (config.nodeEnv === 'development') {
    response.version = process.env.npm_package_version || '1.0.0';
  }

  res.status(overallHealthy ? 200 : 503).json(response);
});

// Serve static files from data directory
// Serve static files from data directory - REMOVED FOR SECURITY
// app.use('/data', express.static(path.resolve(config.storage.path)));

// Error handler
app.use(errorHandler);

// Cleanup expired trash items (run every hour)
const cleanupTrash = async () => {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - config.trash.retentionDays);
  const BATCH_SIZE = 100;
  let totalCleaned = 0;

  try {
    const { deleteFile } = await import('./lib/storage.js');

    // Clean up files in batches
    while (true) {
      const expiredFiles = await prisma.file.findMany({
        where: {
          isTrash: true,
          trashedAt: { lt: expiryDate },
        },
        take: BATCH_SIZE,
      });

      if (expiredFiles.length === 0) {
        break;
      }

      for (const file of expiredFiles) {
        await deleteFile(file.path);
        if (file.thumbnailPath) {
          await deleteFile(file.thumbnailPath);
        }

        await prisma.user.update({
          where: { id: file.userId },
          data: { storageUsed: { decrement: Number(file.size) } },
        });

        if (file.folderId) {
          await updateParentFolderSizes(file.folderId, file.size, prisma, 'decrement');
        }
      }

      await prisma.file.deleteMany({
        where: {
          id: { in: expiredFiles.map(f => f.id) },
        },
      });

      totalCleaned += expiredFiles.length;
    }

    // Clean up folders in batches
    while (true) {
      const expiredFolders = await prisma.folder.findMany({
        where: {
          isTrash: true,
          trashedAt: { lt: expiryDate },
        },
        take: BATCH_SIZE,
      });

      if (expiredFolders.length === 0) {
        break;
      }

      await prisma.folder.deleteMany({
        where: {
          id: { in: expiredFolders.map(f => f.id) },
        },
      });
    }

    if (totalCleaned > 0) {
      logger.info('Cleaned up expired trash items', { count: totalCleaned });
    }
  } catch (error) {
    logger.error('Trash cleanup error', {}, error instanceof Error ? error : new Error(String(error)));
  }
};

// Cleanup stale temp storage reservations (run every 6 hours)
// NOTE: tempStorage is used to reserve quota for chunked uploads; never reset it blindly.
const cleanupTempStorage = async () => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const fs = await import('fs/promises');

    // Clean up stale upload sessions (failed/abandoned chunked uploads)
    const staleSessions = await prisma.uploadSession.findMany({
      where: {
        status: { in: ['UPLOADING', 'MERGING'] },
        createdAt: { lt: cutoff },
      },
      select: { id: true, userId: true, totalSize: true },
    });

    for (const session of staleSessions) {
      await prisma.fileChunk.deleteMany({ where: { uploadId: session.id } }).catch(() => { });
      await prisma.uploadSession.delete({ where: { id: session.id } }).catch(() => { });
      await prisma.$executeRaw`
        UPDATE "users"
        SET "tempStorage" = GREATEST("tempStorage" - ${session.totalSize}, 0)
        WHERE "id" = ${session.userId}::uuid
      `;

      // Best-effort filesystem cleanup (if chunks dir still exists)
      await fs.rm(getStoragePath('chunks', session.id), { recursive: true, force: true }).catch(() => { });
    }

    if (staleSessions.length > 0) {
      logger.info('Cleaned up stale upload sessions', { count: staleSessions.length });
    }

    // Keep upload session table small (completed sessions older than 7 days)
    const completedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { count: deletedCompleted } = await prisma.uploadSession.deleteMany({
      where: {
        status: 'COMPLETED',
        createdAt: { lt: completedCutoff },
      },
    });

    if (deletedCompleted > 0) {
      logger.info('Cleaned up completed upload sessions', { count: deletedCompleted });
    }
  } catch (error) {
    logger.error('Temp storage cleanup error', {}, error instanceof Error ? error : new Error(String(error)));
  }
};

// Issue #6: Cleanup expired refresh tokens (run every hour)
const cleanupExpiredTokens = async () => {
  try {
    const { count } = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (count > 0) {
      logger.info('Cleaned up expired refresh tokens', { count });
    }
  } catch (error) {
    logger.error('Refresh token cleanup error', {}, error instanceof Error ? error : new Error(String(error)));
  }
};

// Cleanup orphan chunks (run every hour)
// Note: In multi-instance deployments, use distributed locking (e.g., Redis)
// to prevent concurrent cleanup from multiple instances
const cleanupOrphanChunks = async () => {
  const fs = await import('fs/promises');
  const path = await import('path');

  // Simple file-based lock for single-server or when Redis is not available
  const lockPath = path.join(config.storage.path, '.chunk_cleanup_lock');

  try {
    // Try to acquire lock (create lock file with current timestamp)
    const now = Date.now();
    const lockTimeout = 30 * 60 * 1000; // 30 minutes lock timeout

    try {
      const lockData = await fs.readFile(lockPath, 'utf-8');
      const lockTime = parseInt(lockData, 10);

      // If lock exists and is not stale, skip this run
      if (!isNaN(lockTime) && (now - lockTime) < lockTimeout) {
        logger.debug('Chunk cleanup skipped - another instance is running', { lockAge: now - lockTime });
        return;
      }
    } catch {
      // Lock file doesn't exist, proceed
    }

    // Write our lock
    await fs.writeFile(lockPath, now.toString());

    const chunksDir = path.join(config.storage.path, 'chunks');

    // Check if chunks directory exists
    try {
      await fs.access(chunksDir);
    } catch {
      await fs.unlink(lockPath).catch(() => { });
      return; // Directory doesn't exist, nothing to clean
    }

    const uploadDirs = await fs.readdir(chunksDir);
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedCount = 0;

    for (const uploadId of uploadDirs) {
      const uploadPath = path.join(chunksDir, uploadId);

      try {
        const stats = await fs.stat(uploadPath);

        // If directory is older than 24 hours, remove it
        if (now - stats.mtimeMs > MAX_AGE_MS) {
          await fs.rm(uploadPath, { recursive: true, force: true });

          // Also clean up any orphan fileChunk records
          await prisma.fileChunk.deleteMany({
            where: { uploadId },
          }).catch(() => { });

          // Release any orphaned reservation tied to this uploadId
          const session = await prisma.uploadSession.findUnique({
            where: { id: uploadId },
            select: { userId: true, totalSize: true, status: true },
          }).catch(() => null);

          if (session && session.status !== 'COMPLETED') {
            await prisma.uploadSession.delete({ where: { id: uploadId } }).catch(() => { });
            await prisma.$executeRaw`
              UPDATE "users"
              SET "tempStorage" = GREATEST("tempStorage" - ${session.totalSize}, 0)
              WHERE "id" = ${session.userId}::uuid
            `;
          }

          cleanedCount++;
        }
      } catch (error) {
        // If we can't stat or remove, skip it
        logger.warn('Error cleaning chunk directory', { uploadId }, error instanceof Error ? error : undefined);
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up orphan chunk directories', { count: cleanedCount });
    }

    // Release lock
    await fs.unlink(lockPath).catch(() => { });
  } catch (error) {
    logger.error('Orphan chunk cleanup error', {}, error instanceof Error ? error : new Error(String(error)));
    // Try to release lock on error
    const fs = await import('fs/promises');
    await fs.unlink(lockPath).catch(() => { });
  }
};

// Track cleanup intervals for graceful shutdown
const cleanupIntervals: NodeJS.Timeout[] = [];

// Initialize and start server
const start = async () => {
  try {
    // Initialize storage directories
    await initStorage();

    // Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    // Initialize transcoding queue (Redis-based or fallback)
    await initTranscodingQueue();
    logger.info('Transcoding queue initialized');

    // Initialize thumbnail queue (Redis-based or fallback)
    await initThumbnailQueue();
    logger.info('Thumbnail queue initialized');

    // Initialize document conversion queue (LibreOffice-based)
    await initDocumentConversionQueue();
    logger.info('Document conversion queue initialized');

    // Initialize cache (Redis-based)
    const cacheEnabled = await initCache();
    if (cacheEnabled) {
      logger.info('Cache initialized with Redis');
    }

    // Initialize session store (Redis-based)
    const sessionStoreEnabled = await initSessionStore();
    if (sessionStoreEnabled) {
      logger.info('Session store initialized with Redis');
    }

    // Initialize distributed rate limiting (Redis-based)
    const rateLimitRedisEnabled = await initRateLimitRedis();
    if (rateLimitRedisEnabled) {
      logger.info('Distributed rate limiting initialized with Redis');
    }

    // Initialize Bull Board for queue monitoring (requires Redis)
    const bullBoardAdapter = await initBullBoard();
    if (bullBoardAdapter) {
      // Mount Bull Board at /admin/queues (requires admin auth)
      app.use('/admin/queues', authenticate, requireAdmin, bullBoardAdapter.getRouter());
      logger.info('Bull Board initialized at /admin/queues');
    }

    // Run initial cleanups
    await cleanupTrash();
    await cleanupTempStorage();
    await cleanupOrphanChunks();
    await cleanupExpiredTokens();
    await cleanupOldJobs(7); // Clean transcoding jobs older than 7 days

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.io
    initSocketIO(server);
    logger.info('Socket.io initialized');

    server.listen(config.port, () => {
      logger.info('Server started', { port: config.port, frontendUrl: config.frontendUrl });
    });

    // Schedule cleanup intervals
    cleanupIntervals.push(
      setInterval(() => cleanupTrash().catch(e => logger.error('Scheduled trash cleanup failed', {}, e instanceof Error ? e : new Error(String(e)))), 60 * 60 * 1000),
      setInterval(() => cleanupTempStorage().catch(e => logger.error('Scheduled temp cleanup failed', {}, e instanceof Error ? e : new Error(String(e)))), 6 * 60 * 60 * 1000),
      setInterval(() => cleanupExpiredTokens().catch(e => logger.error('Scheduled token cleanup failed', {}, e instanceof Error ? e : new Error(String(e)))), 60 * 60 * 1000),
      setInterval(() => cleanupOrphanChunks().catch(e => logger.error('Scheduled chunk cleanup failed', {}, e instanceof Error ? e : new Error(String(e)))), 60 * 60 * 1000),
      setInterval(() => cleanupOldJobs(7).catch(e => logger.error('Scheduled transcoding cleanup failed', {}, e instanceof Error ? e : new Error(String(e)))), 24 * 60 * 60 * 1000) // Daily
    );

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      logger.info('Received shutdown signal, starting graceful shutdown...', { signal });

      // Clear all cleanup intervals
      cleanupIntervals.forEach(interval => clearInterval(interval));

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close Bull Board connections
          await closeBullBoard();
          logger.info('Bull Board connections closed');

          // Disconnect from database
          await prisma.$disconnect();
          logger.info('Database disconnected');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', {}, error instanceof Error ? error : new Error(String(error)));
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.warn('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {}, error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
};

start();

export default app;
