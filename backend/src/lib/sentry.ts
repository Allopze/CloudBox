/**
 * Sentry/GlitchTip Error Tracking Configuration
 * 
 * GlitchTip is a self-hosted, open-source alternative to Sentry.
 * It uses the same SDK and protocol, so we can use @sentry/node.
 * 
 * Usage:
 * 1. Deploy GlitchTip via docker-compose.prod.yml
 * 2. Create organization and project in GlitchTip (http://localhost:8000)
 * 3. Copy the DSN and set it as SENTRY_DSN environment variable
 */

import * as Sentry from '@sentry/node';
import { config } from '../config/index.js';

const dsn = process.env.SENTRY_DSN;

export function initSentry(): void {
    if (!dsn) {
        console.log('[Sentry] DSN not configured, error tracking disabled');
        return;
    }

    Sentry.init({
        dsn,
        environment: config.nodeEnv,

        // Performance monitoring (optional, can be heavy)
        tracesSampleRate: config.nodeEnv === 'production' ? 0.1 : 1.0,

        // Only send errors from our code, not node_modules
        integrations: [
            Sentry.onUnhandledRejectionIntegration(),
            Sentry.onUncaughtExceptionIntegration(),
        ],

        // Filter out noisy errors
        beforeSend(event, hint) {
            // Don't send errors in development
            if (config.nodeEnv !== 'production') {
                console.error('[Sentry] Would send:', event.message || hint.originalException);
                return null;
            }

            // Filter out expected errors
            const error = hint.originalException as Error | undefined;
            if (error?.message?.includes('ECONNREFUSED')) {
                return null; // Don't report connection errors
            }

            return event;
        },

        // Scrub sensitive data
        beforeSendTransaction(transaction) {
            // Remove sensitive headers
            if (transaction.request?.headers) {
                delete transaction.request.headers['authorization'];
                delete transaction.request.headers['cookie'];
            }
            return transaction;
        },
    });

    console.log('[Sentry] Initialized successfully');
}

// Export Sentry for use in error handlers
export { Sentry };

// Helper to capture errors with context
export function captureError(error: Error, context?: Record<string, unknown>): void {
    if (!dsn) return;

    if (context) {
        Sentry.withScope((scope) => {
            Object.entries(context).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
            Sentry.captureException(error);
        });
    } else {
        Sentry.captureException(error);
    }
}

// Helper to set user context
export function setUser(user: { id: string; email?: string; username?: string } | null): void {
    if (!dsn) return;
    Sentry.setUser(user);
}
