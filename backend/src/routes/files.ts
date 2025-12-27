import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma, { updateParentFolderSizes } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { authOptional } from '../middleware/authOptional.js';
import { uploadFile, uploadChunk, decodeFilename } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  renameFileSchema,
  moveFileSchema,
  uploadFilesSchema,
  uploadWithFoldersSchema,
  uploadInitSchema,
  uploadChunkSchema,
  fileIdParamSchema,
  fileAccessSchema,
  parseRangeHeader,
  UPLOAD_LIMITS,
  UPLOAD_ERROR_CODES,
} from '../schemas/index.js';
import {
  getUserFilePath,
  ensureUserDir,
  deleteFile,
  fileExists,
  getStoragePath,
  moveFile as moveFileStorage,
  getChunkPath,
  deleteDirectory,
  streamFile,
  isValidUUID,
} from '../lib/storage.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { thumbnailQueue } from '../lib/thumbnailQueue.js';
import { config } from '../config/index.js';
import { sanitizeFilename, validateMimeType, isDangerousExtension, checkUserRateLimitDistributed } from '../lib/security.js';
import { auditLog } from '../lib/audit.js';
import { addFileAccessToken, getFileAccessTokens, setFileAccessCookie } from '../lib/fileAccessCookies.js';
import logger from '../lib/logger.js';
import ExcelJS from 'exceljs';
import * as cache from '../lib/cache.js';
import { getGlobalUploadMaxFileSize } from '../lib/limits.js';
import { addTranscodingJob, getTranscodingJobStatus } from '../lib/transcodingQueue.js';

const router = Router();

async function decrementTempStorageSafely(userId: string, amount: bigint): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "users"
      SET "tempStorage" = GREATEST("tempStorage" - ${amount}, 0)
      WHERE "id" = ${userId}::uuid
    `;
  } catch (error) {
    logger.warn('Failed to decrement tempStorage', { userId }, error instanceof Error ? error : undefined);
  }
}

// Helper function to cleanup chunks + reservation on failure
async function cleanupChunks(uploadId: string, userId: string): Promise<void> {
  try {
    const session = await prisma.uploadSession.findUnique({
      where: { id: uploadId },
      select: { userId: true, totalSize: true, status: true },
    });

    // Never allow a user to affect another user's reservation
    if (session && session.userId !== userId) {
      logger.warn('Refusing to cleanup upload session for different user', { uploadId, userId });
      return;
    }

    // Delete chunk records from database
    await prisma.fileChunk.deleteMany({ where: { uploadId } }).catch(() => { });

    // Delete chunk directory
    await deleteDirectory(getStoragePath('chunks', uploadId));

    // Release reserved tempStorage only if we had a matching, incomplete session
    if (session && session.status !== 'COMPLETED') {
      await decrementTempStorageSafely(userId, session.totalSize);
    }

    // Remove the upload session (keep completed sessions for idempotency)
    if (!session || session.status !== 'COMPLETED') {
      await prisma.uploadSession.delete({ where: { id: uploadId } }).catch(() => { });
    }

    logger.info('Cleaned up failed upload chunks', { uploadId, userId });
  } catch (error) {
    logger.error('Failed to cleanup chunks', { uploadId, userId }, error instanceof Error ? error : undefined);
  }
}

// Helper function to validate folderId belongs to user
async function validateFolderOwnership(folderId: string | null, userId: string): Promise<boolean> {
  if (!folderId) return true;

  // Validate UUID format
  if (!isValidUUID(folderId)) {
    return false;
  }

  const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } });
  return !!folder;
}

async function getOrCreateFolderPath(
  folderPath: string,
  baseFolderId: string | null,
  userId: string,
  tx: typeof prisma
): Promise<string | null> {
  const normalized = folderPath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (normalized.length === 0) return baseFolderId;

  let currentParentId: string | null = baseFolderId;

  for (const folderName of normalized) {
    const sanitizedFolderName = sanitizeFilename(folderName);

    // Exclude trashed folders
    let folder = await tx.folder.findFirst({
      where: {
        name: sanitizedFolderName,
        parentId: currentParentId,
        userId,
        isTrash: false,
      },
    });

    if (!folder) {
      try {
        folder = await tx.folder.create({
          data: {
            name: sanitizedFolderName,
            parentId: currentParentId,
            userId,
          },
        });
      } catch (createError: any) {
        // If unique constraint violation (P2002), folder was created by another concurrent request
        if (createError.code === 'P2002') {
          folder = await tx.folder.findFirst({
            where: {
              name: sanitizedFolderName,
              parentId: currentParentId,
              userId,
              isTrash: false,
            },
          });
          if (!folder) {
            throw createError;
          }
        } else {
          throw createError;
        }
      }
    }

    currentParentId = folder.id;
  }

  return currentParentId;
}

// Upload single/multiple files
router.post('/upload', authenticate, uploadFile.array('files', UPLOAD_LIMITS.MAX_FILES_PER_REQUEST), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const folderId = req.body.folderId || null;
    const files = req.files as Express.Multer.File[];
    const globalMaxFileSize = await getGlobalUploadMaxFileSize();

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded', code: UPLOAD_ERROR_CODES.INVALID_CHUNK });
      return;
    }

    // Validate file count limit
    if (files.length > UPLOAD_LIMITS.MAX_FILES_PER_REQUEST) {
      res.status(400).json({
        error: `Maximum ${UPLOAD_LIMITS.MAX_FILES_PER_REQUEST} files allowed per request`,
        code: UPLOAD_ERROR_CODES.MAX_FILES_EXCEEDED,
      });
      return;
    }

    // Validate folderId format and ownership
    if (folderId && !isValidUUID(folderId)) {
      res.status(400).json({ error: 'Invalid folder ID format', code: UPLOAD_ERROR_CODES.INVALID_FOLDER });
      return;
    }

    // Rate limiting per user for uploads
    const rateLimit = await checkUserRateLimitDistributed(userId, 300, 60000); // 300 uploads per minute
    if (!rateLimit.allowed) {
      await auditLog({
        action: 'FILE_UPLOAD',
        userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'],
        details: { reason: 'rate_limit', blocked: true },
        success: false,
      });
      res.status(429).json({ error: 'Too many uploads. Please wait a moment.', code: UPLOAD_ERROR_CODES.RATE_LIMIT_EXCEEDED });
      return;
    }

    // Validate folderId belongs to user
    if (folderId) {
      if (!await validateFolderOwnership(folderId, userId)) {
        res.status(404).json({ error: 'Folder not found', code: UPLOAD_ERROR_CODES.INVALID_FOLDER });
        return;
      }
    }

    // Track files that need thumbnails generated after transaction
    // Security: Include userId for per-user rate limiting in thumbnail queue
    const filesToGenerateThumbnails: { fileId: string; filePath: string; mimeType: string; userId: string }[] = [];

    const uploadedFiles = await prisma.$transaction(async (tx) => {
      // Check quota inside transaction
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const totalSize = files.reduce((sum: number, file: Express.Multer.File) => sum + file.size, 0);
      const remainingQuota = Number(user.storageQuota) - Number(user.storageUsed) - Number(user.tempStorage || 0);

      if (totalSize > remainingQuota) {
        throw new Error('Storage quota exceeded');
      }

      // Check max file size and total request size
      const maxFileSize = Math.min(Number(user.maxFileSize), globalMaxFileSize);
      const maxTotalRequestSize = maxFileSize * UPLOAD_LIMITS.MAX_FILES_PER_REQUEST;
      if (totalSize > maxTotalRequestSize) {
        throw new Error(`Total upload size exceeds maximum limit of ${maxTotalRequestSize} bytes`);
      }

      for (const file of files) {
        if (file.size > maxFileSize) {
          const maxSizeMB = Math.round(maxFileSize / 1024 / 1024);
          throw new Error(`File ${decodeFilename(file.originalname)} exceeds maximum size limit of ${maxSizeMB}MB`);
        }
      }

      await ensureUserDir(userId);

      const resultFiles = [];

      for (const file of files) {
        // Sanitize filename and validate MIME type
        const rawName = decodeFilename(file.originalname);
        const originalName = sanitizeFilename(rawName);
        const ext = path.extname(originalName);

        // Check for dangerous extensions
        if (isDangerousExtension(originalName)) {
          await auditLog({
            action: 'SUSPICIOUS_ACTIVITY',
            userId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'],
            details: { filename: rawName, reason: 'dangerous_extension' },
            success: false,
          });
          throw new Error(`File type not allowed: ${originalName}`);
        }

        // Validate MIME type
        if (!validateMimeType(file.mimetype, originalName)) {
          await auditLog({
            action: 'SUSPICIOUS_ACTIVITY',
            userId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'],
            details: { filename: rawName, mimeType: file.mimetype, reason: 'mime_mismatch' },
            success: false,
          });
          throw new Error(`Invalid file type: ${originalName}`);
        }

        const fileId = uuidv4();
        const filePath = getUserFilePath(userId, fileId, ext);

        await moveFileStorage(file.path, filePath);

        // Queue thumbnail generation for after transaction (with userId for rate limiting)
        filesToGenerateThumbnails.push({ fileId, filePath, mimeType: file.mimetype, userId });

        const dbFile = await tx.file.create({
          data: {
            id: fileId,
            name: originalName,
            originalName: originalName,
            mimeType: file.mimetype,
            size: BigInt(file.size),
            path: filePath,
            thumbnailPath: null,
            folderId: folderId || null,
            userId,
          },
        });

        // Update storage used
        await tx.user.update({
          where: { id: userId },
          data: { storageUsed: { increment: file.size } },
        });

        // Update folder sizes
        await updateParentFolderSizes(folderId, file.size, tx, 'increment');

        // Log activity
        await tx.activity.create({
          data: {
            type: 'UPLOAD',
            userId,
            fileId: dbFile.id,
            details: JSON.stringify({ name: originalName, size: file.size }),
          },
        });

        resultFiles.push({
          ...dbFile,
          size: dbFile.size.toString(),
        });
      }

      return resultFiles;
    });

    // Queue thumbnails for async generation (fire and forget)
    if (filesToGenerateThumbnails.length > 0) {
      thumbnailQueue.addBatch(filesToGenerateThumbnails);
    }

    // Audit log successful upload
    await auditLog({
      action: 'FILE_UPLOAD',
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: { count: uploadedFiles.length, totalSize: files.reduce((sum, f) => sum + f.size, 0) },
      success: true,
    });

    // Invalidate cache after file upload
    await cache.invalidateAfterFileChange(userId);

    res.status(201).json(uploadedFiles);
  } catch (error: any) {
    // Clean up temp files on any error
    const files = req.files as Express.Multer.File[] | undefined;
    if (files && Array.isArray(files)) {
      for (const file of files) {
        // file.path is the temporary path from multer
        await deleteFile(file.path);
      }
    }

    logger.error('Upload error', { userId: req.user?.userId, error: error.message }, error instanceof Error ? error : undefined);
    const message = error.message || 'Failed to upload files';

    if (message === 'Storage quota exceeded') {
      res.status(400).json({ error: message, code: UPLOAD_ERROR_CODES.QUOTA_EXCEEDED });
      return;
    }

    if (message === 'File exceeds maximum size limit' || message.includes('exceeds maximum size limit') || message.includes('exceeds maximum limit')) {
      res.status(400).json({ error: message, code: UPLOAD_ERROR_CODES.FILE_TOO_LARGE });
      return;
    }

    if (message.includes('File type not allowed')) {
      res.status(400).json({ error: message, code: UPLOAD_ERROR_CODES.DANGEROUS_EXTENSION });
      return;
    }

    if (message.includes('Invalid file type')) {
      res.status(400).json({ error: message, code: UPLOAD_ERROR_CODES.INVALID_FILE_TYPE });
      return;
    }

    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Upload files with folder structure (drag & drop folders)
router.post('/upload-with-folders', authenticate, uploadFile.array('files', UPLOAD_LIMITS.MAX_FILES_FOLDER_UPLOAD), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const baseFolderId = req.body.folderId || null;
    const paths = req.body.paths; // Array of relative paths like "folder/subfolder/file.txt"
    const files = req.files as Express.Multer.File[];
    const globalMaxFileSize = await getGlobalUploadMaxFileSize();

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded', code: UPLOAD_ERROR_CODES.INVALID_CHUNK });
      return;
    }

    // Validate file count limit
    if (files.length > UPLOAD_LIMITS.MAX_FILES_FOLDER_UPLOAD) {
      res.status(400).json({
        error: `Maximum ${UPLOAD_LIMITS.MAX_FILES_FOLDER_UPLOAD} files allowed per folder upload`,
        code: UPLOAD_ERROR_CODES.MAX_FILES_EXCEEDED,
      });
      return;
    }

    // Validate baseFolderId format
    if (baseFolderId && !isValidUUID(baseFolderId)) {
      res.status(400).json({ error: 'Invalid folder ID format', code: UPLOAD_ERROR_CODES.INVALID_FOLDER });
      return;
    }

    // Rate limiting per user for uploads
    const rateLimit = await checkUserRateLimitDistributed(userId, 300, 60000); // 300 uploads per minute for folder uploads
    if (!rateLimit.allowed) {
      await auditLog({
        action: 'FILE_UPLOAD',
        userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'],
        details: { reason: 'rate_limit', blocked: true },
        success: false,
      });
      res.status(429).json({ error: 'Too many uploads. Please wait a moment.', code: UPLOAD_ERROR_CODES.RATE_LIMIT_EXCEEDED });
      return;
    }

    // Validate baseFolderId belongs to user
    if (baseFolderId) {
      if (!await validateFolderOwnership(baseFolderId, userId)) {
        res.status(404).json({ error: 'Folder not found', code: UPLOAD_ERROR_CODES.INVALID_FOLDER });
        return;
      }
    }

    // Normalize paths to array
    const relativePaths: string[] = Array.isArray(paths) ? paths : (paths ? [paths] : []);

    // Track files that need thumbnails generated after transaction
    // Security: Include userId for per-user rate limiting in thumbnail queue
    const filesToGenerateThumbnails: { fileId: string; filePath: string; mimeType: string; userId: string }[] = [];

    const uploadedFiles = await prisma.$transaction(async (tx) => {
      // Check quota inside transaction
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const totalSize = files.reduce((sum: number, file: Express.Multer.File) => sum + file.size, 0);
      const remainingQuota = Number(user.storageQuota) - Number(user.storageUsed) - Number(user.tempStorage || 0);

      const maxFileSize = Math.min(Number(user.maxFileSize), globalMaxFileSize);
      const maxTotalRequestSize = maxFileSize * UPLOAD_LIMITS.MAX_FILES_FOLDER_UPLOAD;
      if (totalSize > maxTotalRequestSize) {
        throw new Error(`Total upload size exceeds maximum limit of ${maxTotalRequestSize} bytes`);
      }

      for (const file of files) {
        if (file.size > maxFileSize) {
          const maxSizeMB = Math.round(maxFileSize / 1024 / 1024);
          throw new Error(`File ${decodeFilename(file.originalname)} exceeds maximum size limit of ${maxSizeMB}MB`);
        }
      }

      if (totalSize > remainingQuota) {
        throw new Error('Storage quota exceeded');
      }

      await ensureUserDir(userId);

      // Cache for created folders: path -> folderId
      const folderCache = new Map<string, string>();

      // Helper to get or create folder by path
      const getOrCreateFolder = async (folderPath: string, parentId: string | null): Promise<string> => {
        if (!folderPath) return parentId || '';

        const cacheKey = `${parentId || 'root'}:${folderPath}`;
        if (folderCache.has(cacheKey)) {
          return folderCache.get(cacheKey)!;
        }

        const parts = folderPath.split('/').filter(Boolean);
        let currentParentId = parentId;

        for (const folderName of parts) {
          // Sanitize folder name
          const sanitizedFolderName = sanitizeFilename(folderName);
          const partCacheKey = `${currentParentId || 'root'}:${sanitizedFolderName}`;

          if (folderCache.has(partCacheKey)) {
            currentParentId = folderCache.get(partCacheKey)!;
            continue;
          }

          // Check if folder exists (exclude trashed folders)
          // Use a retry mechanism to handle race conditions with concurrent uploads
          let folder = await tx.folder.findFirst({
            where: {
              name: sanitizedFolderName,
              parentId: currentParentId,
              userId,
              isTrash: false,
            },
          });

          if (!folder) {
            try {
              // Try to create the folder
              folder = await tx.folder.create({
                data: {
                  name: sanitizedFolderName,
                  parentId: currentParentId,
                  userId,
                },
              });
            } catch (createError: any) {
              // If unique constraint violation (P2002), folder was created by another concurrent request
              // Retry findFirst to get the existing folder
              if (createError.code === 'P2002') {
                folder = await tx.folder.findFirst({
                  where: {
                    name: sanitizedFolderName,
                    parentId: currentParentId,
                    userId,
                    isTrash: false,
                  },
                });
                if (!folder) {
                  // This shouldn't happen, but if it does, re-throw the error
                  throw createError;
                }
              } else {
                throw createError;
              }
            }
          }

          folderCache.set(partCacheKey, folder.id);
          currentParentId = folder.id;
        }

        folderCache.set(cacheKey, currentParentId!);
        return currentParentId!;
      };

      const resultFiles = [];
      let accumulatedSize = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const decodedOriginalname = decodeFilename(file.originalname);
        const relativePath = decodeFilename(relativePaths[i] || decodedOriginalname);

        // Parse folder path from relative path
        const pathParts = relativePath.split('/');
        const rawFileName = pathParts.pop() || decodedOriginalname;
        const fileName = sanitizeFilename(rawFileName);
        const folderPath = pathParts.join('/');

        // Check for dangerous extensions
        if (isDangerousExtension(fileName)) {
          await auditLog({
            action: 'SUSPICIOUS_ACTIVITY',
            userId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'],
            details: { filename: rawFileName, reason: 'dangerous_extension' },
            success: false,
          });
          await deleteFile(file.path).catch(() => { });
          continue; // Skip dangerous files silently
        }

        // Validate MIME type
        if (!validateMimeType(file.mimetype, fileName)) {
          await auditLog({
            action: 'SUSPICIOUS_ACTIVITY',
            userId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'],
            details: { filename: rawFileName, mimeType: file.mimetype, reason: 'mime_mismatch' },
            success: false,
          });
          await deleteFile(file.path).catch(() => { });
          continue; // Skip invalid files
        }

        // Get or create the target folder
        let targetFolderId: string | null = baseFolderId;
        if (folderPath) {
          targetFolderId = await getOrCreateFolder(folderPath, baseFolderId);
        }

        const fileId = uuidv4();
        const ext = path.extname(fileName);
        const filePath = getUserFilePath(userId, fileId, ext);

        await moveFileStorage(file.path, filePath);

        // Queue thumbnail generation for after transaction (with userId for rate limiting)
        filesToGenerateThumbnails.push({ fileId, filePath, mimeType: file.mimetype, userId });

        const dbFile = await tx.file.create({
          data: {
            id: fileId,
            name: fileName,
            originalName: fileName,
            mimeType: file.mimetype,
            size: BigInt(file.size),
            path: filePath,
            thumbnailPath: null,
            folderId: targetFolderId || null,
            userId,
          },
        });

        await updateParentFolderSizes(targetFolderId, file.size, tx, 'increment');

        accumulatedSize += file.size;

        resultFiles.push({
          ...dbFile,
          size: dbFile.size.toString(),
        });
      }

      // Update storage used once at the end
      await tx.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: accumulatedSize } },
      });

      return resultFiles;
    });

    // Queue thumbnails for async generation (fire and forget)
    if (filesToGenerateThumbnails.length > 0) {
      thumbnailQueue.addBatch(filesToGenerateThumbnails);
    }

    // Audit log
    await auditLog({
      action: 'FILE_UPLOAD',
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: { count: uploadedFiles.length, withFolders: true },
      success: true,
    });

    // Invalidate cache after file upload
    await cache.invalidateAfterFileChange(userId);
    await cache.invalidateFolders(userId);

    res.status(201).json(uploadedFiles);
  } catch (error: any) {
    // Clean up temp files
    const files = req.files as Express.Multer.File[] | undefined;
    if (files && Array.isArray(files)) {
      for (const file of files) {
        await deleteFile(file.path);
      }
    }

    logger.error('Upload with folders error', { userId: req.user?.userId, error: error.message }, error instanceof Error ? error : undefined);
    if (error.message === 'Storage quota exceeded') {
      res.status(400).json({ error: error.message, code: UPLOAD_ERROR_CODES.QUOTA_EXCEEDED });
      return;
    }

    if (error.message === 'File exceeds maximum size limit' || error.message.includes('exceeds maximum size limit') || error.message.includes('exceeds maximum limit')) {
      res.status(400).json({ error: error.message, code: UPLOAD_ERROR_CODES.FILE_TOO_LARGE });
      return;
    }

    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Pre-validation endpoint for checking files before upload
router.post('/upload/validate', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { files, folderId } = req.body as {
      files: Array<{ name: string; size: number; type?: string }>;
      folderId?: string | null;
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'No files to validate' });
      return;
    }

    // Validate folderId if provided
    if (folderId && !isValidUUID(folderId)) {
      res.status(400).json({ error: 'Invalid folder ID format', code: UPLOAD_ERROR_CODES.INVALID_FOLDER });
      return;
    }

    if (folderId) {
      if (!await validateFolderOwnership(folderId, userId)) {
        res.status(404).json({ error: 'Folder not found', code: UPLOAD_ERROR_CODES.INVALID_FOLDER });
        return;
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const remainingQuota = Number(user.storageQuota) - Number(user.storageUsed) - Number(user.tempStorage || 0);
    const maxFileSize = Math.min(Number(user.maxFileSize), await getGlobalUploadMaxFileSize());

    const validationResults: Array<{
      name: string;
      valid: boolean;
      error?: string;
      errorCode?: string;
    }> = [];

    let totalSize = 0;

    for (const file of files) {
      const sanitizedName = sanitizeFilename(file.name);

      // Check dangerous extensions
      if (isDangerousExtension(sanitizedName)) {
        validationResults.push({
          name: file.name,
          valid: false,
          error: 'File type not allowed',
          errorCode: UPLOAD_ERROR_CODES.DANGEROUS_EXTENSION,
        });
        continue;
      }

      // Check file size limit
      if (file.size > maxFileSize) {
        const maxSizeMB = Math.round(maxFileSize / 1024 / 1024);
        validationResults.push({
          name: file.name,
          valid: false,
          error: `File exceeds maximum size limit of ${maxSizeMB}MB`,
          errorCode: UPLOAD_ERROR_CODES.FILE_TOO_LARGE,
        });
        continue;
      }

      totalSize += file.size;
      validationResults.push({ name: file.name, valid: true });
    }

    // Check combined quota
    const quotaExceeded = totalSize > remainingQuota;

    res.json({
      valid: validationResults.every(r => r.valid) && !quotaExceeded,
      files: validationResults,
      quota: {
        used: Number(user.storageUsed),
        total: Number(user.storageQuota),
        remaining: remainingQuota,
        maxFileSize,
      },
      totalSize,
      quotaExceeded,
    });
  } catch (error: any) {
    logger.error('Validate upload error', { userId: req.user?.userId, error: error.message }, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to validate files' });
  }
});

// Chunked upload - initialize
router.post('/upload/init', authenticate, validate(uploadInitSchema), async (req: Request, res: Response) => {
  try {
    const {
      filename: rawFilename,
      relativePath: rawRelativePath,
      totalChunks,
      totalSize,
      folderId: baseFolderId,
      mimeType,
    } = req.body;
    const userId = req.user!.userId;

    // Validate base folderId if provided
    if (baseFolderId && !isValidUUID(baseFolderId)) {
      res.status(400).json({ error: 'Invalid folder ID format', code: UPLOAD_ERROR_CODES.INVALID_FOLDER });
      return;
    }

    if (baseFolderId) {
      if (!await validateFolderOwnership(baseFolderId, userId)) {
        res.status(404).json({ error: 'Folder not found', code: UPLOAD_ERROR_CODES.INVALID_FOLDER });
        return;
      }
    }

    // Validate chunk count
    if (totalChunks > UPLOAD_LIMITS.MAX_TOTAL_CHUNKS) {
      res.status(400).json({
        error: `Cannot exceed ${UPLOAD_LIMITS.MAX_TOTAL_CHUNKS} chunks`,
        code: UPLOAD_ERROR_CODES.INVALID_CHUNK,
      });
      return;
    }

    const decodedFilename = decodeFilename(rawFilename);
    const decodedRelativePath = rawRelativePath ? decodeFilename(rawRelativePath) : null;
    const normalizedRelativePath = decodedRelativePath ? decodedRelativePath.replace(/\\/g, '/') : null;
    const relativeParts = normalizedRelativePath ? normalizedRelativePath.split('/').filter(Boolean) : [];

    const rawNameFromPath = relativeParts.length > 0 ? relativeParts[relativeParts.length - 1] : decodedFilename;
    const sanitizedFilename = sanitizeFilename(rawNameFromPath);
    const folderPath = relativeParts.length > 1 ? relativeParts.slice(0, -1).join('/') : '';

    // Validate filename
    if (isDangerousExtension(sanitizedFilename)) {
      await auditLog({
        action: 'SUSPICIOUS_ACTIVITY',
        userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'],
        details: { filename: rawFilename, reason: 'dangerous_extension_init' },
        success: false,
      });
      res.status(400).json({ error: 'File type not allowed', code: UPLOAD_ERROR_CODES.DANGEROUS_EXTENSION });
      return;
    }

    const effectiveMimeType = mimeType || 'application/octet-stream';
    if (mimeType && !validateMimeType(effectiveMimeType, sanitizedFilename)) {
      await auditLog({
        action: 'SUSPICIOUS_ACTIVITY',
        userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'],
        details: { filename: rawFilename, mimeType, reason: 'mime_mismatch_init' },
        success: false,
      });
      res.status(400).json({ error: 'Invalid file type', code: UPLOAD_ERROR_CODES.INVALID_FILE_TYPE });
      return;
    }

    // Use transaction to atomically check and reserve space
    const globalMaxFileSize = await getGlobalUploadMaxFileSize();

    const uploadId = await prisma.$transaction(async (tx) => {
      // Lock user row to prevent concurrent init requests from over-reserving quota
      const userRows = await tx.$queryRaw<Array<{ storageQuota: bigint; storageUsed: bigint; tempStorage: bigint; maxFileSize: bigint }>>`
        SELECT "storageQuota", "storageUsed", "tempStorage", "maxFileSize"
        FROM "users"
        WHERE "id" = ${userId}::uuid
        FOR UPDATE
      `;
      const user = userRows[0];
      if (!user) {
        throw new Error('User not found');
      }

      const totalSizeBigInt = BigInt(totalSize);
      const maxFileSize = BigInt(Math.min(Number(user.maxFileSize), globalMaxFileSize));
      if (totalSizeBigInt > maxFileSize) {
        const maxSizeMB = Math.round(Number(maxFileSize) / 1024 / 1024);
        throw new Error(`File exceeds maximum size limit of ${maxSizeMB}MB`);
      }

      // Calculate remaining quota including temporary reserved storage
      const remainingQuota = user.storageQuota - user.storageUsed - (user.tempStorage || 0n);
      if (totalSizeBigInt > remainingQuota) {
        throw new Error('Storage quota exceeded');
      }

      // Ensure base folder exists (and is not trashed) if provided
      if (baseFolderId) {
        const baseFolder = await tx.folder.findFirst({
          where: { id: baseFolderId, userId, isTrash: false },
          select: { id: true },
        });
        if (!baseFolder) {
          throw new Error('Folder not found');
        }
      }

      const targetFolderId = folderPath
        ? await getOrCreateFolderPath(folderPath, baseFolderId || null, userId, tx as any)
        : (baseFolderId || null);

      // Reserve space using tempStorage to prevent race condition
      await tx.user.update({
        where: { id: userId },
        data: { tempStorage: { increment: totalSizeBigInt } },
      });

      const newUploadId = uuidv4();
      await tx.uploadSession.create({
        data: {
          id: newUploadId,
          userId,
          filename: sanitizedFilename,
          mimeType: effectiveMimeType,
          totalChunks,
          totalSize: totalSizeBigInt,
          folderId: targetFolderId,
          status: 'UPLOADING',
        },
      });

      return newUploadId;
    });

    res.json({ uploadId, totalChunks, reservedSize: totalSize });
  } catch (error: any) {
    logger.error('Init upload error', { userId: req.user?.userId, error: error.message }, error instanceof Error ? error : undefined);
    if (error.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
    } else if (error.message === 'Folder not found') {
      res.status(404).json({ error: 'Folder not found', code: UPLOAD_ERROR_CODES.INVALID_FOLDER });
    } else if (typeof error.message === 'string' && error.message.includes('exceeds maximum size limit')) {
      res.status(400).json({ error: error.message, code: UPLOAD_ERROR_CODES.FILE_TOO_LARGE });
    } else if (error.message === 'Storage quota exceeded') {
      res.status(400).json({ error: error.message, code: UPLOAD_ERROR_CODES.QUOTA_EXCEEDED });
    } else {
      res.status(500).json({ error: 'Failed to initialize upload' });
    }
  }
});

// Chunked upload - upload chunk
router.post('/upload/chunk', authenticate, uploadChunk.single('chunk'), validate(uploadChunkSchema), async (req: Request, res: Response) => {
  try {
    const { uploadId, chunkIndex, totalChunks, filename: rawFilename, mimeType, totalSize } = req.body;
    const filename = decodeFilename(rawFilename);
    const userId = req.user!.userId;

    // Validate uploadId is a valid UUID
    if (!isValidUUID(uploadId)) {
      logger.warn('Invalid uploadId in chunk upload', { uploadId, userId });
      res.status(400).json({ error: 'Invalid upload ID', code: UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND });
      return;
    }

    // Validate chunk index
    const chunkIdx = parseInt(chunkIndex, 10);
    const totalChunksNum = parseInt(totalChunks, 10);

    if (isNaN(chunkIdx) || chunkIdx < 0 || isNaN(totalChunksNum) || totalChunksNum <= 0) {
      res.status(400).json({ error: 'Invalid chunk parameters', code: UPLOAD_ERROR_CODES.INVALID_CHUNK });
      return;
    }

    if (chunkIdx >= totalChunksNum) {
      res.status(400).json({ error: 'Chunk index exceeds total chunks', code: UPLOAD_ERROR_CODES.CHUNK_MISMATCH });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No chunk uploaded', code: UPLOAD_ERROR_CODES.INVALID_CHUNK });
      return;
    }

    const session = await prisma.uploadSession.findUnique({
      where: { id: uploadId },
      select: {
        userId: true,
        fileId: true,
        filename: true,
        mimeType: true,
        totalChunks: true,
        totalSize: true,
        folderId: true,
        status: true,
      },
    });

    if (!session || session.userId !== userId) {
      await deleteFile(req.file.path).catch(() => { });
      res.status(404).json({ error: 'Upload not found', code: UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND });
      return;
    }

    // Idempotency: if already completed, return the final file
    if (session.status === 'COMPLETED' && session.fileId) {
      await deleteFile(req.file.path).catch(() => { });
      const existing = await prisma.file.findFirst({ where: { id: session.fileId, userId } });
      if (existing) {
        res.json({
          completed: true,
          file: { ...existing, size: existing.size.toString() },
        });
        return;
      }
      res.json({ completed: true });
      return;
    }

    // Validate upload session parameters match
    if (totalChunksNum !== session.totalChunks) {
      await deleteFile(req.file.path).catch(() => { });
      res.status(400).json({ error: 'Total chunks mismatch', code: UPLOAD_ERROR_CODES.CHUNK_MISMATCH });
      return;
    }

    const declaredSizeNum = parseInt(totalSize, 10);
    if (!Number.isFinite(declaredSizeNum) || declaredSizeNum <= 0) {
      await deleteFile(req.file.path).catch(() => { });
      res.status(400).json({ error: 'Invalid total size', code: UPLOAD_ERROR_CODES.INVALID_CHUNK });
      return;
    }

    if (BigInt(declaredSizeNum) !== session.totalSize) {
      await deleteFile(req.file.path).catch(() => { });
      res.status(400).json({ error: 'Total size mismatch', code: UPLOAD_ERROR_CODES.CHUNK_MISMATCH });
      return;
    }

    const sanitizedRequestFilename = sanitizeFilename(filename);
    if (sanitizedRequestFilename !== session.filename) {
      await deleteFile(req.file.path).catch(() => { });
      res.status(400).json({ error: 'Filename mismatch', code: UPLOAD_ERROR_CODES.CHUNK_MISMATCH });
      return;
    }

    // Validate chunk size
    if (req.file.size > UPLOAD_LIMITS.MAX_CHUNK_SIZE) {
      await deleteFile(req.file.path);
      res.status(400).json({
        error: `Chunk size exceeds maximum of ${UPLOAD_LIMITS.MAX_CHUNK_SIZE / 1024 / 1024}MB`,
        code: UPLOAD_ERROR_CODES.FILE_TOO_LARGE,
      });
      return;
    }

    // Validate filename and MIME type
    if (isDangerousExtension(session.filename)) {
      await deleteFile(req.file.path);
      await cleanupChunks(uploadId, userId);
      logger.warn('Dangerous extension in chunk upload', { filename: session.filename, userId });
      res.status(400).json({ error: 'File type not allowed', code: UPLOAD_ERROR_CODES.DANGEROUS_EXTENSION });
      return;
    }

    const effectiveMimeType = session.mimeType || mimeType || 'application/octet-stream';
    if (!validateMimeType(effectiveMimeType, session.filename)) {
      await deleteFile(req.file.path);
      await cleanupChunks(uploadId, userId);
      logger.warn('MIME type mismatch in chunk upload', { mimeType: effectiveMimeType, filename: session.filename, userId });
      res.status(400).json({ error: 'Invalid file type', code: UPLOAD_ERROR_CODES.INVALID_FILE_TYPE });
      return;
    }

    const chunkPath = getChunkPath(uploadId, chunkIdx);
    await fs.mkdir(path.dirname(chunkPath), { recursive: true });

    // Idempotency: if this chunk already exists and matches, ignore re-uploads
    const existingChunk = await prisma.fileChunk.findUnique({
      where: { uploadId_chunkIndex: { uploadId, chunkIndex: chunkIdx } },
      select: { path: true, size: true },
    });

    const incomingSize = BigInt(req.file.size);
    let shouldStoreChunk = true;

    if (existingChunk) {
      const diskOk = await fileExists(existingChunk.path);
      const sizeOk = existingChunk.size === incomingSize;

      if (diskOk && sizeOk) {
        shouldStoreChunk = false;
      } else {
        // If the DB record exists but the file is missing or size differs, allow re-upload by deleting the stale record/file.
        await prisma.fileChunk.delete({ where: { uploadId_chunkIndex: { uploadId, chunkIndex: chunkIdx } } }).catch(() => { });
        if (diskOk) {
          await deleteFile(existingChunk.path).catch(() => { });
        }
      }
    }

    if (!shouldStoreChunk) {
      await deleteFile(req.file.path).catch(() => { });
    } else {
      try {
        await moveFileStorage(req.file.path, chunkPath);
      } catch (moveError: any) {
        // If another request already wrote the chunk, treat as idempotent (discard incoming temp chunk)
        await deleteFile(req.file.path).catch(() => { });
      }

      // Save chunk info (idempotent on retries)
      try {
        await prisma.fileChunk.create({
          data: {
            uploadId,
            chunkIndex: chunkIdx,
            totalChunks: session.totalChunks,
            path: chunkPath,
            size: incomingSize,
          },
        });
      } catch (createError: any) {
        if (createError.code !== 'P2002') {
          throw createError;
        }
      }
    }

    // Check if all chunks are uploaded
    const uploadedChunkCount = await prisma.fileChunk.count({ where: { uploadId } });

    if (uploadedChunkCount === totalChunksNum) {
      // Ensure only one request performs the merge
      const mergeLock = await prisma.uploadSession.updateMany({
        where: { id: uploadId, userId, status: 'UPLOADING' },
        data: { status: 'MERGING' },
      });

      if (mergeLock.count === 0) {
        const latest = await prisma.uploadSession.findUnique({
          where: { id: uploadId },
          select: { status: true, fileId: true },
        });

        if (latest?.status === 'COMPLETED' && latest.fileId) {
          const existing = await prisma.file.findFirst({ where: { id: latest.fileId, userId } });
          if (existing) {
            res.json({ completed: true, file: { ...existing, size: existing.size.toString() } });
            return;
          }
        }

        res.json({
          completed: false,
          uploadedChunks: uploadedChunkCount,
          totalChunks: totalChunksNum,
        });
        return;
      }

      const chunks = await prisma.fileChunk.findMany({
        where: { uploadId },
        orderBy: { chunkIndex: 'asc' },
      });

      // Validate all chunks are present (no gaps)
      const indices = chunks.map(c => c.chunkIndex).sort((a, b) => a - b);
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] !== i) {
          logger.error('Chunk index mismatch during merge', { uploadId, expected: i, got: indices[i] });
          await cleanupChunks(uploadId, userId);
          res.status(400).json({ error: 'Chunk index mismatch', code: UPLOAD_ERROR_CODES.CHUNK_MISMATCH });
          return;
        }
      }

      // Merge chunks using temporary file for atomicity
      const fileId = uuidv4();
      const ext = path.extname(session.filename);
      const filePath = getUserFilePath(userId, fileId, ext);
      const tempFilePath = getStoragePath('temp', `${uploadId}_merged${ext}`);

      await ensureUserDir(userId);

      try {
        // Performance: Use streaming to avoid loading entire chunks into memory
        // This reduces RAM usage from O(chunkSize) to O(buffer ~64KB)
        const { createWriteStream, createReadStream } = await import('fs');
        const { pipeline } = await import('stream/promises');

        const output = createWriteStream(tempFilePath);
        for (const chunk of chunks) {
          await pipeline(createReadStream(chunk.path), output, { end: false });
        }
        output.end();

        // Wait for write stream to finish
        await new Promise<void>((resolve, reject) => {
          output.on('finish', resolve);
          output.on('error', reject);
        });

        // SECURITY FIX: Verify actual file size matches declared totalSize
        const mergedStats = await fs.stat(tempFilePath);
        const actualSize = BigInt(mergedStats.size);

        if (actualSize !== session.totalSize) {
          await deleteFile(tempFilePath);
          await cleanupChunks(uploadId, userId);
          logger.warn('Chunked upload size mismatch', {
            uploadId,
            userId,
            declaredSize: session.totalSize,
            actualSize,
            difference: actualSize - session.totalSize,
          });
          res.status(400).json({
            error: 'File size mismatch: declared size does not match actual merged file size',
            code: UPLOAD_ERROR_CODES.INVALID_CHUNK,
          });
          return;
        }

        // Use transaction for database operations
        const dbFile = await prisma.$transaction(async (tx) => {
          // Verify quota again using outstanding reservations (prevents drift if tempStorage was reset)
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { storageQuota: true, storageUsed: true },
          });
          if (!user) throw new Error('User not found');

          const reservedOther = await tx.uploadSession.aggregate({
            where: {
              userId,
              status: { in: ['UPLOADING', 'MERGING'] },
              NOT: { id: uploadId },
            },
            _sum: { totalSize: true },
          });

          const otherReserved = reservedOther._sum.totalSize ?? 0n;
          const remainingQuota = user.storageQuota - user.storageUsed - otherReserved;
          if (actualSize > remainingQuota) throw new Error('Storage quota exceeded');

          // Move temp file to final location (atomic on same filesystem)
          await moveFileStorage(tempFilePath, filePath);

          // Clean up chunks
          for (const chunk of chunks) {
            await deleteFile(chunk.path);
          }

          // Delete chunk records
          await tx.fileChunk.deleteMany({ where: { uploadId } });

          // Create file record - USE VERIFIED SIZE
          const file = await tx.file.create({
            data: {
              id: fileId,
              name: session.filename,
              originalName: session.filename,
              mimeType: effectiveMimeType,
              size: actualSize,
              path: filePath,
              thumbnailPath: null,
              folderId: session.folderId || null,
              userId,
            },
          });

          // Update folder sizes - USE VERIFIED SIZE
          await updateParentFolderSizes(session.folderId || null, actualSize, tx, 'increment');

          // Update storage used and release tempStorage (clamped) - USE VERIFIED SIZE
          await tx.$executeRaw`
            UPDATE "users"
            SET
              "storageUsed" = "storageUsed" + ${actualSize},
              "tempStorage" = GREATEST("tempStorage" - ${session.totalSize}, 0)
            WHERE "id" = ${userId}::uuid
          `;

          await tx.uploadSession.update({
            where: { id: uploadId },
            data: { status: 'COMPLETED', fileId },
          });

          // Log activity - USE VERIFIED SIZE
          await tx.activity.create({
            data: {
              type: 'UPLOAD',
              userId,
              fileId: file.id,
              details: JSON.stringify({ name: session.filename, size: actualSize.toString() }),
            },
          });

          return file;
        });

        // Clean up chunk directory (outside transaction, non-critical)
        await deleteDirectory(getStoragePath('chunks', uploadId)).catch(() => { });

        // Generate thumbnail asynchronously (non-blocking)
        generateThumbnail(filePath, fileId, mimeType)
          .then(async (thumbnailPath) => {
            if (thumbnailPath) {
              await prisma.file.update({
                where: { id: fileId },
                data: { thumbnailPath },
              }).catch(() => { });
            }
          })
          .catch(() => { });

        res.json({
          completed: true,
          file: {
            ...dbFile,
            size: dbFile.size.toString(),
          },
        });
      } catch (error) {
        // Clean up temp file on error
        await deleteFile(tempFilePath).catch(() => { });
        // Transactional cleanup of chunks and reserved storage
        await cleanupChunks(uploadId, userId);
        throw error;
      }
    } else {
      res.json({
        completed: false,
        uploadedChunks: uploadedChunkCount,
        totalChunks: totalChunksNum,
      });
    }
  } catch (error) {
    logger.error('Chunk upload error', { userId: req.user?.userId }, error instanceof Error ? error : undefined);
    const tempPath = (req.file as Express.Multer.File | undefined)?.path;
    if (tempPath) {
      await deleteFile(tempPath).catch(() => { });
    }
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
});

// List files
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      folderId,
      page = '1',
      limit = '50',
      search,
      type,
      favorite,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const folderIdStr = folderId === 'null' || folderId === '' ? null : (folderId as string) || null;

    // Performance: Use separate cache for favorites queries
    const isFavoriteQuery = favorite === 'true';
    const canUseCache = !search;

    if (canUseCache) {
      if (isFavoriteQuery) {
        // Favorites have their own dedicated cache
        const cachedFavorites = await cache.getFavorites(userId, pageNum, sortBy as string, sortOrder as string);
        if (cachedFavorites) {
          logger.debug('Cache hit for favorites list', { userId, page: pageNum });
          res.json(cachedFavorites);
          return;
        }
      } else {
        // Regular files cache
        const cachedFiles = await cache.getFiles(userId, folderIdStr, pageNum, type as string, sortBy as string, sortOrder as string);
        if (cachedFiles) {
          logger.debug('Cache hit for files list', { userId, folderId: folderIdStr, page: pageNum });
          res.json(cachedFiles);
          return;
        }
      }
    }

    const where: any = {
      userId,
      isTrash: false,
    };

    // When searching, ignore folderId to search across all folders (global search)
    // When not searching, respect the folder navigation
    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    } else if (folderId === 'null' || folderId === '') {
      where.folderId = null;
    } else if (folderId) {
      where.folderId = folderId;
    }

    if (type) {
      switch (type) {
        case 'images':
          where.mimeType = { startsWith: 'image/' };
          break;
        case 'videos':
          where.mimeType = { startsWith: 'video/' };
          break;
        case 'media':
          // Media includes both images and videos (for gallery 'all' tab)
          where.OR = [
            { mimeType: { startsWith: 'image/' } },
            { mimeType: { startsWith: 'video/' } },
          ];
          break;
        case 'audio':
          where.mimeType = { startsWith: 'audio/' };
          break;
        case 'documents':
          where.OR = [
            // PDF
            { mimeType: 'application/pdf' },
            // Word documents
            { mimeType: 'application/msword' },
            { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
            { mimeType: 'application/rtf' },
            // Excel spreadsheets
            { mimeType: 'application/vnd.ms-excel' },
            { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            { mimeType: 'text/csv' },
            // PowerPoint presentations
            { mimeType: 'application/vnd.ms-powerpoint' },
            { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
            // Text files (includes html, css, js, json, xml, markdown, etc.)
            { mimeType: { startsWith: 'text/' } },
            // Code and data files
            { mimeType: 'application/json' },
            { mimeType: 'application/xml' },
            { mimeType: 'application/javascript' },
            { mimeType: 'application/x-javascript' },
            { mimeType: 'application/typescript' },
          ];
          break;
      }
    }

    if (favorite === 'true') {
      where.isFavorite = true;
    }

    // Build orderBy clause
    const validSortFields = ['name', 'createdAt', 'updatedAt', 'size'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : 'createdAt';
    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { [sortField as string]: orderDirection },
      }),
      prisma.file.count({ where }),
    ]);

    const response = {
      files: files.map((f: any) => ({ ...f, size: f.size.toString() })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    // Cache the result if it's a cacheable query
    if (canUseCache) {
      if (isFavoriteQuery) {
        await cache.setFavorites(userId, pageNum, response as any, sortBy as string, sortOrder as string);
      } else {
        await cache.setFiles(userId, folderIdStr, pageNum, type as string, response as any, sortBy as string, sortOrder as string);
      }
    }

    res.json(response);
  } catch (error) {
    logger.error('List files error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Get single file
router.get('/:id([0-9a-fA-F-]{36})', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Validate UUID format
    if (!isValidUUID(id)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json({ ...file, size: file.size.toString() });
  } catch (error) {
    logger.error('Get file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// Rename file
router.patch('/:id/rename', authenticate, validate(renameFileSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user!.userId;

    const sanitizedName = sanitizeFilename(name);
    if (isDangerousExtension(sanitizedName)) {
      res.status(400).json({ error: 'File type not allowed' });
      return;
    }

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: { name: sanitizedName },
    });

    await prisma.activity.create({
      data: {
        type: 'RENAME',
        userId,
        fileId: id,
        details: JSON.stringify({ oldName: file.name, newName: sanitizedName }),
      },
    });

    // Invalidate cache after file rename
    await cache.invalidateAfterFileChange(userId, id);

    res.json({ ...updated, size: updated.size.toString() });
  } catch (error) {
    logger.error('Rename file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to rename file' });
  }
});

// Toggle favorite status
router.patch('/:id/favorite', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id, userId, isTrash: false },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: { isFavorite: !file.isFavorite },
    });

    // Invalidate cache after favorite change
    await cache.invalidateAfterFileChange(userId, id);

    res.json({ ...updated, size: updated.size.toString() });
  } catch (error) {
    logger.error('Toggle favorite error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// Move file
router.patch('/:id/move', authenticate, validate(moveFileSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { folderId } = req.body;
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId },
      });

      if (!folder) {
        res.status(404).json({ error: 'Destination folder not found' });
        return;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const fileToMove = await tx.file.update({
        where: { id },
        data: { folderId },
      });

      // Update old folder size
      if (file.folderId) {
        await updateParentFolderSizes(file.folderId, fileToMove.size, tx, 'decrement');
      }

      // Update new folder size
      if (folderId) {
        await updateParentFolderSizes(folderId, fileToMove.size, tx, 'increment');
      }

      return fileToMove;
    });

    await prisma.activity.create({
      data: {
        type: 'MOVE',
        userId,
        fileId: id,
        folderId,
        details: JSON.stringify({ from: file.folderId, to: folderId }),
      },
    });

    // Invalidate cache after file move
    await cache.invalidateAfterFileChange(userId, id);

    res.json({ ...updated, size: updated.size.toString() });
  } catch (error) {
    logger.error('Move file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// P1-4: Duplicate route removed - toggle favorite is defined above at line ~1563

// Delete file (move to trash)
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { permanent } = req.query;

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (permanent === 'true' || file.isTrash) {
      // Permanent delete
      await deleteFile(file.path);
      if (file.thumbnailPath) {
        await deleteFile(file.thumbnailPath);
      }

      await prisma.file.delete({ where: { id } });

      // Update user storage
      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { decrement: Number(file.size) } },
      });

      // Update folder sizes
      await updateParentFolderSizes(file.folderId, Number(file.size), prisma, 'decrement');
    } else {
      // Move to trash
      await prisma.file.update({
        where: { id },
        data: { isTrash: true, trashedAt: new Date() },
      });
    }

    await prisma.activity.create({
      data: {
        type: 'DELETE',
        userId,
        fileId: id,
        details: JSON.stringify({ name: file.name, permanent: permanent === 'true' }),
      },
    });

    // Invalidate cache after file deletion
    await cache.invalidateAfterFileChange(userId, id);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    logger.error('Delete file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Download file
router.get('/:id/download', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Validate file ID format
    if (!isValidUUID(id)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const file = await prisma.file.findFirst({
      where: { id, userId, isTrash: false },
    });

    if (!file) {
      logger.info('File not found for download', { fileId: id, userId });
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!await fileExists(file.path)) {
      logger.warn('File exists in DB but not on disk', { fileId: id, path: file.path });
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    // Log activity
    await prisma.activity.create({
      data: {
        type: 'DOWNLOAD',
        userId,
        fileId: id,
        details: JSON.stringify({ name: file.name }),
      },
    });

    const stat = await fs.stat(file.path);
    const range = req.headers.range;

    if (range) {
      // Validate and parse Range header
      const parsedRange = parseRangeHeader(range, Number(stat.size));

      if (!parsedRange) {
        logger.warn('Invalid Range header in download', { fileId: id, range });
        res.status(416).json({ error: 'Invalid Range header' });
        return;
      }

      const { start, end } = parsedRange;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', file.mimeType);

      const { createReadStream } = await import('fs');
      const stream = createReadStream(file.path, { start, end });
      stream.on('error', (err) => {
        logger.error('Download stream error', { fileId: id }, err instanceof Error ? err : undefined);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' });
        }
        stream.destroy();
      });
      res.on('close', () => {
        stream.destroy();
      });
      stream.pipe(res);
    } else {
      // Safe filename encoding for Content-Disposition
      const safeFilename = encodeURIComponent(file.name).replace(/['()]/g, escape);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', stat.size);
      res.sendFile(file.path);
    }
  } catch (error) {
    logger.error('Download file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

const findFile = async (id: string, userId?: string) => {
  // Validate ID format first
  if (!isValidUUID(id)) {
    return { file: null, error: 'invalid_id' as const };
  }

  if (!userId) {
    return { file: null };
  }

  const file = await prisma.file.findFirst({
    where: {
      id,
      isTrash: false,
      userId,
    },
  });

  return { file };
};

// Stream/play file
router.get('/:id/stream', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const result = await findFile(id, userId);

    if (result.error === 'invalid_id') {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!result.file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const file = result.file;

    if (!await fileExists(file.path)) {
      logger.warn('File exists in DB but not on disk for stream', { fileId: id, path: file.path });
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const stat = await fs.stat(file.path);

    // H-08: For video transcoding to MP4 - delegate to worker queue (non-blocking)
    if (req.query.transcode === 'true' && file.mimeType.startsWith('video/') && !file.mimeType.includes('mp4')) {
      logger.info('Video transcoding requested, delegating to queue', { fileId: id, mimeType: file.mimeType });

      // Check if job already exists/completed
      const existingStatus = await getTranscodingJobStatus(id);
      if (existingStatus) {
        if (existingStatus.status === 'completed') {
          // Serve the transcoded file
          const transcodedPath = getStoragePath('files', userId, `${id}_transcoded.mp4`);
          if (await fileExists(transcodedPath)) {
            const transcodedStat = await fs.stat(transcodedPath);
            return streamFile(req, res, { path: transcodedPath, mimeType: 'video/mp4', name: file.name }, transcodedStat);
          }
        }
        // Return current status
        res.status(202).json({
          message: 'Transcoding in progress',
          jobId: id,
          status: existingStatus.status,
          progress: existingStatus.progress,
        });
        return;
      }

      // Queue new transcoding job
      const jobId = await addTranscodingJob(id, file.path, userId, 'mp4', 'medium');

      if (!jobId) {
        res.status(503).json({ error: 'Transcoding service unavailable', code: 'TRANSCODING_UNAVAILABLE' });
        return;
      }

      res.status(202).json({
        message: 'Transcoding started',
        jobId: id,
        status: 'queued',
        progress: 0,
      });
      return;
    }

    return streamFile(req, res, file, stat);
  } catch (error) {
    logger.error('Stream file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to stream file' });
  }
});

// Convert Excel to HTML with styles
router.get('/:id/excel-html', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sheetIndex = parseInt(req.query.sheet as string) || 0;
    const userId = req.user?.userId;

    const result = await findFile(id, userId);

    if (result.error === 'invalid_id') {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!result.file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const file = result.file;

    // Check if it's an Excel file
    const isExcel = file.mimeType.includes('spreadsheet') ||
      file.mimeType.includes('excel') ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls');

    if (!isExcel) {
      res.status(400).json({ error: 'File is not an Excel spreadsheet' });
      return;
    }

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.path);

    const sheetNames = workbook.worksheets.map(ws => ws.name);
    const worksheet = workbook.worksheets[sheetIndex] || workbook.worksheets[0];

    if (!worksheet) {
      res.status(400).json({ error: 'No worksheets found' });
      return;
    }

    // Helper to convert ARGB color to CSS
    const argbToHex = (argb: string | undefined): string | null => {
      if (!argb) return null;
      // ARGB format: AARRGGBB, we need #RRGGBB
      if (argb.length === 8) {
        return '#' + argb.substring(2);
      }
      if (argb.length === 6) {
        return '#' + argb;
      }
      return null;
    };

    // Helper to get cell background color
    const getCellBgColor = (cell: ExcelJS.Cell): string | null => {
      const fill = cell.fill;
      if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
        const fgColor = fill.fgColor;
        if (fgColor) {
          if (fgColor.argb) return argbToHex(fgColor.argb);
          if (fgColor.theme !== undefined) {
            // Theme colors - approximate common ones
            const themeColors: Record<number, string> = {
              0: '#FFFFFF', 1: '#000000', 2: '#E7E6E6', 3: '#44546A',
              4: '#4472C4', 5: '#ED7D31', 6: '#A5A5A5', 7: '#FFC000',
              8: '#5B9BD5', 9: '#70AD47'
            };
            return themeColors[fgColor.theme] || null;
          }
        }
      }
      return null;
    };

    // Helper to get font color
    const getFontColor = (cell: ExcelJS.Cell): string | null => {
      const font = cell.font;
      if (font?.color) {
        if (font.color.argb) return argbToHex(font.color.argb);
        if (font.color.theme !== undefined) {
          const themeColors: Record<number, string> = {
            0: '#FFFFFF', 1: '#000000', 2: '#E7E6E6', 3: '#44546A',
            4: '#4472C4', 5: '#ED7D31', 6: '#A5A5A5', 7: '#FFC000',
            8: '#5B9BD5', 9: '#70AD47'
          };
          return themeColors[font.color.theme] || null;
        }
      }
      return null;
    };

    // Helper to get border style
    const getBorderStyle = (border: Partial<ExcelJS.Border> | undefined): string => {
      if (!border || !border.style) return 'none';
      const color = border.color?.argb ? argbToHex(border.color.argb) : '#000000';
      switch (border.style) {
        case 'thin': return `1px solid ${color}`;
        case 'medium': return `2px solid ${color}`;
        case 'thick': return `3px solid ${color}`;
        case 'double': return `3px double ${color}`;
        case 'dotted': return `1px dotted ${color}`;
        case 'dashed': return `1px dashed ${color}`;
        default: return `1px solid ${color}`;
      }
    };

    // Build HTML table
    let html = '<table style="border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt;">';

    // Track merged cells
    const mergedCells = new Map<string, { rowSpan: number; colSpan: number }>();
    const skipCells = new Set<string>();

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // Check for merged cells
      // ExcelJS merged cells are in worksheet.model.merges
    });

    // Process merges
    if ((worksheet as any).model?.merges) {
      for (const merge of (worksheet as any).model.merges) {
        // merge is like "A1:B2"
        const [start, end] = merge.split(':');
        const startCell = worksheet.getCell(start);
        const endCell = worksheet.getCell(end);

        const startRow = Number(startCell.row);
        const startCol = Number(startCell.col);
        const endRow = Number(endCell.row);
        const endCol = Number(endCell.col);

        mergedCells.set(`${startRow}-${startCol}`, {
          rowSpan: endRow - startRow + 1,
          colSpan: endCol - startCol + 1
        });

        // Mark cells to skip
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            if (r !== startRow || c !== startCol) {
              skipCells.add(`${r}-${c}`);
            }
          }
        }
      }
    }

    // Get column widths
    const colWidths: number[] = [];
    worksheet.columns.forEach((col, index) => {
      colWidths[index] = col.width ? col.width * 7 : 64; // Approximate pixel width
    });

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const rowHeight = row.height || 15;
      html += `<tr style="height: ${rowHeight}px;">`;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const cellKey = `${rowNumber}-${colNumber}`;

        // Skip merged cells (not the first one)
        if (skipCells.has(cellKey)) return;

        const merge = mergedCells.get(cellKey);
        const rowSpan = merge?.rowSpan || 1;
        const colSpan = merge?.colSpan || 1;

        // Build cell styles
        const styles: string[] = [];

        // Background color
        const bgColor = getCellBgColor(cell);
        if (bgColor) styles.push(`background-color: ${bgColor}`);

        // Font styles
        const font = cell.font;
        if (font) {
          if (font.bold) styles.push('font-weight: bold');
          if (font.italic) styles.push('font-style: italic');
          if (font.underline) styles.push('text-decoration: underline');
          if (font.strike) styles.push('text-decoration: line-through');
          if (font.size) styles.push(`font-size: ${font.size}pt`);
          if (font.name) styles.push(`font-family: ${font.name}, sans-serif`);
          const fontColor = getFontColor(cell);
          if (fontColor) styles.push(`color: ${fontColor}`);
        }

        // Alignment
        const alignment = cell.alignment;
        if (alignment) {
          if (alignment.horizontal) {
            styles.push(`text-align: ${alignment.horizontal}`);
          }
          if (alignment.vertical) {
            const vAlign = alignment.vertical === 'middle' ? 'middle' : alignment.vertical;
            styles.push(`vertical-align: ${vAlign}`);
          }
          if (alignment.wrapText) {
            styles.push('white-space: pre-wrap');
          }
        }

        // Borders
        const border = cell.border;
        if (border) {
          if (border.top) styles.push(`border-top: ${getBorderStyle(border.top)}`);
          if (border.right) styles.push(`border-right: ${getBorderStyle(border.right)}`);
          if (border.bottom) styles.push(`border-bottom: ${getBorderStyle(border.bottom)}`);
          if (border.left) styles.push(`border-left: ${getBorderStyle(border.left)}`);
        }

        // Width
        const width = colWidths[colNumber - 1];
        if (width) styles.push(`min-width: ${width}px`);

        // Padding
        styles.push('padding: 2px 4px');

        // Get cell value
        let value = '';
        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === 'object') {
            if ('richText' in cell.value) {
              // Rich text
              value = (cell.value as ExcelJS.CellRichTextValue).richText
                .map(rt => rt.text)
                .join('');
            } else if ('formula' in cell.value) {
              // Formula result
              value = String((cell.value as ExcelJS.CellFormulaValue).result || '');
            } else if ('hyperlink' in cell.value) {
              // Hyperlink
              value = String((cell.value as ExcelJS.CellHyperlinkValue).text || '');
            } else if (cell.value instanceof Date) {
              // Date
              value = cell.value.toLocaleDateString();
            } else {
              value = String(cell.value);
            }
          } else {
            value = String(cell.value);
          }
        }

        // Escape HTML
        value = value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');

        const spanAttrs = [];
        if (rowSpan > 1) spanAttrs.push(`rowspan="${rowSpan}"`);
        if (colSpan > 1) spanAttrs.push(`colspan="${colSpan}"`);

        html += `<td ${spanAttrs.join(' ')} style="${styles.join('; ')}">${value}</td>`;
      });

      html += '</tr>';
    });

    html += '</table>';

    res.json({
      html,
      sheetNames,
      currentSheet: sheetIndex,
      fileName: file.name
    });
  } catch (error) {
    logger.error('Excel to HTML error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to convert Excel file' });
  }
});

// View file (alias for stream, for compatibility)
router.get('/:id/view', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const result = await findFile(id, userId);

    if (result.error === 'invalid_id') {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!result.file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const file = result.file;

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const stat = await fs.stat(file.path);
    return streamFile(req, res, file, stat);
  } catch (error) {
    logger.error('View file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to view file' });
  }
});

// Get thumbnail
router.get('/:id/thumbnail', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const result = await findFile(id, userId);

    if (result.error === 'invalid_id') {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!result.file || !result.file.thumbnailPath) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }

    const file = result.file;

    if (file.thumbnailPath && await fileExists(file.thumbnailPath)) {
      // Performance: Add browser cache headers for thumbnails
      // Thumbnails are immutable once generated, so we can cache aggressively
      const etag = `"${file.id}"`;

      // Check If-None-Match for conditional request (304 Not Modified)
      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // 24 hours
      res.setHeader('ETag', etag);
      res.sendFile(file.thumbnailPath);
    } else {
      logger.info('Thumbnail path in DB but file missing', { fileId: id, thumbnailPath: file.thumbnailPath });
      res.status(404).json({ error: 'Thumbnail not found' });
    }
  } catch (error) {
    logger.error('Get thumbnail error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

// Create empty file
// Issue #14: Maximum content size for created files (10MB)
const MAX_CREATE_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

router.post('/create-empty', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, folderId, content } = req.body;
    const userId = req.user!.userId;

    if (!name) {
      res.status(400).json({ error: 'File name is required' });
      return;
    }

    // Validate folderId format if provided
    if (folderId && !isValidUUID(folderId)) {
      res.status(400).json({ error: 'Invalid folder ID format' });
      return;
    }

    // Validate content size if provided
    const fileContent = content || '';
    const fileSize = Buffer.byteLength(fileContent, 'utf8');
    if (fileContent && fileSize > MAX_CREATE_CONTENT_SIZE) {
      res.status(400).json({ error: `Content exceeds maximum size limit of ${MAX_CREATE_CONTENT_SIZE / 1024 / 1024}MB` });
      return;
    }

    const sanitizedName = sanitizeFilename(name);
    if (isDangerousExtension(sanitizedName)) {
      res.status(400).json({ error: 'File type not allowed' });
      return;
    }

    // Validate folder ownership
    if (folderId) {
      if (!await validateFolderOwnership(folderId, userId)) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { storageQuota: true, storageUsed: true, tempStorage: true, maxFileSize: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const maxFileSize = Number(user.maxFileSize);
    const effectiveMaxFileSize = Math.min(maxFileSize, await getGlobalUploadMaxFileSize());
    if (fileSize > effectiveMaxFileSize) {
      const maxSizeMB = Math.round(effectiveMaxFileSize / 1024 / 1024);
      res.status(400).json({ error: `File exceeds maximum size limit of ${maxSizeMB}MB` });
      return;
    }

    const remainingQuota = Number(user.storageQuota) - Number(user.storageUsed) - Number(user.tempStorage || 0);
    if (fileSize > remainingQuota) {
      res.status(400).json({ error: 'Storage quota exceeded' });
      return;
    }

    await ensureUserDir(userId);

    const fileId = uuidv4();
    const ext = path.extname(sanitizedName) || '.txt';
    const filePath = getUserFilePath(userId, fileId, ext);

    await fs.writeFile(filePath, fileContent);

    const mimeType = ext === '.txt' ? 'text/plain' : 'application/octet-stream';
    try {
      const dbFile = await prisma.$transaction(async (tx) => {
        const created = await tx.file.create({
          data: {
            id: fileId,
            name: sanitizedName,
            originalName: sanitizedName,
            mimeType,
            size: BigInt(fileSize),
            path: filePath,
            folderId: folderId || null,
            userId,
          },
        });

        await tx.user.update({
          where: { id: userId },
          data: { storageUsed: { increment: fileSize } },
        });

        await updateParentFolderSizes(folderId || null, fileSize, tx, 'increment');

        return created;
      });

      res.status(201).json({ ...dbFile, size: String(fileSize) });
    } catch (dbError) {
      await deleteFile(filePath);
      throw dbError;
    }
  } catch (error) {
    logger.error('Create empty file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to create file' });
  }
});

// Security: Issue short-lived file access cookies and return direct file URL
router.post('/:id/signed-url', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action = 'view' } = req.body;
    const userId = req.user!.userId;

    // Validate file ID format
    if (!isValidUUID(id)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    // Validate action
    const validActions = ['view', 'download', 'stream', 'thumbnail'];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }

    // Verify file ownership
    const file = await prisma.file.findFirst({
      where: { id, userId, isTrash: false },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Import config for expiration
    const { config } = await import('../config/index.js');
    const { generateSignedUrlToken } = await import('../lib/jwt.js');

    const token = generateSignedUrlToken();
    const expiresAt = new Date(Date.now() + config.signedUrls.expiresIn * 1000);

    await prisma.signedUrl.create({
      data: {
        token,
        fileId: id,
        userId,
        action,
        expiresAt,
      },
    });

    const existingTokens = getFileAccessTokens(req);
    const updatedTokens = addFileAccessToken(existingTokens, token);
    setFileAccessCookie(res, updatedTokens);

    // Clean up expired signed URLs (async, don't wait)
    prisma.signedUrl.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }).catch(() => { });

    // Build a signed URL that is valid for the *current* public API origin.
    // Using req.protocol/host avoids relying on FRONTEND_URL being a proxy for /api
    // (common when frontend and backend are hosted on different origins).
    const host = req.get('host');
    const origin = host ? `${req.protocol}://${host}` : config.frontendUrl.replace(/\/$/, '');

    res.json({
      signedUrl: `${origin.replace(/\/$/, '')}/api/files/${id}/${action}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error('Generate signed URL error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

// Bulk move files
router.post('/bulk/move', authenticate, async (req: Request, res: Response) => {
  try {
    const { fileIds, folderId } = req.body;
    const userId = req.user!.userId;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds array is required' });
      return;
    }

    // Validate destination folder if provided
    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId },
      });
      if (!folder) {
        res.status(404).json({ error: 'Destination folder not found' });
        return;
      }
    }

    // Get files to move
    const files = await prisma.file.findMany({
      where: { id: { in: fileIds }, userId },
    });

    if (files.length === 0) {
      res.status(404).json({ error: 'No files found' });
      return;
    }

    // Move files in transaction
    await prisma.$transaction(async (tx) => {
      for (const file of files) {
        // Update old folder size
        if (file.folderId) {
          await updateParentFolderSizes(file.folderId, file.size, tx, 'decrement');
        }
        // Update new folder size
        if (folderId) {
          await updateParentFolderSizes(folderId, file.size, tx, 'increment');
        }
      }

      await tx.file.updateMany({
        where: { id: { in: fileIds }, userId },
        data: { folderId: folderId || null },
      });
    });

    // Create activity log
    await prisma.activity.create({
      data: {
        type: 'MOVE',
        userId,
        details: JSON.stringify({ fileIds, to: folderId, count: files.length }),
      },
    });

    // Invalidate cache
    await cache.invalidateAfterFileChange(userId);

    res.json({ message: `${files.length} files moved successfully` });
  } catch (error) {
    logger.error('Bulk move error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to move files' });
  }
});

// Bulk favorite files
router.post('/bulk/favorite', authenticate, async (req: Request, res: Response) => {
  try {
    const { fileIds, isFavorite } = req.body;
    const userId = req.user!.userId;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds array is required' });
      return;
    }

    const result = await prisma.file.updateMany({
      where: { id: { in: fileIds }, userId, isTrash: false },
      data: { isFavorite: isFavorite === true },
    });

    // Invalidate cache
    await cache.invalidateAfterFileChange(userId);

    res.json({ message: `${result.count} files updated`, count: result.count });
  } catch (error) {
    logger.error('Bulk favorite error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to update favorites' });
  }
});

// Bulk delete files (move to trash)
router.post('/bulk/delete', authenticate, async (req: Request, res: Response) => {
  try {
    const { fileIds, permanent } = req.body;
    const userId = req.user!.userId;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({ error: 'fileIds array is required' });
      return;
    }

    const files = await prisma.file.findMany({
      where: { id: { in: fileIds }, userId },
    });

    if (files.length === 0) {
      res.status(404).json({ error: 'No files found' });
      return;
    }

    if (permanent === true) {
      // Permanent delete
      for (const file of files) {
        await deleteFile(file.path);
        if (file.thumbnailPath) {
          await deleteFile(file.thumbnailPath);
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.file.deleteMany({
          where: { id: { in: fileIds }, userId },
        });

        // Update storage
        const totalSize = files.reduce((sum, f) => sum + Number(f.size), 0);
        await tx.user.update({
          where: { id: userId },
          data: { storageUsed: { decrement: totalSize } },
        });

        // Update folder sizes
        for (const file of files) {
          if (file.folderId) {
            await updateParentFolderSizes(file.folderId, file.size, tx, 'decrement');
          }
        }
      });
    } else {
      // Move to trash
      await prisma.file.updateMany({
        where: { id: { in: fileIds }, userId },
        data: { isTrash: true, trashedAt: new Date() },
      });
    }

    // Create activity log
    await prisma.activity.create({
      data: {
        type: 'DELETE',
        userId,
        details: JSON.stringify({ fileIds, permanent, count: files.length }),
      },
    });

    // Invalidate cache
    await cache.invalidateAfterFileChange(userId);

    res.json({ message: `${files.length} files deleted successfully` });
  } catch (error) {
    logger.error('Bulk delete error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to delete files' });
  }
});

// Advanced search endpoint
router.get('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      q,
      type,
      dateFrom,
      dateTo,
      sizeMin,
      sizeMax,
      tagId,
      favorite,
      page = '1',
      limit = '50',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);

    const where: any = {
      userId,
      isTrash: false,
    };

    // Text search in name
    if (q && typeof q === 'string' && q.trim()) {
      where.name = { contains: q.trim(), mode: 'insensitive' };
    }

    // Type filter
    if (type) {
      switch (type) {
        case 'images':
          where.mimeType = { startsWith: 'image/' };
          break;
        case 'videos':
          where.mimeType = { startsWith: 'video/' };
          break;
        case 'audio':
          where.mimeType = { startsWith: 'audio/' };
          break;
        case 'documents':
          where.OR = [
            { mimeType: 'application/pdf' },
            { mimeType: 'application/msword' },
            { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
            { mimeType: 'application/vnd.ms-excel' },
            { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            { mimeType: 'application/vnd.ms-powerpoint' },
            { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
            { mimeType: { startsWith: 'text/' } },
          ];
          break;
      }
    }

    // Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo as string);
      }
    }

    // Size range filter (in bytes)
    if (sizeMin || sizeMax) {
      where.size = {};
      if (sizeMin) {
        where.size.gte = BigInt(sizeMin as string);
      }
      if (sizeMax) {
        where.size.lte = BigInt(sizeMax as string);
      }
    }

    // Favorite filter
    if (favorite === 'true') {
      where.isFavorite = true;
    }

    // Tag filter
    let fileIds: string[] | undefined;
    if (tagId) {
      const fileTags = await prisma.fileTag.findMany({
        where: { tagId: tagId as string },
        select: { fileId: true },
      });
      fileIds = fileTags.map(ft => ft.fileId);
      if (fileIds.length === 0) {
        // No files with this tag
        res.json({
          files: [],
          folders: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 },
        });
        return;
      }
      where.id = { in: fileIds };
    }

    // Build orderBy
    const validSortFields = ['name', 'createdAt', 'updatedAt', 'size'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : 'createdAt';
    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';

    // Search files
    const [files, totalFiles] = await Promise.all([
      prisma.file.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { [sortField as string]: orderDirection },
        include: {
          folder: { select: { id: true, name: true } },
        },
      }),
      prisma.file.count({ where }),
    ]);

    // Also search folders if text search
    let folders: any[] = [];
    let totalFolders = 0;
    if (q && typeof q === 'string' && q.trim()) {
      const folderWhere: any = {
        userId,
        isTrash: false,
        name: { contains: q.trim(), mode: 'insensitive' },
      };

      if (favorite === 'true') {
        folderWhere.isFavorite = true;
      }

      [folders, totalFolders] = await Promise.all([
        prisma.folder.findMany({
          where: folderWhere,
          take: 20, // Limit folder results
          orderBy: { name: 'asc' },
        }),
        prisma.folder.count({ where: folderWhere }),
      ]);
    }

    res.json({
      files: files.map((f: any) => ({
        ...f,
        size: f.size.toString(),
        folderName: f.folder?.name || null,
      })),
      folders: folders.map((f: any) => ({
        ...f,
        size: f.size?.toString() ?? '0',
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalFiles,
        totalFolders,
        total: totalFiles + totalFolders,
        totalPages: Math.ceil(totalFiles / limitNum),
      },
    });
  } catch (error) {
    logger.error('Search error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to search files' });
  }
});

export default router;
