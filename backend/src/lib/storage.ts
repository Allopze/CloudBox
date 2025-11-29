import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';

const STORAGE_DIRS = {
  files: 'files',
  thumbnails: 'thumbnails',
  avatars: 'avatars',
  branding: 'branding',
  chunks: 'chunks',
  temp: 'temp',
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

export const getChunkPath = (uploadId: string, chunkIndex: number): string => {
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
