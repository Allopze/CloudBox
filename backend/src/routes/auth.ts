import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../lib/prisma.js';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  generateRandomToken,
  hashToken,
  generateSignedUrlToken,
} from '../lib/jwt.js';
import { sendWelcomeEmail, sendResetPasswordEmail } from '../lib/email.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config/index.js';
import { auditLog, getClientIP } from '../lib/audit.js';
import {
  createSession,
  invalidateSession,
  invalidateAllSessions,
  findSessionByRefreshToken,
  updateSessionRefreshToken,
  isSessionStoreAvailable,
} from '../lib/sessionStore.js';
import {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../schemas/index.js';

const router = Router();
const googleClient = new OAuth2Client(config.google.clientId);

// Security: Cookie options for refresh token
const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: config.cookies.secure,
  sameSite: config.cookies.sameSite,
  path: '/api/auth', // Restrict to auth endpoints only
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

// Security: Helper to set auth cookies
const setAuthCookies = (res: Response, refreshToken: string) => {
  res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());
};

// Security: Helper to clear auth cookies
const clearAuthCookies = (res: Response) => {
  res.clearCookie('refreshToken', { path: '/api/auth' });
};

// Security: Store refresh token with hash
const storeRefreshToken = async (
  userId: string,
  token: string,
  jti: string,
  familyId: string,
  expiresAt: Date
) => {
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(token),
      jti,
      userId,
      familyId,
      expiresAt,
    },
  });
};

// Security: Store refresh token and create Redis session
const storeRefreshTokenWithSession = async (
  userId: string,
  token: string,
  jti: string,
  familyId: string,
  expiresAt: Date,
  deviceInfo: { userAgent?: string; ip?: string }
): Promise<string | null> => {
  // Store in database (always)
  await storeRefreshToken(userId, token, jti, familyId, expiresAt);
  
  // Create Redis session for instant invalidation (if available)
  const sessionId = await createSession(userId, hashToken(token), deviceInfo);
  return sessionId;
};

// Brute force protection settings
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes

// Check if user/IP is locked out
async function checkLockout(email: string, ipAddress: string): Promise<{
  isLocked: boolean;
  remainingAttempts: number;
  lockoutEnd?: Date;
}> {
  const windowStart = new Date(Date.now() - ATTEMPT_WINDOW);

  // Check failed attempts by email
  const emailAttempts = await prisma.loginAttempt.count({
    where: {
      email: email.toLowerCase(),
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  // Check failed attempts by IP
  const ipAttempts = await prisma.loginAttempt.count({
    where: {
      ipAddress,
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  const totalAttempts = Math.max(emailAttempts, ipAttempts);
  const isLocked = totalAttempts >= MAX_LOGIN_ATTEMPTS;
  const remainingAttempts = Math.max(0, MAX_LOGIN_ATTEMPTS - totalAttempts);

  let lockoutEnd: Date | undefined;
  if (isLocked) {
    const lastAttempt = await prisma.loginAttempt.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { ipAddress },
        ],
        success: false,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (lastAttempt) {
      lockoutEnd = new Date(lastAttempt.createdAt.getTime() + LOCKOUT_DURATION);
    }
  }

  return { isLocked, remainingAttempts, lockoutEnd };
}

// Record login attempt
async function recordLoginAttempt(
  email: string,
  ipAddress: string,
  success: boolean,
  userAgent?: string
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email: email.toLowerCase(),
      ipAddress,
      success,
      userAgent,
    },
  });

  // Clean up old attempts (older than 24 hours)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.loginAttempt.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  }).catch(() => {}); // Ignore cleanup errors
}

// Get client IP address - using imported function from audit.ts

// Register
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
      return;
    }
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'ADMIN' : 'USER';

    const hashedPassword = await bcrypt.hash(password, 12);
    const verifyToken = generateRandomToken();
    const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        verifyToken,
        verifyTokenExpiry,
        storageQuota: config.storage.defaultQuota,
      },
    });

    // Send verification email
    const verifyUrl = `${config.frontendUrl}/verify-email/${verifyToken}`;
    await sendWelcomeEmail(email, name, verifyUrl).catch(console.error);

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Security: Generate refresh token with jti and familyId for rotation tracking
    const { token: refreshToken, jti, familyId } = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Security: Store hashed refresh token and create Redis session
    await storeRefreshTokenWithSession(
      user.id,
      refreshToken,
      jti,
      familyId,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      { userAgent: req.headers['user-agent'], ip: getClientIP(req) }
    );

    // Security: Set refresh token in httpOnly cookie
    setAuthCookies(res, refreshToken);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        storageQuota: user.storageQuota.toString(),
        storageUsed: user.storageUsed.toString(),
      },
      accessToken,
      // Note: refreshToken no longer returned in body, only in httpOnly cookie
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// Login
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'];

    // Check for lockout
    const lockoutStatus = await checkLockout(email, ipAddress);
    if (lockoutStatus.isLocked) {
      const retryAfter = lockoutStatus.lockoutEnd 
        ? Math.max(0, lockoutStatus.lockoutEnd.getTime() - Date.now())
        : LOCKOUT_DURATION;
      const minutesRemaining = Math.ceil(retryAfter / 60000);
      
      await auditLog({
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        details: { email, reason: 'lockout', minutesRemaining },
        success: false,
      });
      
      res.status(429).json({ 
        error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutesRemaining} minutos.`,
        code: 'TOO_MANY_ATTEMPTS',
        lockoutEnd: lockoutStatus.lockoutEnd,
        retryAfter,
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await recordLoginAttempt(email, ipAddress, false, userAgent);
      
      await auditLog({
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        details: { email, reason: 'user_not_found' },
        success: false,
      });
      
      res.status(401).json({ 
        error: 'Email o contraseña incorrectos.',
        code: 'INVALID_CREDENTIALS',
        remainingAttempts: lockoutStatus.remainingAttempts - 1,
      });
      return;
    }

    if (!user.password) {
      // User exists but registered with Google OAuth
      // Security: Use generic error message to prevent user enumeration
      await recordLoginAttempt(email, ipAddress, false, userAgent);
      
      await auditLog({
        action: 'LOGIN_FAILED',
        userId: user.id,
        ipAddress,
        userAgent,
        details: { email, reason: 'oauth_account_password_login' },
        success: false,
      });
      
      res.status(401).json({ 
        error: 'Email o contraseña incorrectos.',
        code: 'INVALID_CREDENTIALS',
        remainingAttempts: lockoutStatus.remainingAttempts - 1,
      });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      await recordLoginAttempt(email, ipAddress, false, userAgent);
      const newLockoutStatus = await checkLockout(email, ipAddress);
      
      await auditLog({
        action: 'LOGIN_FAILED',
        userId: user.id,
        ipAddress,
        userAgent,
        details: { email, reason: 'invalid_password' },
        success: false,
      });
      
      res.status(401).json({ 
        error: 'Email o contraseña incorrectos.',
        code: 'INVALID_CREDENTIALS',
        remainingAttempts: newLockoutStatus.remainingAttempts,
      });
      return;
    }

    // Successful login - record it
    await recordLoginAttempt(email, ipAddress, true, userAgent);
    
    await auditLog({
      action: 'LOGIN_SUCCESS',
      userId: user.id,
      ipAddress,
      userAgent,
      details: { email },
      success: true,
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Security: Generate refresh token with jti and familyId for rotation tracking
    const { token: refreshToken, jti, familyId } = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Security: Store hashed refresh token and create Redis session
    await storeRefreshTokenWithSession(
      user.id,
      refreshToken,
      jti,
      familyId,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      { userAgent, ip: ipAddress }
    );

    // Security: Set refresh token in httpOnly cookie
    setAuthCookies(res, refreshToken);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        storageQuota: user.storageQuota.toString(),
        storageUsed: user.storageUsed.toString(),
      },
      accessToken,
      // Note: refreshToken no longer returned in body, only in httpOnly cookie
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Google OAuth
router.post('/google', validate(googleAuthSchema), async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: config.google.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Invalid Google token' });
      return;
    }

    let user = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
          googleId: payload.sub,
          emailVerified: true,
          storageQuota: config.storage.defaultQuota,
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, emailVerified: true },
      });
    }

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Security: Generate refresh token with jti and familyId for rotation tracking
    const { token: refreshToken, jti, familyId } = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Security: Store hashed refresh token and create Redis session
    await storeRefreshTokenWithSession(
      user.id,
      refreshToken,
      jti,
      familyId,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      { userAgent: req.headers['user-agent'], ip: getClientIP(req) }
    );

    // Security: Set refresh token in httpOnly cookie
    setAuthCookies(res, refreshToken);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        storageQuota: user.storageQuota.toString(),
        storageUsed: user.storageUsed.toString(),
      },
      accessToken,
      // Note: refreshToken no longer returned in body, only in httpOnly cookie
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Failed to authenticate with Google' });
  }
});

// Refresh token - Security: Now reads from httpOnly cookie and implements token rotation with family tracking
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Security: Read refresh token from httpOnly cookie (preferred) or body (for migration)
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      clearAuthCookies(res);
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const tokenHash = hashToken(refreshToken);
    
    // Security: Look up by jti (more secure than full token comparison)
    const storedToken = await prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    });

    // Security: Token reuse detection - if token was already used/revoked, invalidate entire family
    if (!storedToken || storedToken.revokedAt) {
      if (storedToken?.familyId) {
        // Potential token theft! Revoke all tokens in this family
        await prisma.refreshToken.updateMany({
          where: { familyId: storedToken.familyId },
          data: { revokedAt: new Date() },
        });
        
        await auditLog({
          action: 'SECURITY_ALERT',
          userId: storedToken.userId,
          ipAddress: getClientIP(req),
          userAgent: req.headers['user-agent'],
          details: { reason: 'refresh_token_reuse', familyId: storedToken.familyId },
          success: false,
        });
      }
      
      clearAuthCookies(res);
      res.status(401).json({ error: 'Token has been revoked. Please login again.' });
      return;
    }

    // Verify token hash matches
    if (storedToken.tokenHash !== tokenHash) {
      clearAuthCookies(res);
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    if (storedToken.expiresAt < new Date()) {
      clearAuthCookies(res);
      res.status(401).json({ error: 'Refresh token expired' });
      return;
    }

    // Security: Validate session in Redis (if available) for instant invalidation support
    if (isSessionStoreAvailable()) {
      const session = await findSessionByRefreshToken(storedToken.user.id, tokenHash);
      if (!session) {
        // Session was invalidated (e.g., via logout from all devices)
        clearAuthCookies(res);
        res.status(401).json({ error: 'Session invalidated. Please login again.' });
        return;
      }
    }

    // Security: Revoke old token (mark as used, don't delete for audit trail)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const newAccessToken = generateAccessToken({
      userId: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    });

    // Security: Generate new refresh token in same family (for rotation tracking)
    const { token: newRefreshToken, jti: newJti, familyId } = generateRefreshToken(
      {
        userId: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
      },
      storedToken.familyId || undefined // Keep same family for rotation detection
    );

    // Security: Store new hashed refresh token
    await storeRefreshToken(
      storedToken.user.id,
      newRefreshToken,
      newJti,
      familyId,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );

    // Security: Update Redis session with new refresh token hash
    if (isSessionStoreAvailable()) {
      const session = await findSessionByRefreshToken(storedToken.user.id, tokenHash);
      if (session) {
        await updateSessionRefreshToken(
          storedToken.user.id, 
          session.sessionId, 
          hashToken(newRefreshToken)
        );
      }
    }

    // Security: Set new refresh token in httpOnly cookie
    setAuthCookies(res, newRefreshToken);

    res.json({
      accessToken: newAccessToken,
      // Note: refreshToken no longer returned in body, only in httpOnly cookie
    });
  } catch (error) {
    console.error('Refresh error:', error);
    clearAuthCookies(res);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Logout - Security: Now also clears httpOnly cookie and Redis session
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    // Security: Read from cookie or body for backward compatibility
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    const userId = req.user!.userId;

    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        const tokenHash = hashToken(refreshToken);
        
        // Revoke entire token family on logout
        if (payload.familyId) {
          await prisma.refreshToken.updateMany({
            where: { familyId: payload.familyId },
            data: { revokedAt: new Date() },
          });
        }
        
        // Invalidate Redis session for this token
        if (isSessionStoreAvailable()) {
          const session = await findSessionByRefreshToken(userId, tokenHash);
          if (session) {
            await invalidateSession(userId, session.sessionId);
          }
        }
      } catch {
        // Token invalid, just continue with logout
      }
    }

    // Security: Clear httpOnly cookie
    clearAuthCookies(res);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// Forgot password
router.post('/forgot-password', validate(forgotPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Return success even if user doesn't exist for security
      res.json({ message: 'If an account exists, a reset email has been sent' });
      return;
    }

    const resetToken = generateRandomToken();
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    const resetUrl = `${config.frontendUrl}/reset-password/${resetToken}`;
    await sendResetPasswordEmail(email, user.name, resetUrl);

    res.json({ message: 'If an account exists, a reset email has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// Reset password
router.post('/reset-password', validate(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 12);

    // Issue #5: Use transaction to atomically verify and invalidate token
    const result = await prisma.$transaction(async (tx) => {
      // Find and immediately invalidate the token in one operation
      const user = await tx.user.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: { gt: new Date() },
        },
      });

      if (!user) {
        return null;
      }

      // Update password and invalidate token atomically
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });

      // Invalidate all refresh tokens
      await tx.refreshToken.deleteMany({
        where: { userId: user.id },
      });

      return user;
    });

    if (!result) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    // Invalidate all Redis sessions for this user (instant logout from all devices)
    if (isSessionStoreAvailable()) {
      await invalidateAllSessions(result.id);
    }

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Verify email
router.get('/verify-email/:token', validate(verifyEmailSchema), async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired verification token' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verifyToken: null,
        verifyTokenExpiry: null,
      },
    });

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// Get user's active sessions (requires Redis session store)
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    if (!isSessionStoreAvailable()) {
      res.json({ 
        sessions: [],
        message: 'Session tracking not available (Redis required)',
      });
      return;
    }
    
    // Import getUserSessions dynamically to avoid circular dependency issues
    const { getUserSessions } = await import('../lib/sessionStore.js');
    const sessions = await getUserSessions(userId);
    
    // Mark the current session
    const currentTokenHash = req.cookies.refreshToken 
      ? hashToken(req.cookies.refreshToken) 
      : null;
    
    const sessionsWithCurrent = sessions.map(session => ({
      ...session,
      isCurrent: session.refreshToken === currentTokenHash,
      refreshToken: undefined, // Don't expose the hash
    }));
    
    res.json({ sessions: sessionsWithCurrent });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Logout from a specific session
router.delete('/sessions/:sessionId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { sessionId } = req.params;
    
    if (!isSessionStoreAvailable()) {
      res.status(400).json({ error: 'Session management not available (Redis required)' });
      return;
    }
    
    const success = await invalidateSession(userId, sessionId);
    
    if (success) {
      res.json({ message: 'Session terminated successfully' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Terminate session error:', error);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

// Logout from all sessions (except current)
router.post('/sessions/logout-all', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    // Invalidate all database tokens
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    
    // Invalidate all Redis sessions
    if (isSessionStoreAvailable()) {
      const count = await invalidateAllSessions(userId);
      res.json({ 
        message: 'All sessions terminated successfully',
        terminatedCount: count,
      });
    } else {
      res.json({ 
        message: 'Database tokens invalidated, but instant session termination not available (Redis required)',
      });
    }
  } catch (error) {
    console.error('Logout all sessions error:', error);
    res.status(500).json({ error: 'Failed to logout from all sessions' });
  }
});

// Check email exists - REMOVED for security (Issue #4: prevents user enumeration)
// If you need this functionality, implement it with rate limiting and CAPTCHA
// router.get('/check-email', ...) - DISABLED

export default router;
