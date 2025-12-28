import prisma from './prisma.js';
import { config } from '../config/index.js';
import * as cache from './cache.js';

const ALLOWED_ORIGINS_KEY = 'allowed_origins';
const CACHE_KEY = 'cors:allowed_origins';
const CACHE_TTL = 300; // 5 minutes

/**
 * Load allowed origins from DB with caching
 */
async function loadAllowedOrigins(): Promise<string[]> {
    // Try cache first
    const cached = await cache.get<string[]>(CACHE_KEY);
    if (cached) {
        return cached;
    }

    // Fetch from DB
    const setting = await prisma.settings.findUnique({
        where: { key: ALLOWED_ORIGINS_KEY },
    });

    const origins: string[] = [];
    if (setting?.value) {
        // Parse comma or newline separated list
        const parsed = setting.value
            .split(/[,\n]/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        origins.push(...parsed);
    }

    // Cache the result
    await cache.set(CACHE_KEY, origins, CACHE_TTL);

    return origins;
}

/**
 * Check if an origin is allowed by CORS policy
 */
export async function isOriginAllowed(origin: string | undefined): Promise<boolean> {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
        return true;
    }

    // In development, allow any localhost port
    if (config.nodeEnv === 'development' && origin.startsWith('http://localhost:')) {
        return true;
    }

    // Always allow the configured frontend URL
    if (origin === config.frontendUrl) {
        return true;
    }

    // Check DB-configured allowed origins
    const allowedOrigins = await loadAllowedOrigins();
    if (allowedOrigins.includes(origin)) {
        return true;
    }

    return false;
}

/**
 * Invalidate the allowed origins cache (call after updating settings)
 */
export async function invalidateAllowedOriginsCache(): Promise<void> {
    await cache.del(CACHE_KEY);
}
