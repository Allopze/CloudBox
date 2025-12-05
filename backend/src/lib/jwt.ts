import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { config } from '../config/index.js';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

interface RefreshTokenPayload extends TokenPayload {
  jti: string;
  familyId: string;
}

// Security: Hash refresh tokens before storing in database
export const hashToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex');
};

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn } as SignOptions);
};

// Security: Generate refresh token with jti and familyId for rotation tracking
export const generateRefreshToken = (payload: TokenPayload, familyId?: string): { token: string; jti: string; familyId: string } => {
  const jti = randomUUID();
  const tokenFamilyId = familyId || randomUUID(); // New family for new login, same family for refresh
  
  const token = jwt.sign(
    { ...payload, familyId: tokenFamilyId },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn, jwtid: jti } as SignOptions
  );
  
  return { token, jti, familyId: tokenFamilyId };
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  return jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
};

export const generateRandomToken = (): string => {
  return randomBytes(32).toString('hex');
};

// Security: Generate signed URL token for file access
export const generateSignedUrlToken = (): string => {
  return randomBytes(32).toString('base64url');
};
