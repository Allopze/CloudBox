import { Request, Response, NextFunction } from 'express';
import prisma from './prisma.js';

export type AuditAction = 
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'REGISTER'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_SUCCESS'
  | 'EMAIL_VERIFIED'
  | 'FILE_UPLOAD'
  | 'FILE_DELETE'
  | 'FILE_DOWNLOAD'
  | 'FILE_SHARE'
  | 'FOLDER_CREATE'
  | 'FOLDER_DELETE'
  | 'ADMIN_USER_UPDATE'
  | 'ADMIN_USER_DELETE'
  | 'ADMIN_SETTINGS_CHANGE'
  | 'ACCOUNT_DELETE'
  | 'SUSPICIOUS_ACTIVITY';

interface AuditLogEntry {
  action: AuditAction;
  userId?: string;
  targetId?: string;
  targetType?: 'user' | 'file' | 'folder' | 'share' | 'settings';
  ipAddress: string;
  userAgent?: string;
  details?: Record<string, any>;
  success: boolean;
}

/**
 * Log security-relevant actions
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  const logData = {
    timestamp: new Date().toISOString(),
    action: entry.action,
    userId: entry.userId || 'anonymous',
    targetId: entry.targetId,
    targetType: entry.targetType,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    success: entry.success,
    details: entry.details ? JSON.stringify(entry.details) : null,
  };

  // Log to console in structured format
  console.log(JSON.stringify({
    level: entry.success ? 'info' : 'warn',
    type: 'audit',
    ...logData,
  }));

  // Store important security events in database
  // Only persist if we have a valid userId (Activity requires a valid user foreign key)
  if (shouldPersist(entry.action) && entry.userId) {
    try {
      // Verify the user exists before creating activity
      const userExists = await prisma.user.findUnique({
        where: { id: entry.userId },
        select: { id: true },
      });

      if (userExists) {
        await prisma.activity.create({
          data: {
            type: `AUDIT_${entry.action}`,
            userId: entry.userId,
            details: JSON.stringify({
              ...entry.details,
              ipAddress: entry.ipAddress,
              success: entry.success,
            }),
          },
        });
      }
    } catch (error) {
      console.error('Failed to persist audit log:', error);
    }
  }
}

/**
 * Determine if action should be persisted to database
 * Security Fix: Now persists all security-relevant events for compliance and forensics
 */
function shouldPersist(action: AuditAction): boolean {
  const persistActions: AuditAction[] = [
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'LOGOUT',
    'REGISTER',
    'PASSWORD_CHANGE',
    'PASSWORD_RESET_REQUEST',
    'PASSWORD_RESET_SUCCESS',
    'EMAIL_VERIFIED',
    'FILE_UPLOAD',
    'FILE_DELETE',
    'FILE_DOWNLOAD',
    'FILE_SHARE',
    'FOLDER_CREATE',
    'FOLDER_DELETE',
    'ADMIN_USER_UPDATE',
    'ADMIN_USER_DELETE',
    'ADMIN_SETTINGS_CHANGE',
    'ACCOUNT_DELETE',
    'SUSPICIOUS_ACTIVITY',
  ];
  return persistActions.includes(action);
}

/**
 * Get client IP address from request
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Middleware to attach audit context to request
 */
export function auditContext(req: Request, res: Response, next: NextFunction): void {
  // Attach audit helper to request
  (req as any).audit = (action: AuditAction, details?: Record<string, any>, success: boolean = true) => {
    auditLog({
      action,
      userId: req.user?.userId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details,
      success,
    });
  };
  next();
}

/**
 * Detect suspicious patterns
 */
export function detectSuspiciousActivity(req: Request): string[] {
  const warnings: string[] = [];
  const userAgent = req.headers['user-agent'] || '';
  const path = req.path.toLowerCase();
  
  // Check for common attack patterns
  if (path.includes('..')) {
    warnings.push('Path traversal attempt detected');
  }
  
  if (path.includes('<script') || path.includes('javascript:')) {
    warnings.push('XSS attempt detected in path');
  }
  
  // Check for SQL injection patterns
  const body = JSON.stringify(req.body || {});
  const sqlPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
  ];
  
  for (const pattern of sqlPatterns) {
    if (pattern.test(body) || pattern.test(req.url)) {
      warnings.push('Potential SQL injection attempt');
      break;
    }
  }
  
  // Check for known malicious user agents
  const maliciousAgents = ['sqlmap', 'nikto', 'dirbuster', 'masscan', 'nmap'];
  for (const agent of maliciousAgents) {
    if (userAgent.toLowerCase().includes(agent)) {
      warnings.push(`Known scanning tool detected: ${agent}`);
      break;
    }
  }
  
  return warnings;
}

/**
 * Middleware for suspicious activity detection
 */
export function suspiciousActivityDetector(req: Request, res: Response, next: NextFunction): void {
  const warnings = detectSuspiciousActivity(req);
  
  if (warnings.length > 0) {
    auditLog({
      action: 'SUSPICIOUS_ACTIVITY',
      userId: req.user?.userId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: {
        warnings,
        path: req.path,
        method: req.method,
      },
      success: false,
    });
    
    // For severe threats, block the request
    if (warnings.some(w => w.includes('SQL injection') || w.includes('XSS'))) {
      res.status(403).json({ error: 'Request blocked for security reasons' });
      return;
    }
  }
  
  next();
}
