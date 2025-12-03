import { config } from '../config/index.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (config.nodeEnv === 'development' ? 'debug' : 'info') as LogLevel;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLogEntry(entry: LogEntry): string {
  if (config.nodeEnv === 'development') {
    // Human-readable format for development
    const levelColors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';
    const color = levelColors[entry.level];
    
    let output = `${color}[${entry.level.toUpperCase()}]${reset} ${entry.timestamp} - ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ` ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack && config.nodeEnv === 'development') {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }
    
    return output;
  } else {
    // JSON format for production (easier to parse by log aggregators)
    return JSON.stringify(entry);
  }
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (context) {
    entry.context = context;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  const formatted = formatLogEntry(entry);

  switch (level) {
    case 'debug':
    case 'info':
      console.log(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>, error?: Error) => log('warn', message, context, error),
  error: (message: string, context?: Record<string, unknown>, error?: Error) => log('error', message, context, error),
  
  // Helper for logging errors with context
  logError: (message: string, error: unknown, context?: Record<string, unknown>) => {
    const err = error instanceof Error ? error : new Error(String(error));
    log('error', message, context, err);
  },
};

export default logger;
