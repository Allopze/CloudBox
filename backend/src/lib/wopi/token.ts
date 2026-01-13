/**
 * WOPI Token Service
 * 
 * Generates and validates WOPI access tokens for file operations.
 * Tokens are scoped (view/edit) and time-limited.
 */

import jwt, { SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { config } from '../../config/index.js';

export type WopiScope = 'view' | 'edit';

export interface WopiTokenPayload {
    fileId: string;
    userId: string;
    userEmail: string;
    userName: string;
    scope: WopiScope;
    iat: number;
    exp: number;
}

interface TokenGenerationOptions {
    fileId: string;
    userId: string;
    userEmail: string;
    userName: string;
    scope: WopiScope;
    ttlSeconds?: number;
}

/**
 * Generate a WOPI access token
 */
export function generateWopiToken(options: TokenGenerationOptions): { token: string; ttl: number } {
    const ttl = options.ttlSeconds || config.wopi.tokenTtlSeconds;

    const payload = {
        fileId: options.fileId,
        userId: options.userId,
        userEmail: options.userEmail,
        userName: options.userName,
        scope: options.scope,
        // Add random jti for uniqueness
        jti: randomBytes(16).toString('hex'),
    };

    const token = jwt.sign(payload, config.wopi.tokenSecret, {
        expiresIn: ttl,
    } as SignOptions);

    return { token, ttl };
}

/**
 * Verify and decode a WOPI access token
 * @throws Error if token is invalid or expired
 */
export function verifyWopiToken(token: string): WopiTokenPayload {
    try {
        const payload = jwt.verify(token, config.wopi.tokenSecret) as WopiTokenPayload;
        return payload;
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new Error('WOPI token expired');
        }
        if (error instanceof jwt.JsonWebTokenError) {
            throw new Error('Invalid WOPI token');
        }
        // jsonwebtoken can throw SyntaxError when the payload isn't valid JSON
        if (error instanceof SyntaxError) {
            throw new Error('Invalid WOPI token');
        }
        throw new Error('Invalid WOPI token');
    }
}

/**
 * Check if a token has the required scope
 */
export function hasRequiredScope(payload: WopiTokenPayload, requiredScope: WopiScope): boolean {
    // 'edit' scope includes 'view' access
    if (requiredScope === 'view') {
        return payload.scope === 'view' || payload.scope === 'edit';
    }
    return payload.scope === requiredScope;
}

/**
 * Extract token from request (query param or header)
 */
export function extractTokenFromRequest(req: { query?: Record<string, unknown>; headers?: Record<string, unknown> }): string | null {
    // WOPI spec: access_token query parameter
    const queryToken = req.query?.access_token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
        return queryToken;
    }

    // Alternative: Authorization header (Bearer token)
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    return null;
}
