import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import logger from '../lib/logger.js';

interface RateLimitEntry {
    count: number;
    resetAt: number;
    blockedUntil?: number;
}

// Configuration (can be overridden via environment variables)
const MAX_ATTEMPTS = parseInt(process.env.SHARE_MAX_PASSWORD_ATTEMPTS || '5', 10);
const WINDOW_MS = parseInt(process.env.SHARE_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10); // 15 minutes
const BLOCK_DURATION_MS = parseInt(process.env.SHARE_BLOCK_DURATION_MS || String(30 * 60 * 1000), 10); // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

// Redis connection for distributed rate limiting
let redis: RedisType | null = null;
let redisAvailable = false;

// In-memory fallback for development (when Redis is not available)
const sharePasswordLimits = new Map<string, RateLimitEntry>();

// Initialize Redis connection
async function initRedis(): Promise<void> {
    if (redis) return;

    try {
        // @ts-expect-error - ioredis ESM default export compatibility
        redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB || '0'),
            keyPrefix: 'share:ratelimit:',
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            retryStrategy: (times: number) => {
                if (times > 3) return null; // Stop retrying after 3 attempts
                return Math.min(times * 100, 1000);
            },
        });

        await redis!.connect();
        redisAvailable = true;
        logger.info('Share rate limiter using Redis');
    } catch (error) {
        logger.warn('Share rate limiter Redis not available, using in-memory fallback', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        redis = null;
        redisAvailable = false;
    }
}

// Initialize on module load
initRedis().catch(() => { });

// Periodic cleanup of expired entries (for in-memory fallback)
setInterval(() => {
    if (!redisAvailable) {
        const now = Date.now();
        for (const [key, entry] of sharePasswordLimits.entries()) {
            if (entry.resetAt < now && (!entry.blockedUntil || entry.blockedUntil < now)) {
                sharePasswordLimits.delete(key);
            }
        }
    }
}, CLEANUP_INTERVAL_MS);

/**
 * Get rate limit entry from Redis or memory
 */
async function getEntry(key: string): Promise<RateLimitEntry | null> {
    if (redisAvailable && redis) {
        const data = await redis.get(key);
        if (data) {
            return JSON.parse(data);
        }
        return null;
    }
    return sharePasswordLimits.get(key) || null;
}

/**
 * Set rate limit entry in Redis or memory
 */
async function setEntry(key: string, entry: RateLimitEntry): Promise<void> {
    if (redisAvailable && redis) {
        const ttlMs = Math.max(WINDOW_MS, BLOCK_DURATION_MS);
        const ttlSeconds = Math.ceil(ttlMs / 1000);
        await redis.setex(key, ttlSeconds, JSON.stringify(entry));
    } else {
        sharePasswordLimits.set(key, entry);
    }
}

/**
 * Delete rate limit entry from Redis or memory
 */
async function deleteEntry(key: string): Promise<void> {
    if (redisAvailable && redis) {
        await redis.del(key);
    } else {
        sharePasswordLimits.delete(key);
    }
}

/**
 * Rate limiter middleware for public share password verification
 * 
 * Uses Redis for distributed rate limiting across multiple instances.
 * Falls back to in-memory Map when Redis is not available (development).
 * 
 * Limits password attempts per token+IP combination to prevent brute-force attacks.
 * After MAX_ATTEMPTS failures, blocks the token+IP for BLOCK_DURATION_MS.
 * 
 * Attaches helper functions to res.locals:
 * - recordPasswordFailure(): Call on wrong password
 * - recordPasswordSuccess(): Call on correct password (resets limit)
 */
export function shareRateLimiter() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const token = req.params.token;
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const key = `${token}:${ip}`;
        const now = Date.now();

        try {
            const entry = await getEntry(key);

            // Check if currently blocked
            if (entry?.blockedUntil && entry.blockedUntil > now) {
                const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
                res.setHeader('Retry-After', String(retryAfter));
                res.status(429).json({
                    error: 'Too many failed attempts. Please try again later.',
                    retryAfter,
                });
                return;
            }

            // Initialize or update rate limit entry
            let currentEntry = entry;
            if (!currentEntry || currentEntry.resetAt < now) {
                currentEntry = { count: 0, resetAt: now + WINDOW_MS };
                await setEntry(key, currentEntry);
            }

            // Check if limit exceeded (check before incrementing, only increment on actual failure)
            if (currentEntry.count >= MAX_ATTEMPTS) {
                currentEntry.blockedUntil = now + BLOCK_DURATION_MS;
                await setEntry(key, currentEntry);

                const retryAfter = Math.ceil(BLOCK_DURATION_MS / 1000);

                logger.warn('Share password rate limit exceeded', {
                    token: token.substring(0, 8) + '...', // Log partial token for debugging
                    ip,
                    attempts: currentEntry.count,
                    usingRedis: redisAvailable,
                });

                res.setHeader('Retry-After', String(retryAfter));
                res.status(429).json({
                    error: 'Too many failed attempts. Please try again later.',
                    retryAfter,
                });
                return;
            }

            // Attach helper functions to record password attempt results
            res.locals.recordPasswordFailure = async () => {
                const e = await getEntry(key);
                if (e) {
                    e.count++;
                    await setEntry(key, e);
                    logger.debug('Share password failure recorded', {
                        token: token.substring(0, 8) + '...',
                        ip,
                        attempts: e.count,
                        remaining: MAX_ATTEMPTS - e.count,
                        usingRedis: redisAvailable,
                    });
                }
            };

            // Reset on success - allow legitimate users who eventually get the password right
            res.locals.recordPasswordSuccess = async () => {
                await deleteEntry(key);
                logger.debug('Share password success, rate limit cleared', {
                    token: token.substring(0, 8) + '...',
                    ip,
                    usingRedis: redisAvailable,
                });
            };

            next();
        } catch (error) {
            // On Redis error, fail open (allow the request) but log warning
            logger.warn('Share rate limiter error, failing open', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            next();
        }
    };
}

/**
 * Check if Redis is being used for rate limiting
 */
export function isUsingRedis(): boolean {
    return redisAvailable;
}

/**
 * Get rate limit stats for monitoring/health checks
 */
export async function getShareRateLimitStats(): Promise<{
    activeEntries: number;
    blockedEntries: number;
    usingRedis: boolean;
}> {
    if (redisAvailable && redis) {
        try {
            // Use SCAN instead of KEYS for O(N) with cursor instead of blocking
            let cursor = '0';
            let activeCount = 0;
            let blockedCount = 0;
            const now = Date.now();

            do {
                const [newCursor, keys] = await redis.scan(cursor, 'COUNT', 100);
                cursor = newCursor;

                for (const key of keys) {
                    activeCount++;
                    const data = await redis.get(key);
                    if (data) {
                        const entry = JSON.parse(data) as RateLimitEntry;
                        if (entry.blockedUntil && entry.blockedUntil > now) {
                            blockedCount++;
                        }
                    }
                }
            } while (cursor !== '0');

            return { activeEntries: activeCount, blockedEntries: blockedCount, usingRedis: true };
        } catch (error) {
            // Fallback to reporting no entries on Redis error
            return { activeEntries: 0, blockedEntries: 0, usingRedis: true };
        }
    }

    // In-memory fallback stats
    const now = Date.now();
    let blockedCount = 0;

    for (const entry of sharePasswordLimits.values()) {
        if (entry.blockedUntil && entry.blockedUntil > now) {
            blockedCount++;
        }
    }

    return {
        activeEntries: sharePasswordLimits.size,
        blockedEntries: blockedCount,
        usingRedis: false,
    };
}
