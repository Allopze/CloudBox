import dotenv from 'dotenv';
dotenv.config();

// Validate required secrets in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'default-secret') {
    throw new Error('JWT_SECRET must be set in production');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === 'default-refresh-secret') {
    throw new Error('JWT_REFRESH_SECRET must be set in production');
  }
  // Validate database URL in production
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')) {
    console.warn('WARNING: Using SQLite in production is not recommended. Consider using PostgreSQL.');
  }
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5000',

  // Database configuration
  database: {
    // Pool size (number of connections)
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
    // Connection timeout in seconds
    connectTimeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT || '10'),
    // External pooler (e.g., 'pgbouncer')
    pooler: process.env.DATABASE_POOLER || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Security: Cookie configuration for httpOnly tokens
  cookies: {
    httpOnly: true,
    secure: isProduction, // Only send over HTTPS in production
    sameSite: (isProduction ? 'strict' : 'lax') as 'strict' | 'lax' | 'none',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  },

  // Security: Signed URL configuration
  signedUrls: {
    expiresIn: parseInt(process.env.SIGNED_URL_EXPIRES_IN || '300'), // 5 minutes default
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'CloudBox <noreply@cloudbox.com>',
  },

  storage: {
    path: process.env.STORAGE_PATH || '../data',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'),
    defaultQuota: BigInt(process.env.DEFAULT_QUOTA || '5368709120'),
  },

  trash: {
    retentionDays: parseInt(process.env.TRASH_RETENTION_DAYS || '30'),
  },

  // Compression settings
  compression: {
    // ZIP compression level: 0 (no compression) to 9 (max compression)
    // Level 5 provides good balance between speed and size
    // Higher levels are slower but produce smaller files
    zipLevel: parseInt(process.env.ZIP_COMPRESSION_LEVEL || '5'),
  },

  // Security: Centralized limits for folder depth operations
  limits: {
    maxFolderDepth: parseInt(process.env.MAX_FOLDER_DEPTH || '50'),
    maxBreadcrumbDepth: parseInt(process.env.MAX_BREADCRUMB_DEPTH || '100'),
    maxZipSize: parseInt(process.env.MAX_ZIP_SIZE || String(50 * 1024 * 1024 * 1024)), // 50GB
    maxShareDepthCheck: parseInt(process.env.MAX_SHARE_DEPTH_CHECK || '50'),
    // Upload limits
    maxFilesPerRequest: parseInt(process.env.MAX_FILES_PER_REQUEST || '20'),
    maxFilesFolderUpload: parseInt(process.env.MAX_FILES_FOLDER_UPLOAD || '100'),
    maxTotalChunks: parseInt(process.env.MAX_TOTAL_CHUNKS || '10000'),
    maxChunkSize: parseInt(process.env.MAX_CHUNK_SIZE || String(100 * 1024 * 1024)), // 100MB max chunk size
  },
};
