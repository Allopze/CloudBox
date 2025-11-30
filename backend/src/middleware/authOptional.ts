import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

// Note: Request.user type is declared in auth.ts

export const authOptional = async (req: Request, res: Response, next: NextFunction) => {
  // Prefer Authorization header over query string for security
  // Query string tokens can be logged in server logs and browser history
  const tokenFromHeader = req.headers.authorization?.split(' ')[1];
  const tokenFromQuery = req.query.token as string;
  
  // Use header token first, fall back to query string only for download/stream endpoints
  // where Authorization header might not be available (e.g., direct browser navigation)
  const token = tokenFromHeader || tokenFromQuery;

  // Clear token from query to prevent it from being logged
  if (tokenFromQuery) {
    delete req.query.token;
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string; role: string };
    req.user = { 
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch {
    // Token invalid but continue without auth for optional auth endpoints
    next();
  }
};
