/**
 * WOPI Lock Manager
 * 
 * Manages file locks for WOPI edit operations.
 * Supports both database (Prisma) and Redis backends.
 */

import { config } from '../../config/index.js';
import prisma from '../prisma.js';
import logger from '../logger.js';

export interface LockInfo {
    lockId: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
}

export interface LockResult {
    success: boolean;
    lockId?: string;
    existingLockId?: string;
    reason?: string;
}

// Redis client (lazy initialized)
let redisClient: import('ioredis').Redis | null = null;

async function getRedisClient(): Promise<import('ioredis').Redis | null> {
    if (config.wopi.lockProvider !== 'redis') {
        return null;
    }

    if (redisClient) {
        return redisClient;
    }

    try {
        const ioredis = await import('ioredis');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const RedisClient = (ioredis as any).default || ioredis;
        redisClient = new RedisClient({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB || '0'),
            maxRetriesPerRequest: 3,
            keyPrefix: 'wopi:lock:',
        });
        return redisClient;
    } catch (error) {
        logger.warn('Failed to connect to Redis for WOPI locks, falling back to database', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        return null;
    }
}

function getLockKey(fileId: string): string {
    return `wopi:lock:${fileId}`;
}

/**
 * Acquire a lock on a file
 */
export async function acquireLock(
    fileId: string,
    lockId: string,
    userId: string,
    ttlSeconds?: number
): Promise<LockResult> {
    const ttl = ttlSeconds || config.wopi.lockTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Try Redis first if configured
    const redis = await getRedisClient();
    if (redis) {
        return acquireLockRedis(redis, fileId, lockId, userId, ttl);
    }

    // Fall back to database
    return acquireLockDatabase(fileId, lockId, userId, expiresAt);
}

async function acquireLockRedis(
    redis: import('ioredis').Redis,
    fileId: string,
    lockId: string,
    userId: string,
    ttlSeconds: number
): Promise<LockResult> {
    const key = fileId; // Redis client has keyPrefix
    const lockData = JSON.stringify({ lockId, userId, createdAt: new Date().toISOString() });

    // Try to set lock with NX (only if not exists)
    const result = await redis.set(key, lockData, 'EX', ttlSeconds, 'NX');

    if (result === 'OK') {
        return { success: true, lockId };
    }

    // Lock exists - check if it's the same lock (refresh scenario)
    const existingData = await redis.get(key);
    if (existingData) {
        try {
            const existing = JSON.parse(existingData);
            if (existing.lockId === lockId) {
                // Same lock ID - this is a refresh, update TTL
                await redis.expire(key, ttlSeconds);
                return { success: true, lockId };
            }
            return { success: false, existingLockId: existing.lockId, reason: 'Lock conflict' };
        } catch {
            // Invalid data, try to overwrite
            await redis.set(key, lockData, 'EX', ttlSeconds);
            return { success: true, lockId };
        }
    }

    return { success: false, reason: 'Failed to acquire lock' };
}

async function acquireLockDatabase(
    fileId: string,
    lockId: string,
    userId: string,
    expiresAt: Date
): Promise<LockResult> {
    try {
        // Check for existing lock
        const existingLock = await prisma.wopiLock.findUnique({
            where: { fileId },
        });

        if (existingLock) {
            // Check if same lock ID (refresh scenario)
            if (existingLock.lockId === lockId) {
                // Refresh the lock
                await prisma.wopiLock.update({
                    where: { fileId },
                    data: { expiresAt },
                });
                return { success: true, lockId };
            }

            // Check if expired
            if (existingLock.expiresAt < new Date()) {
                // Expired lock - overwrite
                await prisma.wopiLock.update({
                    where: { fileId },
                    data: { lockId, userId, expiresAt },
                });
                return { success: true, lockId };
            }

            // Active lock by someone else
            return { success: false, existingLockId: existingLock.lockId, reason: 'Lock conflict' };
        }

        // No existing lock - create new
        await prisma.wopiLock.create({
            data: { fileId, lockId, userId, expiresAt },
        });
        return { success: true, lockId };
    } catch (error) {
        // Handle race condition (unique constraint violation)
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            const existingLock = await prisma.wopiLock.findUnique({ where: { fileId } });
            return { success: false, existingLockId: existingLock?.lockId, reason: 'Lock conflict' };
        }
        throw error;
    }
}

/**
 * Refresh an existing lock (extend TTL)
 */
export async function refreshLock(
    fileId: string,
    lockId: string,
    ttlSeconds?: number
): Promise<LockResult> {
    const ttl = ttlSeconds || config.wopi.lockTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const redis = await getRedisClient();
    if (redis) {
        const existingData = await redis.get(fileId);
        if (!existingData) {
            return { success: false, reason: 'Lock not found' };
        }

        try {
            const existing = JSON.parse(existingData);
            if (existing.lockId !== lockId) {
                return { success: false, existingLockId: existing.lockId, reason: 'Lock ID mismatch' };
            }
            await redis.expire(fileId, ttl);
            return { success: true, lockId };
        } catch {
            return { success: false, reason: 'Invalid lock data' };
        }
    }

    // Database backend
    const existingLock = await prisma.wopiLock.findUnique({ where: { fileId } });
    if (!existingLock) {
        return { success: false, reason: 'Lock not found' };
    }

    if (existingLock.lockId !== lockId) {
        return { success: false, existingLockId: existingLock.lockId, reason: 'Lock ID mismatch' };
    }

    await prisma.wopiLock.update({
        where: { fileId },
        data: { expiresAt },
    });
    return { success: true, lockId };
}

/**
 * Release a lock
 */
export async function releaseLock(fileId: string, lockId: string): Promise<LockResult> {
    const redis = await getRedisClient();
    if (redis) {
        const existingData = await redis.get(fileId);
        if (!existingData) {
            return { success: true }; // Already unlocked
        }

        try {
            const existing = JSON.parse(existingData);
            if (existing.lockId !== lockId) {
                return { success: false, existingLockId: existing.lockId, reason: 'Lock ID mismatch' };
            }
            await redis.del(fileId);
            return { success: true };
        } catch {
            await redis.del(fileId);
            return { success: true };
        }
    }

    // Database backend
    const existingLock = await prisma.wopiLock.findUnique({ where: { fileId } });
    if (!existingLock) {
        return { success: true }; // Already unlocked
    }

    if (existingLock.lockId !== lockId) {
        return { success: false, existingLockId: existingLock.lockId, reason: 'Lock ID mismatch' };
    }

    await prisma.wopiLock.delete({ where: { fileId } });
    return { success: true };
}

/**
 * Get current lock info for a file
 */
export async function getLock(fileId: string): Promise<LockInfo | null> {
    const redis = await getRedisClient();
    if (redis) {
        const data = await redis.get(fileId);
        if (!data) return null;

        try {
            const parsed = JSON.parse(data);
            const ttl = await redis.ttl(fileId);
            return {
                lockId: parsed.lockId,
                userId: parsed.userId,
                expiresAt: new Date(Date.now() + ttl * 1000),
                createdAt: new Date(parsed.createdAt),
            };
        } catch {
            return null;
        }
    }

    // Database backend
    const lock = await prisma.wopiLock.findUnique({ where: { fileId } });
    if (!lock) return null;

    // Check if expired
    if (lock.expiresAt < new Date()) {
        // Clean up expired lock
        await prisma.wopiLock.delete({ where: { fileId } }).catch(() => { });
        return null;
    }

    return {
        lockId: lock.lockId,
        userId: lock.userId,
        expiresAt: lock.expiresAt,
        createdAt: lock.createdAt,
    };
}

/**
 * Validate if the provided lock ID matches the current lock
 */
export async function validateLock(fileId: string, lockId: string): Promise<{ valid: boolean; existingLockId?: string }> {
    const currentLock = await getLock(fileId);

    if (!currentLock) {
        // No lock - valid for operations that don't require a lock
        return { valid: true };
    }

    if (currentLock.lockId === lockId) {
        return { valid: true };
    }

    return { valid: false, existingLockId: currentLock.lockId };
}

/**
 * Atomic unlock and relock operation
 */
export async function unlockAndRelock(
    fileId: string,
    oldLockId: string,
    newLockId: string,
    userId: string,
    ttlSeconds?: number
): Promise<LockResult> {
    const ttl = ttlSeconds || config.wopi.lockTtlSeconds;

    // First validate the old lock
    const validation = await validateLock(fileId, oldLockId);
    if (!validation.valid) {
        return { success: false, existingLockId: validation.existingLockId, reason: 'Old lock ID mismatch' };
    }

    // Release and acquire new lock
    const redis = await getRedisClient();
    if (redis) {
        const lockData = JSON.stringify({ lockId: newLockId, userId, createdAt: new Date().toISOString() });
        await redis.set(fileId, lockData, 'EX', ttl);
        return { success: true, lockId: newLockId };
    }

    // Database backend
    const expiresAt = new Date(Date.now() + ttl * 1000);
    await prisma.wopiLock.upsert({
        where: { fileId },
        update: { lockId: newLockId, userId, expiresAt },
        create: { fileId, lockId: newLockId, userId, expiresAt },
    });

    return { success: true, lockId: newLockId };
}

/**
 * Clean up expired locks (for database backend)
 */
export async function cleanupExpiredLocks(): Promise<number> {
    const { count } = await prisma.wopiLock.deleteMany({
        where: { expiresAt: { lt: new Date() } },
    });
    return count;
}
