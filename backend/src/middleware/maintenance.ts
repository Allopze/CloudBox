import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/jwt.js';

// Cache maintenance status to avoid DB hits on every request
let maintenanceCache: { enabled: boolean; timestamp: number } | null = null;
const CACHE_TTL = 10000; // 10 seconds

export const getMaintenanceStatus = async (): Promise<boolean> => {
    const now = Date.now();
    if (maintenanceCache && (now - maintenanceCache.timestamp < CACHE_TTL)) {
        return maintenanceCache.enabled;
    }

    try {
        const setting = await prisma.settings.findUnique({
            where: { key: 'maintenance_mode' }
        });

        const enabled = setting?.value === 'true';
        maintenanceCache = { enabled, timestamp: now };
        return enabled;
    } catch (error) {
        // Fail safe: if DB is down, assume not in maintenance usually, 
        // but if we can't check, maybe better to let it fail naturally or assume off
        console.error('Failed to check maintenance status:', error);
        return false;
    }
};

// Force update cache (called when admin toggles it)
export const invalidateMaintenanceCache = () => {
    maintenanceCache = null;
};

// Check if path is exempt from maintenance (public endpoints + auth)
const isExemptPath = (path: string): boolean => {
    const exemptPaths = [
        '/api/health',       // Health checks
        '/api/auth',         // Auth (login/register to allow admins to get in)
        '/api/status',       // Status checks
        '/api/admin/settings/branding', // Branding for login page (public)
        '/api/admin/branding',    // Branding assets (logos, favicon)
        '/api/share',        // Public shares (optional: block these too? validation plan says exempt public)
        '/api/2fa/verify',   // 2FA verification
    ];

    // Specific check for share tokens which might be /api/share/:token
    return exemptPaths.some(p => path.startsWith(p));
};

export const maintenanceMode = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    // 1. Skip if path is exempt
    // Note: Use originalUrl because req.path is relative to the mount point (/api/)
    const fullPath = (req.originalUrl || req.url || req.path || '').split('?')[0]; // Remove query string
    if (isExemptPath(fullPath)) {
        return next();
    }

    // 2. Check maintenance status
    const isMaintenance = await getMaintenanceStatus();
    if (!isMaintenance) {
        return next();
    }

    // 3. Allow admins to bypass
    // Note: This middleware runs BEFORE auth in some cases or AFTER? 
    // If we run it global, we need to inspect the token manually if auth middleware hasn't run yet.
    // We'll place this AFTER standard auth middleware in index.ts for simplicity,
    // BUT `index.ts` has auth only on specific routes.
    // So we need to peek at the token manually if req.user is not set.

    // If auth middleware already ran, trust req.user first.
    if (req.user) {
        if (req.user.role === 'ADMIN') {
            return next();
        }

        res.status(503).json({
            error: 'El sistema estǭ en mantenimiento. Por favor, intenta de nuevo mǭs tarde.',
            code: 'MAINTENANCE_MODE',
            maintenance: true,
            message: 'El sistema estǭ en mantenimiento. Vuelve mǭs tarde.',
            retryAfter: 3600
        });
        return;
    }

    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const payload = verifyAccessToken(token);

            // We need to check role. VerifyAccessToken returns payload with role if we put it there?
            // Let's check jwt.ts to be sure. 
            // Usually payloads have userId. We might need to check DB or if role is in token.
            // If verifyAccessToken throws, it's invalid.

            // OPTION A: If we trust the token claim (if role is in it)
            // OPTION B: We fetch user. But that hits DB. 

            // Let's look at what verifyAccessToken returns or check user from DB if needed.
            // For performance, we should ideally have role in token.

            // However, if we placed this middleware AFTER `authenticate` in the middleware chain for protected routes,
            // `req.user` would be set.
            // BUT we want to block even routes that might be public but not exempt?
            // Actually, if it's a protected route, `authenticate` runs first.

            // The issue is `index.ts` structure:
            // app.use('/api/users', userRoutes); -> these have auth inside.

            // So we should register this middleware globally in index.ts

            // req.user would be set by earlier auth middleware
            // This check is redundant as we handled req.user above, but keep for safety
            const user = req.user as { role?: string } | undefined;
            if (user && user.role === 'ADMIN') {
                return next();
            }

            // If req.user is set (from previous auth middleware) but not ADMIN -> Block
            if (req.user) {
                res.status(503).json({
                    error: 'maintenance',
                    message: 'El sistema está en mantenimiento. Vuelve pronto.',
                    retryAfter: 3600
                });
                return;
            }

            // If no req.user yet (unprotected route or middleware specific), verify token manually
            // We'll fetch the user to be sure about admin status
            const dbUser = await prisma.user.findUnique({
                where: { id: payload.userId },
                select: { role: true }
            });

            if (dbUser?.role === 'ADMIN') {
                // It's an admin, let them pass
                // We can optionally attach to req.user if we want, but better leave that to auth middleware
                return next();
            }
        }
    } catch (err) {
        // If token invalid or check failed, treat as regular user -> Block
    }

    // If we get here, it's maintenance mode and user is not an allowed admin
    res.status(503).json({
        error: 'El sistema está en mantenimiento. Por favor, intenta de nuevo más tarde.',
        code: 'MAINTENANCE_MODE',
        maintenance: true,
        message: 'El sistema está en mantenimiento. Vuelve más tarde.',
        retryAfter: 3600
    });
};
