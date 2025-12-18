/**
 * Prometheus Metrics Module for CloudBox
 * 
 * Provides application metrics for monitoring with Prometheus/Grafana.
 * Metrics endpoint is admin-only for security.
 */

import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Create a Registry to register metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({ register });

// ========== Custom Metrics ==========

// HTTP Request metrics
export const httpRequestsTotal = new client.Counter({
    name: 'cloudbox_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
});

export const httpRequestDuration = new client.Histogram({
    name: 'cloudbox_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
});

// Authentication metrics
export const authAttempts = new client.Counter({
    name: 'cloudbox_auth_attempts_total',
    help: 'Total authentication attempts',
    labelNames: ['type', 'success'],
    registers: [register],
});

export const activeSessions = new client.Gauge({
    name: 'cloudbox_active_sessions',
    help: 'Number of active user sessions',
    registers: [register],
});

// File operations metrics
export const fileUploadsTotal = new client.Counter({
    name: 'cloudbox_file_uploads_total',
    help: 'Total number of file uploads',
    labelNames: ['status'], // success, failed
    registers: [register],
});

export const fileUploadBytes = new client.Counter({
    name: 'cloudbox_file_upload_bytes_total',
    help: 'Total bytes uploaded',
    registers: [register],
});

export const fileDownloadsTotal = new client.Counter({
    name: 'cloudbox_file_downloads_total',
    help: 'Total number of file downloads',
    labelNames: ['type'], // direct, share
    registers: [register],
});

// Storage metrics
export const storageUsedBytes = new client.Gauge({
    name: 'cloudbox_storage_used_bytes',
    help: 'Total storage used in bytes',
    registers: [register],
});

export const storageQuotaBytes = new client.Gauge({
    name: 'cloudbox_storage_quota_bytes',
    help: 'Total storage quota in bytes',
    registers: [register],
});

// Queue metrics
export const queueJobsTotal = new client.Counter({
    name: 'cloudbox_queue_jobs_total',
    help: 'Total queue jobs processed',
    labelNames: ['queue', 'status'], // transcoding, thumbnail | completed, failed
    registers: [register],
});

export const queueJobsActive = new client.Gauge({
    name: 'cloudbox_queue_jobs_active',
    help: 'Currently active queue jobs',
    labelNames: ['queue'],
    registers: [register],
});

export const queueJobsWaiting = new client.Gauge({
    name: 'cloudbox_queue_jobs_waiting',
    help: 'Waiting queue jobs',
    labelNames: ['queue'],
    registers: [register],
});

// WebSocket metrics
export const websocketConnections = new client.Gauge({
    name: 'cloudbox_websocket_connections',
    help: 'Current WebSocket connections',
    registers: [register],
});

// Rate limiting metrics
export const rateLimitHits = new client.Counter({
    name: 'cloudbox_rate_limit_hits_total',
    help: 'Total rate limit hits',
    labelNames: ['endpoint'],
    registers: [register],
});

// ========== Middleware ==========

/**
 * Express middleware to track HTTP request metrics
 */
export function metricsMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
        const start = process.hrtime.bigint();

        res.on('finish', () => {
            const duration = Number(process.hrtime.bigint() - start) / 1e9; // Convert to seconds

            // Normalize route for metrics (avoid high cardinality)
            let route = req.route?.path || req.path;
            // Replace UUIDs and IDs with placeholder
            route = route.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
            route = route.replace(/\/[0-9]+(?=\/|$)/g, '/:id');

            const labels = {
                method: req.method,
                route,
                status_code: res.statusCode.toString(),
            };

            httpRequestsTotal.inc(labels);
            httpRequestDuration.observe(labels, duration);
        });

        next();
    };
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
    return register.metrics();
}

/**
 * Get content type for metrics response
 */
export function getMetricsContentType(): string {
    return register.contentType;
}

/**
 * Express route handler for /metrics endpoint
 * Should be protected with admin authentication
 */
export async function metricsHandler(req: Request, res: Response): Promise<void> {
    try {
        const metrics = await getMetrics();
        res.set('Content-Type', getMetricsContentType());
        res.send(metrics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to collect metrics' });
    }
}

// Export registry for advanced use cases
export { register };
