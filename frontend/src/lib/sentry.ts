/**
 * Sentry/GlitchTip Error Tracking Configuration for Frontend
 * 
 * GlitchTip is a self-hosted, open-source alternative to Sentry.
 * Configure VITE_SENTRY_DSN in your environment or build args.
 */

import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initSentry(): void {
    if (!dsn) {
        console.log('[Sentry] DSN not configured, error tracking disabled');
        return;
    }

    Sentry.init({
        dsn,
        environment: import.meta.env.MODE,

        // Performance monitoring
        tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

        // Replay configuration (optional)
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,

        // Filter errors
        beforeSend(event, hint) {
            // Don't send errors in development
            if (!import.meta.env.PROD) {
                console.error('[Sentry] Would send:', event.message || hint.originalException);
                return null;
            }

            // Filter out browser extension errors
            const error = hint.originalException as Error | undefined;
            if (error?.stack?.includes('chrome-extension://')) {
                return null;
            }

            // Filter out network errors that are expected
            if (error?.message?.includes('Failed to fetch')) {
                return null;
            }

            return event;
        },

        // Ignore these errors
        ignoreErrors: [
            'ResizeObserver loop limit exceeded',
            'ResizeObserver loop completed with undelivered notifications',
            'Non-Error promise rejection captured',
            /^Network Error$/,
            /^AbortError$/,
        ],
    });

    console.log('[Sentry] Initialized successfully');
}

// Export Sentry for use in components
export { Sentry };

// Sentry Error Boundary component
export const SentryErrorBoundary = Sentry.ErrorBoundary;

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
