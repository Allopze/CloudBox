import { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';

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
  '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
  '.asp', '.aspx', '.cer', '.csr',
  '.jsp', '.jspx',
  '.cgi', '.pl',
  '.htaccess', '.htpasswd',
  '.bat', '.cmd', '.com', '.ps1', '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
  '.msi', '.scr', '.hta', '.cpl', '.reg',
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
 * Rate limit store for per-user limiting
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const userRateLimits = new Map<string, RateLimitEntry>();

/**
 * Check if user has exceeded rate limit
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
 * Middleware for per-user rate limiting
 */
export function userRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.user?.userId;
    
    // Skip if no user (handled by IP-based rate limiter)
    if (!userId) {
      next();
      return;
    }
    
    const result = checkUserRateLimit(userId, maxRequests, windowMs);
    
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

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userRateLimits.entries()) {
    if (entry.resetAt < now) {
      userRateLimits.delete(key);
    }
  }
}, 60000); // Every minute
