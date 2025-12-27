import { Request, Response } from 'express';
import { config } from '../config/index.js';

export const FILE_ACCESS_COOKIE_NAME = 'file_access_tokens';
const MAX_FILE_ACCESS_TOKENS = 20;

export const getFileAccessTokens = (req: Request): string[] => {
  const raw = req.cookies?.[FILE_ACCESS_COOKIE_NAME];
  if (!raw || typeof raw !== 'string') return [];

  return raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
};

export const addFileAccessToken = (tokens: string[], token: string): string[] => {
  const deduped = tokens.filter((existing) => existing !== token);
  deduped.unshift(token);
  return deduped.slice(0, MAX_FILE_ACCESS_TOKENS);
};

export const setFileAccessCookie = (res: Response, tokens: string[]): void => {
  res.cookie(FILE_ACCESS_COOKIE_NAME, tokens.join(','), {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    maxAge: config.signedUrls.expiresIn * 1000,
    path: '/api/files',
  });
};
