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
  },
  enabled: process.env.CACHE_ENABLED !== 'false',
};

let redis: RedisType | null = null;
let isConnected = false;

/**
 * Initialize Redis connection for caching
 */
export async function initCache(): Promise<boolean> {
  if (!CACHE_CONFIG.enabled) {
    logger.info('Cache is disabled by configuration');
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
    logger.warn('Cache initialization failed, running without cache', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
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
  category?: string
): Promise<any[] | null> {
  const key = `files:${userId}:${folderId || 'root'}:${page}:${category || 'all'}`;
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
  files: any[]
): Promise<boolean> {
  const key = `files:${userId}:${folderId || 'root'}:${page}:${category || 'all'}`;
  return set(key, files, CACHE_CONFIG.ttl.files);
}

/**
 * Invalidate all files cache for a user
 */
export async function invalidateUserFiles(userId: string): Promise<void> {
  await delPattern(`files:${userId}:*`);
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
  ]);
}

/**
 * Invalidate cache after file operation
 */
export async function invalidateAfterFileChange(userId: string, fileId?: string): Promise<void> {
  const promises: Promise<void>[] = [
    invalidateUserFiles(userId),
    invalidateQuota(userId),
  ];
  
  if (fileId) {
    promises.push(invalidateFileMetadata(fileId));
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
