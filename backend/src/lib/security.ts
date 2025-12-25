import { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import logger from './logger.js';

// Redis configuration for distributed rate limiting
const RATE_LIMIT_REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: 'ratelimit:',
};

let rateLimitRedis: RedisType | null = null;
let isRedisAvailable = false;

/**
 * Initialize Redis for distributed rate limiting
 * Called during app startup
 * 
 * SECURITY: In production, Redis is REQUIRED for distributed rate limiting.
 * Without Redis, rate limiting only works per-instance and can be bypassed
 * in multi-instance deployments.
 */
export async function initRateLimitRedis(): Promise<boolean> {
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    // @ts-ignore - ioredis types issue with ESM
    rateLimitRedis = new Redis({
      ...RATE_LIMIT_REDIS_CONFIG,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    await rateLimitRedis!.connect();
    isRedisAvailable = true;
    logger.info('Distributed rate limiting initialized with Redis');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown';

    // SECURITY: In production, Redis is mandatory for proper rate limiting
    if (isProduction) {
      logger.error('CRITICAL: Redis connection failed. Rate limiting requires Redis in production.', {
        error: errorMessage,
        hint: 'Set REDIS_HOST and REDIS_PORT environment variables to a running Redis instance.',
      });
      throw new Error(
        `Redis is required for rate limiting in production. ` +
        `Connection failed: ${errorMessage}. ` +
        `Configure REDIS_HOST and REDIS_PORT or set NODE_ENV=development for in-memory fallback.`
      );
    }

    // Development fallback: allow in-memory rate limiting
    logger.warn('Rate limiting using in-memory fallback (development only - NOT for production)', {
      error: errorMessage,
    });
    rateLimitRedis = null;
    isRedisAvailable = false;
    return false;
  }
}

/**
 * Check if distributed rate limiting is available
 */
export function isDistributedRateLimitAvailable(): boolean {
  return isRedisAvailable && rateLimitRedis !== null;
}

/**
 * Sanitize filename to prevent path traversal attacks
 * Removes any path components and dangerous characters
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'unnamed';

  // Get only the base name (remove any path)
  let sanitized = path.basename(filename);

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove or replace dangerous characters
  sanitized = sanitized
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[<>:"|?*]/g, '') // Remove Windows invalid chars
    .replace(/[\x00-\x1f\x80-\x9f]/g, '') // Remove control characters
    .trim();

  // Limit length
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.substring(0, 255 - ext.length) + ext;
  }

  // If filename is empty or just dots, generate a safe name
  if (!sanitized || /^\.+$/.test(sanitized)) {
    sanitized = `file_${Date.now()}`;
  }

  return sanitized;
}

/**
 * Validate MIME type matches file extension
 */
export function validateMimeType(mimeType: string, filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();

  const mimeMap: Record<string, string[]> = {
    // Images
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.gif': ['image/gif'],
    '.webp': ['image/webp'],
    '.svg': ['image/svg+xml'],
    '.ico': ['image/x-icon', 'image/vnd.microsoft.icon'],
    '.bmp': ['image/bmp'],
    '.tiff': ['image/tiff'],
    '.tif': ['image/tiff'],

    // Videos
    '.mp4': ['video/mp4'],
    '.webm': ['video/webm'],
    '.mov': ['video/quicktime'],
    '.avi': ['video/x-msvideo'],
    '.mkv': ['video/x-matroska'],
    '.wmv': ['video/x-ms-wmv'],
    '.flv': ['video/x-flv'],

    // Audio
    '.mp3': ['audio/mpeg', 'audio/mp3'],
    '.wav': ['audio/wav', 'audio/x-wav'],
    '.ogg': ['audio/ogg'],
    '.flac': ['audio/flac'],
    '.aac': ['audio/aac'],
    '.m4a': ['audio/mp4', 'audio/x-m4a'],
    '.wma': ['audio/x-ms-wma'],

    // Documents
    '.pdf': ['application/pdf'],
    '.doc': ['application/msword'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.xls': ['application/vnd.ms-excel'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.ppt': ['application/vnd.ms-powerpoint'],
    '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    '.txt': ['text/plain'],
    '.rtf': ['application/rtf', 'text/rtf'],
    '.csv': ['text/csv'],
    '.json': ['application/json'],
    '.xml': ['application/xml', 'text/xml'],
    '.html': ['text/html'],
    '.css': ['text/css'],
    '.js': ['application/javascript', 'text/javascript'],
    '.ts': ['application/typescript', 'text/typescript'],
    '.py': ['text/x-python', 'application/x-python', 'text/plain'],
    '.sh': ['text/x-sh', 'application/x-sh', 'text/plain'],
    '.php': ['application/x-httpd-php', 'text/php', 'text/plain'],
    '.md': ['text/markdown', 'text/plain'],

    // Archives
    '.zip': ['application/zip', 'application/x-zip-compressed'],
    '.rar': ['application/vnd.rar', 'application/x-rar-compressed'],
    '.7z': ['application/x-7z-compressed'],
    '.tar': ['application/x-tar'],
    '.gz': ['application/gzip'],

    // Other
    '.exe': ['application/x-msdownload', 'application/octet-stream'],
    '.dmg': ['application/x-apple-diskimage'],
    '.iso': ['application/x-iso9660-image'],
  };

  const allowedMimes = mimeMap[ext];

  // If extension is not in our map, allow it (but log for review)
  if (!allowedMimes) {
    return true;
  }

  // Check if MIME type matches expected for this extension
  return allowedMimes.includes(mimeType) || mimeType === 'application/octet-stream';
}

/**
 * List of dangerous file extensions that should be blocked
 */
const DANGEROUS_EXTENSIONS = [
  // Windows executables / shortcuts
  '.dll', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.scf', '.lnk', '.inf', '.reg', '.hta', '.cpl', '.msc',

  // Script/automation
  '.vbs', '.vbe', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
  '.ps1', '.psm1', '.psd1', '.ps1xml', '.pssc', '.psrc',
  '.msh', '.msh1', '.msh2', '.mshxml', '.msh1xml', '.msh2xml',
  '.bash', '.zsh', '.csh', '.ksh',
  '.pyc', '.pyo', '.pyw', '.pyz', '.pyzw',
  '.pl', '.pm', '.pod', '.t', '.rb', '.rbw', '.cgi',

  // Server-side / web
  '.phtml', '.php3', '.php4', '.php5', '.phps',
  '.asp', '.aspx', '.jsp', '.jspx',
  '.htaccess', '.htpasswd',

  // Other
  '.jar',
];

/**
 * Check if file extension is potentially dangerous
 */
export function isDangerousExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return DANGEROUS_EXTENSIONS.includes(ext);
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash sensitive data for logging (e.g., partial email)
 */
export function maskSensitiveData(data: string, visibleChars: number = 3): string {
  if (!data || data.length <= visibleChars * 2) {
    return '***';
  }
  return data.substring(0, visibleChars) + '***' + data.substring(data.length - visibleChars);
}

/**
 * Validate and sanitize search query
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query) return '';

  return query
    .replace(/[<>'"`;]/g, '') // Remove potential XSS/SQL chars
    .trim()
    .substring(0, 200); // Limit length
}

/**
 * Rate limit store for per-user limiting (in-memory fallback)
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const userRateLimits = new Map<string, RateLimitEntry>();

/**
 * Check if user has exceeded rate limit using Redis (distributed)
 * Falls back to in-memory if Redis is unavailable
 */
export async function checkUserRateLimitDistributed(
  userId: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowSeconds = Math.ceil(windowMs / 1000);

  // Try Redis first for distributed rate limiting
  if (isDistributedRateLimitAvailable() && rateLimitRedis) {
    try {
      const key = `user:${userId}`;
      const multi = rateLimitRedis.multi();

      // Increment the counter
      multi.incr(key);
      // Get current count
      multi.get(key);
      // Get TTL
      multi.ttl(key);

      const results = await multi.exec();

      if (!results) {
        throw new Error('Redis multi exec failed');
      }

      const currentCount = parseInt(results[1]?.[1] as string || '1');
      const ttl = parseInt(results[2]?.[1] as string || '-1');

      // If key is new (no TTL), set expiration
      if (ttl === -1) {
        await rateLimitRedis.expire(key, windowSeconds);
      }

      const resetAt = ttl > 0 ? now + (ttl * 1000) : now + windowMs;
      const remaining = Math.max(0, maxRequests - currentCount);

      return {
        allowed: currentCount <= maxRequests,
        remaining,
        resetAt,
      };
    } catch (error) {
      logger.debug('Redis rate limit check failed, using fallback', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // Fall through to in-memory fallback
    }
  }

  // In-memory fallback (single-node only)
  return checkUserRateLimit(userId, maxRequests, windowMs);
}

/**
 * Check if user has exceeded rate limit (in-memory, single-node)
 */
export function checkUserRateLimit(
  userId: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = userId;
  const entry = userRateLimits.get(key);

  if (!entry || entry.resetAt < now) {
    // Create new entry
    userRateLimits.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Middleware for per-user rate limiting (with Redis support for multi-node)
 */
export function userRateLimiter(maxRequests: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;

    // Skip if no user (handled by IP-based rate limiter)
    if (!userId) {
      next();
      return;
    }

    // Use distributed rate limiting when Redis is available
    const result = await checkUserRateLimitDistributed(userId, maxRequests, windowMs);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      });
      return;
    }

    next();
  };
}

/**
 * Get rate limit statistics for health checks
 */
export function getRateLimitStats(): { usingRedis: boolean; inMemoryEntries: number } {
  return {
    usingRedis: isDistributedRateLimitAvailable(),
    inMemoryEntries: userRateLimits.size,
  };
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userRateLimits.entries()) {
    if (entry.resetAt < now) {
      userRateLimits.delete(key);
    }
  }
}, 60000); // Every minute
