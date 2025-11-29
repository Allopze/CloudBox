import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error.js';
import { initStorage, updateParentFolderSizes } from './lib/storage.js';
import prisma from './lib/prisma.js';
import { auditContext, suspiciousActivityDetector } from './lib/audit.js';

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
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      version: process.env.npm_package_version || '1.0.0',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: 'Database connection failed',
    });
  }
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
      console.log(`Cleaned up ${totalCleaned} expired trash items`);
    }
  } catch (error) {
    console.error('Trash cleanup error:', error);
  }
};

// Schedule cleanup
setInterval(cleanupTrash, 60 * 60 * 1000); // Every hour

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
      console.log(`Cleaned up temp storage for ${count} users`);
    }
  } catch (error) {
    console.error('Temp storage cleanup error:', error);
  }
};

setInterval(cleanupTempStorage, 6 * 60 * 60 * 1000); // Every 6 hours

// Initialize and start server
const start = async () => {
  try {
    // Initialize storage directories
    await initStorage();

    // Test database connection
    await prisma.$connect();
    console.log('Database connected');

    // Run initial cleanups
    await cleanupTrash();
    await cleanupTempStorage();

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Frontend URL: ${config.frontendUrl}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();

export default app;
