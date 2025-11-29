import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'node:crypto';
import { config } from '../config/index.js';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn } as SignOptions);
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const jwtid = randomUUID(); // add unique id so tokens issued in the same second don't collide
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn, jwtid } as SignOptions);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
};

export const generateRandomToken = (): string => {
  return randomBytes(32).toString('hex');
};
