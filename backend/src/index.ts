import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error.js';
import { initStorage, getStoragePath } from './lib/storage.js';
import prisma, { updateParentFolderSizes } from './lib/prisma.js';
import { auditContext, suspiciousActivityDetector } from './lib/audit.js';
import logger from './lib/logger.js';

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

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'self'"],
      frameAncestors: ["'self'", "http://localhost:*"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow loading media files
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin file access
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Audit context - attach audit helper to all requests
app.use(auditContext);

// Suspicious activity detection
app.use(suspiciousActivityDetector);

// Global rate limiting - more generous
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
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
  max: 100, // 100 requests per window for admin operations
  message: { error: 'Too many admin requests, please try again later' },
});
app.use('/api/admin', adminLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/trash', trashRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/compression', compressionRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const healthChecks: Record<string, { status: 'healthy' | 'unhealthy'; message?: string }> = {};
  let overallHealthy = true;

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

// Cleanup stale temp storage (run every 6 hours)
const cleanupTempStorage = async () => {
  try {
    const { count } = await prisma.user.updateMany({
      where: {
        tempStorage: {
          gt: 0,
        },
      },
      data: {
        tempStorage: 0,
      },
    });

    if (count > 0) {
      logger.info('Cleaned up temp storage', { usersAffected: count });
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
const cleanupOrphanChunks = async () => {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  try {
    const chunksDir = path.join(config.storage.path, 'chunks');
    
    // Check if chunks directory exists
    try {
      await fs.access(chunksDir);
    } catch {
      return; // Directory doesn't exist, nothing to clean
    }
    
    const uploadDirs = await fs.readdir(chunksDir);
    const now = Date.now();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedCount = 0;
    
    for (const uploadId of uploadDirs) {
      const uploadPath = path.join(chunksDir, uploadId);
      
      try {
        const stats = await fs.stat(uploadPath);
        
        // If directory is older than 24 hours, remove it
        if (now - stats.mtimeMs > MAX_AGE_MS) {
          await fs.rm(uploadPath, { recursive: true, force: true });
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
  } catch (error) {
    logger.error('Orphan chunk cleanup error', {}, error instanceof Error ? error : new Error(String(error)));
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

    // Run initial cleanups
    await cleanupTrash();
    await cleanupTempStorage();
    await cleanupOrphanChunks();
    await cleanupExpiredTokens();

    const server = app.listen(config.port, () => {
      logger.info('Server started', { port: config.port, frontendUrl: config.frontendUrl });
    });

    // Schedule cleanup intervals
    cleanupIntervals.push(
      setInterval(() => cleanupTrash().catch(e => logger.error('Scheduled trash cleanup failed', {}, e instanceof Error ? e : new Error(String(e)))), 60 * 60 * 1000),
      setInterval(() => cleanupTempStorage().catch(e => logger.error('Scheduled temp cleanup failed', {}, e instanceof Error ? e : new Error(String(e)))), 6 * 60 * 60 * 1000),
      setInterval(() => cleanupExpiredTokens().catch(e => logger.error('Scheduled token cleanup failed', {}, e instanceof Error ? e : new Error(String(e)))), 60 * 60 * 1000),
      setInterval(() => cleanupOrphanChunks().catch(e => logger.error('Scheduled chunk cleanup failed', {}, e instanceof Error ? e : new Error(String(e)))), 60 * 60 * 1000)
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
