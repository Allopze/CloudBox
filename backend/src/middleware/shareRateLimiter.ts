import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger.js';

interface RateLimitEntry {
    count: number;
    resetAt: number;
    blockedUntil?: number;
}

// Token+IP rate limiter for share password attempts
const sharePasswordLimits = new Map<string, RateLimitEntry>();

// Configuration (can be overridden via environment variables)
const MAX_ATTEMPTS = parseInt(process.env.SHARE_MAX_PASSWORD_ATTEMPTS || '5', 10);
const WINDOW_MS = parseInt(process.env.SHARE_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10); // 15 minutes
const BLOCK_DURATION_MS = parseInt(process.env.SHARE_BLOCK_DURATION_MS || String(30 * 60 * 1000), 10); // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

// Periodic cleanup of expired entries
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of sharePasswordLimits.entries()) {
        if (entry.resetAt < now && (!entry.blockedUntil || entry.blockedUntil < now)) {
            sharePasswordLimits.delete(key);
        }
    }
}, CLEANUP_INTERVAL_MS);

/**
 * Rate limiter middleware for public share password verification
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

        const entry = sharePasswordLimits.get(key);

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
        if (!entry || entry.resetAt < now) {
            sharePasswordLimits.set(key, { count: 0, resetAt: now + WINDOW_MS });
        }

        // Check if limit exceeded (check before incrementing, only increment on actual failure)
        const currentEntry = sharePasswordLimits.get(key)!;
        if (currentEntry.count >= MAX_ATTEMPTS) {
            currentEntry.blockedUntil = now + BLOCK_DURATION_MS;
            const retryAfter = Math.ceil(BLOCK_DURATION_MS / 1000);

            logger.warn('Share password rate limit exceeded', {
                token: token.substring(0, 8) + '...', // Log partial token for debugging
                ip,
                attempts: currentEntry.count,
            });

            res.setHeader('Retry-After', String(retryAfter));
            res.status(429).json({
                error: 'Too many failed attempts. Please try again later.',
                retryAfter,
            });
            return;
        }

        // Attach helper functions to record password attempt results
        res.locals.recordPasswordFailure = () => {
            const e = sharePasswordLimits.get(key);
            if (e) {
                e.count++;
                logger.debug('Share password failure recorded', {
                    token: token.substring(0, 8) + '...',
                    ip,
                    attempts: e.count,
                    remaining: MAX_ATTEMPTS - e.count,
                });
            }
        };

        // Reset on success - allow legitimate users who eventually get the password right
        res.locals.recordPasswordSuccess = () => {
            sharePasswordLimits.delete(key);
            logger.debug('Share password success, rate limit cleared', {
                token: token.substring(0, 8) + '...',
                ip,
            });
        };

        next();
    };
}

/**
 * Get rate limit stats for monitoring/health checks
 */
export function getShareRateLimitStats(): { activeEntries: number; blockedEntries: number } {
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
    };
}
