import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../lib/logger.js';
import { config } from '../config/index.js';

/**
 * Standard error codes for structured error responses
 */
export enum ErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CONFLICT = 'CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

/**
 * Custom application error with structured information
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, 400, ErrorCode.BAD_REQUEST, details);
  }

  static unauthorized(message: string = 'Authentication required'): AppError {
    return new AppError(message, 401, ErrorCode.AUTHENTICATION_ERROR);
  }

  static forbidden(message: string = 'Access denied'): AppError {
    return new AppError(message, 403, ErrorCode.AUTHORIZATION_ERROR);
  }

  static notFound(resource: string = 'Resource'): AppError {
    return new AppError(`${resource} not found`, 404, ErrorCode.NOT_FOUND);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, ErrorCode.CONFLICT);
  }

  static rateLimitExceeded(): AppError {
    return new AppError('Too many requests, please try again later', 429, ErrorCode.RATE_LIMIT_EXCEEDED);
  }

  static payloadTooLarge(message: string = 'Request payload too large'): AppError {
    return new AppError(message, 413, ErrorCode.PAYLOAD_TOO_LARGE);
  }

  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(message, 500, ErrorCode.INTERNAL_ERROR);
  }
}

/**
 * Map common error types to appropriate HTTP status codes
 */
const getStatusFromError = (err: Error): number => {
  // Handle specific error names/types
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    return 400;
  }
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return 401;
  }
  if (err.name === 'ForbiddenError') {
    return 403;
  }
  if (err.name === 'NotFoundError') {
    return 404;
  }
  
  // Handle Prisma errors
  if (err.message.includes('Record to update not found') || err.message.includes('Record to delete does not exist')) {
    return 404;
  }
  if (err.message.includes('Unique constraint failed')) {
    return 409;
  }
  
  // Handle file/upload errors
  if (err.message.includes('File too large') || err.message.includes('LIMIT_FILE_SIZE')) {
    return 413;
  }
  
  return 500;
};

/**
 * Get error code from error type
 */
const getCodeFromError = (err: Error, statusCode: number): ErrorCode => {
  if (err instanceof AppError) {
    return err.code;
  }
  
  switch (statusCode) {
    case 400:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.AUTHENTICATION_ERROR;
    case 403:
      return ErrorCode.AUTHORIZATION_ERROR;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 413:
      return ErrorCode.PAYLOAD_TOO_LARGE;
    case 429:
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
};

/**
 * Global error handler middleware with structured logging and responses
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate unique request ID for tracing
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  if (res.headersSent) {
    return next(err);
  }
  
  // Determine status code and error code
  const statusCode = err instanceof AppError ? err.statusCode : getStatusFromError(err);
  const errorCode = getCodeFromError(err, statusCode);
  
  // Build context for logging
  const logContext = {
    requestId,
    method: req.method,
    path: req.path,
    statusCode,
    errorCode,
    userId: (req as any).user?.userId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  };
  
  // Log the error with appropriate level
  if (statusCode >= 500) {
    logger.error(`Server Error: ${err.message}`, logContext, err);
  } else if (statusCode >= 400) {
    logger.warn(`Client Error: ${err.message}`, logContext, err);
  }
  
  // Build response object
  const response: {
    error: string;
    code: ErrorCode;
    requestId: string;
    details?: Record<string, unknown>;
    stack?: string;
  } = {
    error: statusCode >= 500 && config.nodeEnv !== 'development' 
      ? 'Internal server error' 
      : err.message,
    code: errorCode,
    requestId,
  };
  
  // Add details if available (from AppError)
  if (err instanceof AppError && err.details) {
    response.details = err.details;
  }
  
  // Include stack trace in development only
  if (config.nodeEnv === 'development' && err.stack) {
    response.stack = err.stack;
  }
  
  res.status(statusCode).json(response);
};
