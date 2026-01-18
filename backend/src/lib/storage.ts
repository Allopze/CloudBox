import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';

const STORAGE_DIRS = {
  files: 'files',
  thumbnails: 'thumbnails',
  avatars: 'avatars',
  branding: 'branding',
  landing: 'landing',
  chunks: 'chunks',
  temp: 'temp',
  versions: 'versions',
};

// Ensure storage path is absolute
const getAbsoluteStoragePath = (): string => {
  return path.resolve(config.storage.path);
};

export const initStorage = async (): Promise<void> => {
  const baseDir = getAbsoluteStoragePath();

  for (const dir of Object.values(STORAGE_DIRS)) {
    const fullPath = path.join(baseDir, dir);
    await fs.mkdir(fullPath, { recursive: true });
  }
};

export const getStoragePath = (type: keyof typeof STORAGE_DIRS, ...subPaths: string[]): string => {
  return path.join(getAbsoluteStoragePath(), STORAGE_DIRS[type], ...subPaths);
};

export const getUserFilePath = (userId: string, fileId: string, extension: string): string => {
  return getStoragePath('files', userId, `${fileId}${extension}`);
};

export const getThumbnailPath = (fileId: string): string => {
  return getStoragePath('thumbnails', `${fileId}.webp`);
};

export const getAvatarPath = (userId: string): string => {
  return getStoragePath('avatars', `${userId}.webp`);
};

export const getBrandingPath = (type: 'logo-light' | 'logo-dark' | 'favicon'): string => {
  const ext = type === 'favicon' ? '.ico' : '.png';
  return getStoragePath('branding', `${type}${ext}`);
};

// UUID regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidUUID = (id: string): boolean => {
  return UUID_REGEX.test(id);
};

export const getChunkPath = (uploadId: string, chunkIndex: number): string => {
  // Validate uploadId to prevent path traversal
  if (!isValidUUID(uploadId)) {
    throw new Error('Invalid upload ID');
  }
  return getStoragePath('chunks', uploadId, `chunk_${chunkIndex}`);
};

export const ensureUserDir = async (userId: string): Promise<void> => {
  const userDir = getStoragePath('files', userId);
  await fs.mkdir(userDir, { recursive: true });
};

export const deleteFile = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore if file doesn't exist
  }
};

export const deleteDirectory = async (dirPath: string): Promise<void> => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore if directory doesn't exist
  }
};

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const getFileStats = async (filePath: string) => {
  return fs.stat(filePath);
};

export const moveFile = async (source: string, destination: string): Promise<void> => {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rename(source, destination);
};

export const copyFile = async (source: string, destination: string): Promise<void> => {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
};

// SECURITY: MIME types that can execute JavaScript or active content
// These must be served as downloads to prevent stored XSS attacks
const FORCE_DOWNLOAD_MIMES = [
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
  'image/svg+xml',
  'application/x-httpd-php',
  'text/x-php',
];

export const streamFile = async (
  req: import('express').Request,
  res: import('express').Response,
  file: { path: string; mimeType: string; name: string },
  stat: import('fs').Stats,
  fileId?: string
) => {
  // SECURITY H-01: Force download for potentially active content types to prevent XSS
  if (FORCE_DOWNLOAD_MIMES.some(mime => file.mimeType.toLowerCase().includes(mime.split('/')[1]))) {
    const safeFilename = encodeURIComponent(file.name).replace(/['()]/g, escape);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
  }

  const etagBase = fileId || file.path;
  const etag = `"${etagBase}-${stat.mtimeMs}"`;

  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunkSize);
    res.setHeader('Content-Type', file.mimeType);

    const { createReadStream } = await import('fs');
    const stream = createReadStream(file.path, { start, end });

    // Handle stream errors
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      stream.destroy();
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
    });

    // Cleanup on client disconnect
    res.on('close', () => {
      stream.destroy();
    });

    stream.pipe(res);
  } else {
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendFile(file.path);
  }
};
