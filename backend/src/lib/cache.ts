/**
 * Redis Cache Module for CloudBox
 * 
 * Provides caching for frequently accessed data:
 * - User files list
 * - User info and quota
 * - Folder structure
 * - File metadata
 */

import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import logger from './logger.js';

// Cache configuration
const CACHE_CONFIG = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: 'cache:',
  },
  ttl: {
    files: 30,          // 30 seconds - changes frequently
    user: 300,          // 5 minutes - changes rarely
    folders: 60,        // 1 minute - moderate changes
    fileMetadata: 300,  // 5 minutes - rarely changes
    quota: 60,          // 1 minute - changes with uploads
    albums: 120,        // 2 minutes - moderate changes
    shares: 180,        // 3 minutes - less frequent changes
    dashboard: 60,      // 1 minute - aggregate stats
    recent: 30,         // 30 seconds - changes with activity
    adminStats: 300,    // 5 minutes - system-wide stats
  },
  enabled: process.env.CACHE_ENABLED !== 'false',
};

let redis: RedisType | null = null;
let isConnected = false;

/**
 * Initialize Redis connection for caching
 * 
 * SECURITY: In production, Redis is strongly recommended for caching.
 * Without Redis, all queries hit the database directly, impacting performance.
 */
export async function initCache(): Promise<boolean> {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!CACHE_CONFIG.enabled) {
    if (isProduction) {
      logger.warn('Cache is disabled by configuration in production - this may impact performance');
    } else {
      logger.info('Cache is disabled by configuration');
    }
    return false;
  }

  try {
    // @ts-ignore - ioredis types issue with ESM
    redis = new Redis({
      host: CACHE_CONFIG.redis.host,
      port: CACHE_CONFIG.redis.port,
      password: CACHE_CONFIG.redis.password,
      db: CACHE_CONFIG.redis.db,
      keyPrefix: CACHE_CONFIG.redis.keyPrefix,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    });

    await redis!.connect();
    isConnected = true;
    logger.info('Cache initialized with Redis');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown';

    // In production, warn loudly but don't crash (cache is optional, rate limiting is not)
    if (isProduction) {
      logger.error('Cache initialization failed in production - database queries will not be cached', {
        error: errorMessage,
        hint: 'Set REDIS_HOST and REDIS_PORT environment variables for optimal performance.',
      });
    } else {
      logger.warn('Cache initialization failed, running without cache (development mode)', {
        error: errorMessage,
      });
    }

    redis = null;
    isConnected = false;
    return false;
  }
}

/**
 * Check if cache is available
 */
export function isCacheAvailable(): boolean {
  return isConnected && redis !== null;
}

/**
 * Get a value from cache
 */
export async function get<T>(key: string): Promise<T | null> {
  if (!isCacheAvailable()) return null;

  try {
    const data = await redis!.get(key);
    if (data) {
      return JSON.parse(data) as T;
    }
    return null;
  } catch (error) {
    logger.debug('Cache get error', { key, error: error instanceof Error ? error.message : 'Unknown' });
    return null;
  }
}

/**
 * Set a value in cache with TTL
 */
export async function set(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  if (!isCacheAvailable()) return false;

  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis!.setex(key, ttlSeconds, serialized);
    } else {
      await redis!.set(key, serialized);
    }
    return true;
  } catch (error) {
    logger.debug('Cache set error', { key, error: error instanceof Error ? error.message : 'Unknown' });
    return false;
  }
}

/**
 * Delete a key from cache
 */
export async function del(key: string): Promise<boolean> {
  if (!isCacheAvailable()) return false;

  try {
    await redis!.del(key);
    return true;
  } catch (error) {
    logger.debug('Cache del error', { key, error: error instanceof Error ? error.message : 'Unknown' });
    return false;
  }
}

/**
 * Delete multiple keys by pattern using SCAN (safer than KEYS for production)
 * SCAN is O(1) per iteration vs KEYS which is O(N) and can block Redis
 */
export async function delPattern(pattern: string): Promise<number> {
  if (!isCacheAvailable()) return 0;

  try {
    let deletedCount = 0;
    let cursor = '0';
    const fullPattern = `${CACHE_CONFIG.redis.keyPrefix}${pattern}`;

    // Use SCAN to iterate through keys without blocking Redis
    do {
      // SCAN returns [cursor, keys] - scan with COUNT hint for batch size
      const [nextCursor, keys] = await redis!.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        // Remove the prefix for deletion (ioredis adds it back)
        const keysWithoutPrefix = keys.map((k: string) => k.replace(CACHE_CONFIG.redis.keyPrefix, ''));
        // Use UNLINK for async deletion (non-blocking) instead of DEL
        await redis!.unlink(...keysWithoutPrefix);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    return deletedCount;
  } catch (error) {
    logger.debug('Cache delPattern error', { pattern, error: error instanceof Error ? error.message : 'Unknown' });
    return 0;
  }
}

// ==================== User Files Cache ====================

/**
 * Get cached files list for a user
 */
export async function getFiles(
  userId: string,
  folderId: string | null,
  page: number = 1,
  category?: string,
  sortBy?: string,
  sortOrder?: string
): Promise<any[] | null> {
  const key = `files:${userId}:${folderId || 'root'}:${page}:${category || 'all'}:${sortBy || 'createdAt'}:${sortOrder || 'desc'}`;
  return get<any[]>(key);
}

/**
 * Cache files list for a user
 */
export async function setFiles(
  userId: string,
  folderId: string | null,
  page: number,
  category: string | undefined,
  files: any[],
  sortBy?: string,
  sortOrder?: string
): Promise<boolean> {
  const key = `files:${userId}:${folderId || 'root'}:${page}:${category || 'all'}:${sortBy || 'createdAt'}:${sortOrder || 'desc'}`;
  return set(key, files, CACHE_CONFIG.ttl.files);
}

/**
 * Invalidate all files cache for a user
 */
export async function invalidateUserFiles(userId: string): Promise<void> {
  await delPattern(`files:${userId}:*`);
}

// ==================== Favorites Cache ====================

/**
 * Get cached favorites list for a user (Performance: dedicated cache for favorites page)
 */
export async function getFavorites(
  userId: string,
  page: number = 1,
  sortBy?: string,
  sortOrder?: string
): Promise<any | null> {
  const key = `favorites:${userId}:${page}:${sortBy || 'createdAt'}:${sortOrder || 'desc'}`;
  return get<any>(key);
}

/**
 * Cache favorites list for a user
 */
export async function setFavorites(
  userId: string,
  page: number,
  data: any,
  sortBy?: string,
  sortOrder?: string
): Promise<boolean> {
  const key = `favorites:${userId}:${page}:${sortBy || 'createdAt'}:${sortOrder || 'desc'}`;
  return set(key, data, CACHE_CONFIG.ttl.files);
}

/**
 * Invalidate favorites cache for a user
 */
export async function invalidateFavorites(userId: string): Promise<void> {
  await delPattern(`favorites:${userId}:*`);
}

// ==================== User Info Cache ====================

/**
 * Get cached user info
 */
export async function getUser(userId: string): Promise<any | null> {
  const key = `user:${userId}`;
  return get<any>(key);
}

/**
 * Cache user info
 */
export async function setUser(userId: string, user: any): Promise<boolean> {
  const key = `user:${userId}`;
  // Don't cache sensitive data
  const safeUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    storageUsed: user.storageUsed,
    storageQuota: user.storageQuota,
    maxFileSize: user.maxFileSize,
    role: user.role,
    emailVerified: user.emailVerified,
  };
  return set(key, safeUser, CACHE_CONFIG.ttl.user);
}

/**
 * Invalidate user cache
 */
export async function invalidateUser(userId: string): Promise<void> {
  await del(`user:${userId}`);
}

// ==================== Quota Cache ====================

/**
 * Get cached user quota
 */
export async function getQuota(userId: string): Promise<{ used: number; total: number; max: number } | null> {
  const key = `quota:${userId}`;
  return get(key);
}

/**
 * Cache user quota
 */
export async function setQuota(
  userId: string,
  quota: { used: number; total: number; max: number }
): Promise<boolean> {
  const key = `quota:${userId}`;
  return set(key, quota, CACHE_CONFIG.ttl.quota);
}

/**
 * Invalidate quota cache
 */
export async function invalidateQuota(userId: string): Promise<void> {
  await del(`quota:${userId}`);
}

// ==================== Folders Cache ====================

/**
 * Get cached folder structure
 */
export async function getFolders(userId: string): Promise<any[] | null> {
  const key = `folders:${userId}`;
  return get<any[]>(key);
}

/**
 * Cache folder structure
 */
export async function setFolders(userId: string, folders: any[]): Promise<boolean> {
  const key = `folders:${userId}`;
  return set(key, folders, CACHE_CONFIG.ttl.folders);
}

/**
 * Invalidate folders cache
 */
export async function invalidateFolders(userId: string): Promise<void> {
  await del(`folders:${userId}`);
}

// ==================== File Metadata Cache ====================

/**
 * Get cached file metadata
 */
export async function getFileMetadata(fileId: string): Promise<any | null> {
  const key = `file:${fileId}`;
  return get<any>(key);
}

/**
 * Cache file metadata
 */
export async function setFileMetadata(fileId: string, metadata: any): Promise<boolean> {
  const key = `file:${fileId}`;
  return set(key, metadata, CACHE_CONFIG.ttl.fileMetadata);
}

/**
 * Invalidate file metadata cache
 */
export async function invalidateFileMetadata(fileId: string): Promise<void> {
  await del(`file:${fileId}`);
}

// ==================== Albums Cache ====================

/**
 * Get cached albums list for a user
 */
export async function getAlbums(userId: string, page: number = 1): Promise<any[] | null> {
  const key = `albums:${userId}:${page}`;
  return get<any[]>(key);
}

/**
 * Cache albums list for a user
 */
export async function setAlbums(userId: string, page: number, albums: any[]): Promise<boolean> {
  const key = `albums:${userId}:${page}`;
  return set(key, albums, CACHE_CONFIG.ttl.albums);
}

/**
 * Get cached single album
 */
export async function getAlbum(albumId: string): Promise<any | null> {
  const key = `album:${albumId}`;
  return get<any>(key);
}

/**
 * Cache single album
 */
export async function setAlbum(albumId: string, album: any): Promise<boolean> {
  const key = `album:${albumId}`;
  return set(key, album, CACHE_CONFIG.ttl.albums);
}

/**
 * Invalidate albums cache for a user
 */
export async function invalidateAlbums(userId: string): Promise<void> {
  await delPattern(`albums:${userId}:*`);
}

/**
 * Invalidate single album cache
 */
export async function invalidateAlbum(albumId: string): Promise<void> {
  await del(`album:${albumId}`);
}

// ==================== Shares Cache ====================

/**
 * Get cached shares list for a user
 */
export async function getShares(userId: string, page: number = 1): Promise<any[] | null> {
  const key = `shares:${userId}:${page}`;
  return get<any[]>(key);
}

/**
 * Cache shares list for a user
 */
export async function setShares(userId: string, page: number, shares: any[]): Promise<boolean> {
  const key = `shares:${userId}:${page}`;
  return set(key, shares, CACHE_CONFIG.ttl.shares);
}

/**
 * Get cached public share by token
 */
export async function getPublicShare(shareToken: string): Promise<any | null> {
  const key = `share:public:${shareToken}`;
  return get<any>(key);
}

/**
 * Cache public share by token
 */
export async function setPublicShare(shareToken: string, share: any): Promise<boolean> {
  const key = `share:public:${shareToken}`;
  return set(key, share, CACHE_CONFIG.ttl.shares);
}

/**
 * Invalidate shares cache for a user
 */
export async function invalidateShares(userId: string): Promise<void> {
  await delPattern(`shares:${userId}:*`);
}

/**
 * Invalidate public share cache
 */
export async function invalidatePublicShare(shareToken: string): Promise<void> {
  await del(`share:public:${shareToken}`);
}

// ==================== Dashboard/Stats Cache ====================

/**
 * Get cached dashboard stats for a user
 */
export async function getDashboardStats(userId: string): Promise<any | null> {
  const key = `dashboard:${userId}`;
  return get<any>(key);
}

/**
 * Cache dashboard stats for a user
 */
export async function setDashboardStats(userId: string, stats: any): Promise<boolean> {
  const key = `dashboard:${userId}`;
  return set(key, stats, CACHE_CONFIG.ttl.dashboard);
}

/**
 * Invalidate dashboard cache for a user
 */
export async function invalidateDashboard(userId: string): Promise<void> {
  await del(`dashboard:${userId}`);
}

/**
 * Get cached recent files for a user
 */
export async function getRecentFiles(userId: string, limit: number = 10): Promise<any[] | null> {
  const key = `recent:${userId}:${limit}`;
  return get<any[]>(key);
}

/**
 * Cache recent files for a user
 */
export async function setRecentFiles(userId: string, limit: number, files: any[]): Promise<boolean> {
  const key = `recent:${userId}:${limit}`;
  return set(key, files, CACHE_CONFIG.ttl.recent);
}

/**
 * Invalidate recent files cache for a user
 */
export async function invalidateRecentFiles(userId: string): Promise<void> {
  await delPattern(`recent:${userId}:*`);
}

// ==================== Admin Stats Cache ====================

/**
 * Get cached admin system stats
 */
export async function getAdminStats(): Promise<any | null> {
  const key = 'admin:stats';
  return get<any>(key);
}

/**
 * Cache admin system stats
 */
export async function setAdminStats(stats: any): Promise<boolean> {
  const key = 'admin:stats';
  return set(key, stats, CACHE_CONFIG.ttl.adminStats);
}

/**
 * Invalidate admin stats cache
 */
export async function invalidateAdminStats(): Promise<void> {
  await del('admin:stats');
}

// ==================== Bulk Invalidation ====================

/**
 * Invalidate all cache for a user (used after major operations)
 */
export async function invalidateAllUserCache(userId: string): Promise<void> {
  await Promise.all([
    invalidateUserFiles(userId),
    invalidateUser(userId),
    invalidateQuota(userId),
    invalidateFolders(userId),
    invalidateAlbums(userId),
    invalidateShares(userId),
    invalidateDashboard(userId),
    invalidateRecentFiles(userId),
  ]);
}

/**
 * Invalidate cache after file operation
 */
export async function invalidateAfterFileChange(userId: string, fileId?: string): Promise<void> {
  const promises: Promise<void>[] = [
    invalidateUserFiles(userId),
    invalidateQuota(userId),
    invalidateDashboard(userId),
    invalidateRecentFiles(userId),
    invalidateFavorites(userId), // Performance: also invalidate favorites cache
  ];

  if (fileId) {
    promises.push(invalidateFileMetadata(fileId));
  }

  await Promise.all(promises);
}

/**
 * Invalidate cache after album operation
 */
export async function invalidateAfterAlbumChange(userId: string, albumId?: string): Promise<void> {
  const promises: Promise<void>[] = [invalidateAlbums(userId)];
  if (albumId) {
    promises.push(invalidateAlbum(albumId));
  }
  await Promise.all(promises);
}

/**
 * Invalidate cache after share operation
 */
export async function invalidateAfterShareChange(userId: string, shareToken?: string): Promise<void> {
  const promises: Promise<void>[] = [invalidateShares(userId)];
  if (shareToken) {
    promises.push(invalidatePublicShare(shareToken));
  }
  await Promise.all(promises);
}

/**
 * Invalidate cache after folder operation
 */
export async function invalidateAfterFolderChange(userId: string): Promise<void> {
  await Promise.all([
    invalidateUserFiles(userId),
    invalidateFolders(userId),
  ]);
}

// ==================== Cache Stats ====================

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  connected: boolean;
  keys: number;
  memory: string;
} | null> {
  if (!isCacheAvailable()) return null;

  try {
    const info = await redis!.info('memory');
    const dbSize = await redis!.dbsize();

    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    const memory = memoryMatch ? memoryMatch[1] : 'unknown';

    return {
      connected: true,
      keys: dbSize,
      memory,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Close Redis connection
 */
export async function closeCache(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    isConnected = false;
  }
}

// Export cache instance for direct access if needed
export { redis, CACHE_CONFIG };
