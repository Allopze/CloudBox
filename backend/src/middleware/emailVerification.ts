import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';

/**
 * Middleware to require email verification for sensitive operations
 * Security: Prevents unverified users from performing certain actions
 */
export const requireEmailVerified = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { emailVerified: true, email: true },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({ 
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address to perform this action.',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Email verification check error:', error);
    res.status(500).json({ error: 'Failed to verify email status' });
  }
};

/**
 * Optional email verification check - adds warning but allows request
 * Use for non-critical operations where we want to remind users to verify
 */
export const suggestEmailVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { emailVerified: true },
      });

      if (user && !user.emailVerified) {
        // Add header to inform client that email is not verified
        res.setHeader('X-Email-Verification-Required', 'true');
      }
    }

    next();
  } catch (error) {
    // Don't block request on error, just continue
    next();
  }
};
