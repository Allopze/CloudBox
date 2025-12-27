import { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { logger, createChildLogger } from '../lib/logger.js';
import { getClientIP } from '../lib/audit.js';

// Extend Express Request type to include logger and requestId
declare global {
    namespace Express {
        interface Request {
            id: string;
            log: typeof logger;
        }
    }
}

// Middleware to add request context and logging
export const requestContextMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    // Ensure request ID is set
    req.id = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-ID', req.id);

    // Attach the main logger (context will be added per-log)
    req.log = logger;

    // Log incoming request  
    const startTime = Date.now();

    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const context = {
            requestId: req.id,
            method: req.method,
            url: req.path, // Avoid logging query params (may contain secrets)
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: getClientIP(req),
            userId: (req as any).user?.userId,
        };

        if (res.statusCode >= 500) {
            logger.error('Request failed', context);
        } else if (res.statusCode >= 400) {
            logger.warn('Request completed with error', context);
        } else {
            logger.info('Request completed', context);
        }
    });

    next();
};

// Simple HTTP logging middleware
export const httpLogger: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    // Skip health check endpoints
    const ignorePaths = ['/api/health/ping', '/api/health/ready', '/health'];
    if (ignorePaths.some(path => req.url?.startsWith(path))) {
        return next();
    }

    requestContextMiddleware(req, res, next);
};
