import sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { getThumbnailPath, fileExists } from './storage.js';

const execAsync = promisify(exec);

const THUMBNAIL_SIZE = 300;

export const generateImageThumbnail = async (inputPath: string, fileId: string): Promise<string | null> => {
  try {
    const outputPath = getThumbnailPath(fileId);
    
    await sharp(inputPath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 80 })
      .toFile(outputPath);
    
    return outputPath;
  } catch (error) {
    console.error('Error generating image thumbnail:', error);
    return null;
  }
};

export const generateVideoThumbnail = async (inputPath: string, fileId: string): Promise<string | null> => {
  try {
    const outputPath = getThumbnailPath(fileId);
    const tempPath = outputPath.replace('.webp', '_temp.jpg');
    
    // Extract frame at 1 second using ffmpeg
    await execAsync(
      `ffmpeg -i "${inputPath}" -ss 00:00:01 -vframes 1 -y "${tempPath}"`
    );
    
    // Convert to webp thumbnail
    await sharp(tempPath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 80 })
      .toFile(outputPath);
    
    await fs.unlink(tempPath).catch(() => {});
    
    return outputPath;
  } catch (error) {
    console.error('Error generating video thumbnail:', error);
    return null;
  }
};

export const generateAudioCover = async (inputPath: string, fileId: string): Promise<string | null> => {
  try {
    const outputPath = getThumbnailPath(fileId);
    const tempPath = outputPath.replace('.webp', '_temp.jpg');
    
    // Extract album art using ffmpeg
    await execAsync(
      `ffmpeg -i "${inputPath}" -an -vcodec copy -y "${tempPath}"`
    );
    
    if (await fileExists(tempPath)) {
      await sharp(tempPath)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'cover',
          position: 'center',
        })
        .webp({ quality: 80 })
        .toFile(outputPath);
      
      await fs.unlink(tempPath).catch(() => {});
      return outputPath;
    }
    
    return null;
  } catch (error) {
    // Audio might not have cover art
    return null;
  }
};

export const generateThumbnail = async (
  inputPath: string,
  fileId: string,
  mimeType: string
): Promise<string | null> => {
  if (mimeType.startsWith('image/')) {
    return generateImageThumbnail(inputPath, fileId);
  }
  
  if (mimeType.startsWith('video/')) {
    return generateVideoThumbnail(inputPath, fileId);
  }
  
  if (mimeType.startsWith('audio/')) {
    return generateAudioCover(inputPath, fileId);
  }
  
  return null;
};

export const processAvatar = async (inputPath: string, outputPath: string): Promise<void> => {
  await sharp(inputPath)
    .resize(256, 256, {
      fit: 'cover',
      position: 'center',
    })
    .webp({ quality: 90 })
    .toFile(outputPath);
};
