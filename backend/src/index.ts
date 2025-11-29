import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error.js';
import { initStorage } from './lib/storage.js';
import prisma from './lib/prisma.js';

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

// Middleware
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
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
});
app.use('/api/', limiter);

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

  try {
    const { deleteFile } = await import('./lib/storage.js');

    // Find expired files
    const expiredFiles = await prisma.file.findMany({
      where: {
        isTrash: true,
        trashedAt: { lt: expiryDate },
      },
    });

    // Delete files from storage
    for (const file of expiredFiles) {
      await deleteFile(file.path);
      if (file.thumbnailPath) {
        await deleteFile(file.thumbnailPath);
      }

      // Update user storage
      await prisma.user.update({
        where: { id: file.userId },
        data: { storageUsed: { decrement: Number(file.size) } },
      });
    }

    // Delete from database
    await prisma.file.deleteMany({
      where: {
        isTrash: true,
        trashedAt: { lt: expiryDate },
      },
    });

    // Delete expired folders
    await prisma.folder.deleteMany({
      where: {
        isTrash: true,
        trashedAt: { lt: expiryDate },
      },
    });

    console.log(`Cleaned up ${expiredFiles.length} expired trash items`);
  } catch (error) {
    console.error('Trash cleanup error:', error);
  }
};

// Schedule cleanup
setInterval(cleanupTrash, 60 * 60 * 1000); // Every hour

// Initialize and start server
const start = async () => {
  try {
    // Initialize storage directories
    await initStorage();

    // Test database connection
    await prisma.$connect();
    console.log('Database connected');

    // Run initial cleanup
    await cleanupTrash();

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
