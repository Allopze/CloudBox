import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import prisma from '../lib/prisma.js';

// Note: Request.user type is declared in auth.ts

export const authOptional = async (req: Request, res: Response, next: NextFunction) => {
  // Security: Prefer Authorization header, then signed URL, deprecated query token last
  const tokenFromHeader = req.headers.authorization?.split(' ')[1];
  const signedUrlToken = req.query.sig as string;
  // Deprecated: query string tokens (only for backward compatibility during migration)
  const tokenFromQuery = req.query.token as string;
  
  // Clear tokens from query to prevent logging
  if (signedUrlToken) delete req.query.sig;
  if (tokenFromQuery) delete req.query.token;

  // Priority 1: Authorization header (preferred)
  if (tokenFromHeader) {
    try {
      const decoded = jwt.verify(tokenFromHeader, config.jwt.secret) as { userId: string; email: string; role: string };
      req.user = { 
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };
      return next();
    } catch {
      // Token invalid, continue to check other auth methods
    }
  }

  // Priority 2: Signed URL token (secure alternative to query string tokens)
  if (signedUrlToken) {
    try {
      const fileId = req.params.id;
      // Extract action from URL path (e.g., /files/:id/view -> view)
      const pathParts = req.path.split('/');
      const action = pathParts[pathParts.length - 1];

      const signedUrl = await prisma.signedUrl.findUnique({
        where: { token: signedUrlToken },
      });

      if (signedUrl && 
          signedUrl.fileId === fileId && 
          signedUrl.action === action &&
          signedUrl.expiresAt > new Date()) {
        // Valid signed URL - set user context from the signed URL
        const user = await prisma.user.findUnique({
          where: { id: signedUrl.userId },
          select: { id: true, email: true, role: true },
        });

        if (user) {
          req.user = {
            userId: user.id,
            email: user.email,
            role: user.role,
          };
          
          // Mark this request as using signed URL (for potential audit)
          (req as any).usedSignedUrl = true;
          
          return next();
        }
      }
    } catch {
      // Signed URL validation failed, continue
    }
  }

  // Priority 3: Query string token (DEPRECATED - for backward compatibility only)
  // Security warning: These tokens can be logged in server logs and browser history
  if (tokenFromQuery) {
    try {
      const decoded = jwt.verify(tokenFromQuery, config.jwt.secret) as { userId: string; email: string; role: string };
      req.user = { 
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };
      
      // Mark request as using deprecated auth method
      (req as any).usedDeprecatedQueryToken = true;
      
      return next();
    } catch {
      // Token invalid, continue without auth
    }
  }

  // No valid auth found, continue without user context
  next();
};
