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
}

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
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
    path: process.env.STORAGE_PATH || './data',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'),
    defaultQuota: BigInt(process.env.DEFAULT_QUOTA || '5368709120'),
  },
  
  trash: {
    retentionDays: parseInt(process.env.TRASH_RETENTION_DAYS || '30'),
  },
};
