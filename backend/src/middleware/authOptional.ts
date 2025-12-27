import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import prisma from '../lib/prisma.js';
import { getFileAccessTokens } from '../lib/fileAccessCookies.js';
import { isEmailVerificationRequired, shouldEnforceEmailVerification } from './emailVerification.js';

// Note: Request.user type is declared in auth.ts

export const authOptional = async (req: Request, res: Response, next: NextFunction) => {
  // Security: Prefer Authorization header, then signed URL cookie.
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  const fileAccessTokens = getFileAccessTokens(req);
  let headerTokenInvalid = false;

  // Clear tokens from query to prevent logging (legacy clients)
  if (req.query.sig) delete req.query.sig;

  // Priority 1: Authorization header (preferred)
  if (tokenFromHeader) {
    try {
      const decoded = jwt.verify(tokenFromHeader, config.jwt.secret) as { userId: string; email: string; role: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, emailVerified: true, createdAt: true },
      });

      if (!user) {
        headerTokenInvalid = true;
      } else {
        if (shouldEnforceEmailVerification(req) && isEmailVerificationRequired(user)) {
          res.status(403).json({
            error: 'Email verification required',
            code: 'EMAIL_NOT_VERIFIED',
          });
          return;
        }

        req.user = {
          userId: user.id,
          email: user.email,
          role: user.role,
        };
        return next();
      }
    } catch {
      // Token invalid: allow signed URL fallback, otherwise respond 401.
      headerTokenInvalid = true;
    }
  }

  // Priority 2: Signed URL token from cookie
  if (fileAccessTokens.length > 0) {
    try {
      const fileId = req.params.id;
      // Extract action from URL path (e.g., /files/:id/view -> view)
      const pathParts = req.path.split('/').filter(Boolean);
      const action = pathParts[pathParts.length - 1];

      const signedUrl = await prisma.signedUrl.findFirst({
        where: {
          token: { in: fileAccessTokens },
          fileId,
          action,
          expiresAt: { gt: new Date() },
        },
      });

      if (signedUrl) {
        // Valid signed URL - set user context from the signed URL
        const user = await prisma.user.findUnique({
          where: { id: signedUrl.userId },
          select: { id: true, email: true, role: true, emailVerified: true, createdAt: true },
        });

        if (user) {
          if (shouldEnforceEmailVerification(req) && isEmailVerificationRequired(user)) {
            res.status(403).json({
              error: 'Email verification required',
              code: 'EMAIL_NOT_VERIFIED',
            });
            return;
          }

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
