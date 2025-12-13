import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import prisma from '../lib/prisma.js';

// Note: Request.user type is declared in auth.ts

export const authOptional = async (req: Request, res: Response, next: NextFunction) => {
  // Security: Prefer Authorization header, then signed URL.
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  const signedUrlToken = req.query.sig as string | undefined;
  let headerTokenInvalid = false;
  
  // Clear tokens from query to prevent logging
  if (signedUrlToken) delete req.query.sig;

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
      // Token invalid: allow signed URL fallback, otherwise respond 401.
      headerTokenInvalid = true;
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

  if (headerTokenInvalid) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // No valid auth found, continue without user context
  next();
};
