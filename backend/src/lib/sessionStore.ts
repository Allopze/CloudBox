/**
 * Redis Session Store for CloudBox
 * 
 * Manages user sessions with Redis for:
 * - Instant session invalidation
 * - Multiple device tracking
 * - Session limiting
 * - Logout from all devices
 */

import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';

// Session configuration
const SESSION_CONFIG = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: 'session:',
  },
  // Session TTL matches refresh token expiry
  ttl: 7 * 24 * 60 * 60, // 7 days in seconds
  // Maximum concurrent sessions per user (0 = unlimited)
  maxSessions: parseInt(process.env.MAX_SESSIONS_PER_USER || '10'),
};

export interface SessionData {
  userId: string;
  sessionId: string;
  deviceInfo: {
    userAgent?: string;
    ip?: string;
    browser?: string;
    os?: string;
  };
  createdAt: string;
  lastUsed: string;
  refreshToken?: string; // Hashed, not plain
}

let redis: RedisType | null = null;
let isConnected = false;

/**
 * Initialize Redis connection for sessions
 */
export async function initSessionStore(): Promise<boolean> {
  try {
    // @ts-ignore - ioredis types issue with ESM
    redis = new Redis({
      host: SESSION_CONFIG.redis.host,
      port: SESSION_CONFIG.redis.port,
      password: SESSION_CONFIG.redis.password,
      db: SESSION_CONFIG.redis.db,
      keyPrefix: SESSION_CONFIG.redis.keyPrefix,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    await redis!.connect();
    isConnected = true;
    logger.info('Session store initialized with Redis');
    return true;
  } catch (error) {
    logger.warn('Session store initialization failed, using database fallback', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    redis = null;
    isConnected = false;
    return false;
  }
}

/**
 * Check if session store is available
 */
export function isSessionStoreAvailable(): boolean {
  return isConnected && redis !== null;
}

/**
 * Parse user agent string into device info
 */
function parseUserAgent(userAgent?: string): { browser?: string; os?: string } {
  if (!userAgent) return {};

  let browser: string | undefined;
  let os: string | undefined;

  // Detect browser
  if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Edg')) browser = 'Edge';
  else if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Opera')) browser = 'Opera';

  // Detect OS
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';

  return { browser, os };
}

/**
 * Create a new session
 */
export async function createSession(
  userId: string,
  refreshTokenHash: string,
  deviceInfo: { userAgent?: string; ip?: string }
): Promise<string | null> {
  if (!isSessionStoreAvailable()) return null;

  try {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const { browser, os } = parseUserAgent(deviceInfo.userAgent);

    const session: SessionData = {
      userId,
      sessionId,
      deviceInfo: {
        userAgent: deviceInfo.userAgent,
        ip: deviceInfo.ip,
        browser,
        os,
      },
      createdAt: now,
      lastUsed: now,
      refreshToken: refreshTokenHash,
    };

    // Store session data
    const sessionKey = `${userId}:${sessionId}`;
    await redis!.setex(sessionKey, SESSION_CONFIG.ttl, JSON.stringify(session));

    // Add to user's session set
    const userSessionsKey = `list:${userId}`;
    await redis!.sadd(userSessionsKey, sessionId);
    await redis!.expire(userSessionsKey, SESSION_CONFIG.ttl);

    // Enforce max sessions limit
    if (SESSION_CONFIG.maxSessions > 0) {
      const sessions = await redis!.smembers(userSessionsKey);
      if (sessions.length > SESSION_CONFIG.maxSessions) {
        // Get oldest sessions and remove them
        const sessionsWithTime: Array<{ sessionId: string; createdAt: number }> = await Promise.all(
          sessions.map(async (sid: string) => {
            const data = await redis!.get(`${userId}:${sid}`);
            if (data) {
              const parsed = JSON.parse(data) as SessionData;
              return { sessionId: sid, createdAt: new Date(parsed.createdAt).getTime() };
            }
            return { sessionId: sid, createdAt: 0 };
          })
        );

        // Sort by creation time (oldest first)
        sessionsWithTime.sort((a, b) => a.createdAt - b.createdAt);

        // Remove oldest sessions exceeding the limit
        const toRemove = sessionsWithTime.slice(0, sessions.length - SESSION_CONFIG.maxSessions);
        for (const { sessionId: sid } of toRemove) {
          await invalidateSession(userId, sid);
        }

        logger.info('Removed old sessions due to max limit', {
          userId,
          removed: toRemove.length,
        });
      }
    }

    logger.debug('Session created', { userId, sessionId, browser, os });
    return sessionId;
  } catch (error) {
    logger.error('Failed to create session', { userId }, error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Get session data
 */
export async function getSession(userId: string, sessionId: string): Promise<SessionData | null> {
  if (!isSessionStoreAvailable()) return null;

  try {
    const sessionKey = `${userId}:${sessionId}`;
    const data = await redis!.get(sessionKey);
    
    if (!data) return null;
    
    return JSON.parse(data) as SessionData;
  } catch (error) {
    logger.debug('Failed to get session', { userId, sessionId });
    return null;
  }
}

/**
 * Validate a session exists and is valid
 */
export async function validateSession(userId: string, sessionId: string): Promise<boolean> {
  if (!isSessionStoreAvailable()) {
    // If Redis is not available, assume session is valid (fallback to JWT validation)
    return true;
  }

  try {
    const session = await getSession(userId, sessionId);
    if (!session) {
      logger.debug('Session not found in store', { userId, sessionId });
      return false;
    }

    // Update last used time
    session.lastUsed = new Date().toISOString();
    const sessionKey = `${userId}:${sessionId}`;
    await redis!.setex(sessionKey, SESSION_CONFIG.ttl, JSON.stringify(session));

    return true;
  } catch (error) {
    logger.debug('Session validation error', { userId, sessionId });
    return true; // Fail open to not break auth if Redis has issues
  }
}

/**
 * Invalidate a specific session
 */
export async function invalidateSession(userId: string, sessionId: string): Promise<boolean> {
  if (!isSessionStoreAvailable()) return false;

  try {
    const sessionKey = `${userId}:${sessionId}`;
    await redis!.del(sessionKey);
    
    const userSessionsKey = `list:${userId}`;
    await redis!.srem(userSessionsKey, sessionId);

    logger.debug('Session invalidated', { userId, sessionId });
    return true;
  } catch (error) {
    logger.error('Failed to invalidate session', { userId, sessionId }, error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Invalidate all sessions for a user (logout from all devices)
 */
export async function invalidateAllSessions(userId: string): Promise<number> {
  if (!isSessionStoreAvailable()) return 0;

  try {
    const userSessionsKey = `list:${userId}`;
    const sessions = await redis!.smembers(userSessionsKey);

    // Delete all session data
    for (const sessionId of sessions) {
      await redis!.del(`${userId}:${sessionId}`);
    }

    // Delete the sessions set
    await redis!.del(userSessionsKey);

    logger.info('All sessions invalidated', { userId, count: sessions.length });
    return sessions.length;
  } catch (error) {
    logger.error('Failed to invalidate all sessions', { userId }, error instanceof Error ? error : undefined);
    return 0;
  }
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<SessionData[]> {
  if (!isSessionStoreAvailable()) return [];

  try {
    const userSessionsKey = `list:${userId}`;
    const sessionIds = await redis!.smembers(userSessionsKey);

    const sessions: SessionData[] = [];
    for (const sessionId of sessionIds) {
      const session = await getSession(userId, sessionId);
      if (session) {
        // Remove sensitive data before returning
        const { refreshToken, ...safeSession } = session;
        sessions.push(safeSession as SessionData);
      }
    }

    // Sort by last used (most recent first)
    sessions.sort((a, b) => 
      new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    );

    return sessions;
  } catch (error) {
    logger.error('Failed to get user sessions', { userId }, error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Find session by refresh token hash
 */
export async function findSessionByRefreshToken(
  userId: string,
  refreshTokenHash: string
): Promise<SessionData | null> {
  if (!isSessionStoreAvailable()) return null;

  try {
    const userSessionsKey = `list:${userId}`;
    const sessionIds = await redis!.smembers(userSessionsKey);

    for (const sessionId of sessionIds) {
      const session = await getSession(userId, sessionId);
      if (session && session.refreshToken === refreshTokenHash) {
        return session;
      }
    }

    return null;
  } catch (error) {
    logger.debug('Failed to find session by refresh token', { userId });
    return null;
  }
}

/**
 * Update session's refresh token (on token rotation)
 */
export async function updateSessionRefreshToken(
  userId: string,
  sessionId: string,
  newRefreshTokenHash: string
): Promise<boolean> {
  if (!isSessionStoreAvailable()) return false;

  try {
    const session = await getSession(userId, sessionId);
    if (!session) return false;

    session.refreshToken = newRefreshTokenHash;
    session.lastUsed = new Date().toISOString();

    const sessionKey = `${userId}:${sessionId}`;
    await redis!.setex(sessionKey, SESSION_CONFIG.ttl, JSON.stringify(session));

    return true;
  } catch (error) {
    logger.error('Failed to update session refresh token', { userId, sessionId }, error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Get session store statistics
 * Uses DBSIZE for O(1) key count instead of KEYS which is O(N)
 */
export async function getSessionStats(): Promise<{
  connected: boolean;
  totalSessions: number;
  estimatedCount: boolean;
} | null> {
  if (!isSessionStoreAvailable()) return null;

  try {
    // Use DBSIZE for O(1) operation instead of KEYS which blocks Redis
    // This gives total keys in the DB, which for session store is mostly sessions
    const dbSize = await redis!.dbsize();
    
    // Note: This is an estimate since it includes 'list:' keys too
    // For exact count, we'd need SCAN but that's slower
    // The session keyPrefix makes this a reasonable approximation
    return {
      connected: true,
      totalSessions: dbSize,
      estimatedCount: true, // Flag that this is an approximation
    };
  } catch (error) {
    return null;
  }
}

/**
 * Close Redis connection
 */
export async function closeSessionStore(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    isConnected = false;
  }
}

export { SESSION_CONFIG };
