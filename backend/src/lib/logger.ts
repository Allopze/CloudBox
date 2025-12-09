import pino, { Logger as PinoLogger } from 'pino';
import { config } from '../config/index.js';

const isProduction = config.nodeEnv === 'production';

// Create base Pino logger with appropriate configuration
const baseLogger = pino({
  level: isProduction ? 'info' : 'debug',

  // Redact sensitive fields from logs
  redact: {
    paths: [
      'password',
      'accessToken',
      'refreshToken',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },

  // Base properties included in all logs
  base: {
    pid: process.pid,
    env: process.env.NODE_ENV || 'development',
  },

  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,

  // Production: JSON for log aggregators
  // Development: Pretty print for readability
  transport: isProduction
    ? undefined
    : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
});

// Child loggers for specific modules
export const createChildLogger = (module: string) => {
  return baseLogger.child({ module });
};

// Pre-configured child loggers
export const authLogger = createChildLogger('auth');
export const filesLogger = createChildLogger('files');
export const uploadLogger = createChildLogger('upload');
export const shareLogger = createChildLogger('share');
export const adminLogger = createChildLogger('admin');
export const jobLogger = createChildLogger('jobs');

// Request context logger (populated by middleware)
export interface RequestContext {
  requestId: string;
  userId?: string;
  method: string;
  url: string;
  ip: string;
}

export const createRequestLogger = (context: RequestContext) => {
  return baseLogger.child(context);
};

// Wrapper for backwards compatibility with old logger API
// Old API: logger.info('message', { context })
// Pino API: logger.info({ context }, 'message')
const createCompatibleLogger = (pinoLogger: PinoLogger) => {
  return {
    debug: (messageOrObj: string | object, context?: Record<string, unknown>) => {
      if (typeof messageOrObj === 'object') {
        pinoLogger.debug(messageOrObj);
      } else if (context) {
        pinoLogger.debug(context, messageOrObj);
      } else {
        pinoLogger.debug(messageOrObj);
      }
    },
    info: (messageOrObj: string | object, context?: Record<string, unknown>) => {
      if (typeof messageOrObj === 'object') {
        pinoLogger.info(messageOrObj);
      } else if (context) {
        pinoLogger.info(context, messageOrObj);
      } else {
        pinoLogger.info(messageOrObj);
      }
    },
    warn: (messageOrObj: string | object, context?: Record<string, unknown>, error?: Error) => {
      if (typeof messageOrObj === 'object') {
        pinoLogger.warn(messageOrObj);
      } else if (error) {
        pinoLogger.warn({ ...context, err: error }, messageOrObj);
      } else if (context) {
        pinoLogger.warn(context, messageOrObj);
      } else {
        pinoLogger.warn(messageOrObj);
      }
    },
    error: (messageOrObj: string | object, context?: Record<string, unknown>, error?: Error) => {
      if (typeof messageOrObj === 'object') {
        pinoLogger.error(messageOrObj);
      } else if (error) {
        pinoLogger.error({ ...context, err: error }, messageOrObj);
      } else if (context) {
        pinoLogger.error(context, messageOrObj);
      } else {
        pinoLogger.error(messageOrObj);
      }
    },

    // Helper for logging errors with context
    logError: (message: string, error: unknown, context?: Record<string, unknown>) => {
      const err = error instanceof Error ? error : new Error(String(error));
      pinoLogger.error({ ...context, err }, message);
    },

    // Access to raw pino logger for advanced usage
    pino: pinoLogger,
  };
};

// Export the compatible logger wrapper as default AND named export
export const logger = createCompatibleLogger(baseLogger);
export default logger;

// Type exports for TypeScript
export type Logger = ReturnType<typeof createCompatibleLogger>;
