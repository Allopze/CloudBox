import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

// Note: Request.user type is declared in auth.ts

export const authOptional = async (req: Request, res: Response, next: NextFunction) => {
  const tokenFromQuery = req.query.token as string;
  const tokenFromHeader = req.headers.authorization?.split(' ')[1];
  const token = tokenFromQuery || tokenFromHeader;

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
