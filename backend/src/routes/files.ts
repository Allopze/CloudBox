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
  batchSignedUrlsSchema,
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
import { generateThumbnail, generateLqip } from '../lib/thumbnail.js';
import { thumbnailQueue } from '../lib/thumbnailQueue.js';
import { config } from '../config/index.js';
import { sanitizeFilename, validateMimeType, isDangerousExtension, checkUserRateLimitDistributed, getBlockedExtensions } from '../lib/security.js';
import { auditLog } from '../lib/audit.js';
import { addFileAccessToken, getFileAccessTokens, setFileAccessCookie } from '../lib/fileAccessCookies.js';
import { generateSignedUrlToken } from '../lib/jwt.js';

type FileResponse = { size: string } & Record<string, unknown>;
import logger from '../lib/logger.js';
import { buildExcelHtmlPreview } from '../lib/excelPreview.js';
import * as cache from '../lib/cache.js';
import { getGlobalUploadMaxFileSize } from '../lib/limits.js';
import { addMidiTranscodingJob, addTranscodingJob, getTranscodingJobStatus } from '../lib/transcodingQueue.js';

const router = Router();

const MIDI_MIME_TYPES = new Set([
  'audio/midi',
  'audio/mid',
  'audio/x-midi',
  'audio/x-mid',
  'application/midi',
  'application/x-midi',
  'audio/sp-midi',
  'audio/smf',
]);

const MIDI_EXTENSIONS = new Set(['.mid', '.midi']);

const isMidiFile = (mimeType: string, filename: string): boolean => {
  const normalizedMime = mimeType.toLowerCase();
  if (MIDI_MIME_TYPES.has(normalizedMime)) {
    return true;
  }

  const ext = path.extname(filename).toLowerCase();
  return MIDI_EXTENSIONS.has(ext);
};

const normalizeMimeType = (mimeType: string, filename: string): string => {
  return isMidiFile(mimeType, filename) ? 'audio/midi' : mimeType;
};

type MidiTranscodeItem = { fileId: string; filePath: string; userId: string };

const queueMidiTranscodes = async (items: MidiTranscodeItem[]): Promise<void> => {
  if (items.length === 0) return;
  await Promise.allSettled(
    items.map((item) => addMidiTranscodingJob(item.fileId, item.filePath, item.userId))
  );
};

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

const splitRelativePath = (value: string): string[] => {
  return value.replace(/\\/g, '/').split('/').filter(Boolean);
};

const getFolderLockKey = (userId: string, parentId: string | null, name: string): string => {
  return `folder:${userId}:${parentId ?? 'root'}:${name}`;
};

const acquireFolderLock = async (
  tx: typeof prisma,
  userId: string,
  parentId: string | null,
  name: string
): Promise<void> => {
  const lockKey = getFolderLockKey(userId, parentId, name);
  // Serialize folder creation across concurrent uploads; NULL parentId allows duplicates otherwise.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
};

const findOrCreateFolder = async (
  name: string,
  parentId: string | null,
  userId: string,
  tx: typeof prisma
) => {
  await acquireFolderLock(tx, userId, parentId, name);

  let folder = await tx.folder.findFirst({
    where: { name, parentId, userId },
    orderBy: [{ isTrash: 'asc' }, { createdAt: 'asc' }],
  });

  if (folder?.isTrash) {
    folder = await tx.folder.update({
      where: { id: folder.id },
      data: { isTrash: false, trashedAt: null },
    });
  }

  if (!folder) {
    try {
      folder = await tx.folder.create({
        data: {
          name,
          parentId,
          userId,
        },
      });
    } catch (createError: any) {
      if (createError.code === 'P2002') {
        folder = await tx.folder.findFirst({
          where: { name, parentId, userId },
          orderBy: [{ isTrash: 'asc' }, { createdAt: 'asc' }],
        });
        if (!folder) {
          throw createError;
        }
      } else {
        throw createError;
      }
    }
  }

  return folder!;
};

async function getOrCreateFolderPath(
  folderPath: string,
  baseFolderId: string | null,
  userId: string,
  tx: typeof prisma,
  folderCache?: Map<string, string>
): Promise<string | null> {
  const normalized = splitRelativePath(folderPath);
  if (normalized.length === 0) return baseFolderId;

  let currentParentId: string | null = baseFolderId;

  for (const folderName of normalized) {
    const sanitizedFolderName = sanitizeFilename(folderName);
    const cacheKey = `${currentParentId || 'root'}:${sanitizedFolderName}`;
    if (folderCache?.has(cacheKey)) {
      currentParentId = folderCache.get(cacheKey)!;
      continue;
    }

    const folder = await findOrCreateFolder(sanitizedFolderName, currentParentId, userId, tx);
    folderCache?.set(cacheKey, folder.id);
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
    const blockedExtensions = await getBlockedExtensions();

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
    const midiFilesToTranscode: MidiTranscodeItem[] = [];

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
      // Use the HIGHER of user limit or global config (global can raise user limits)
      const maxFileSize = Math.max(Number(user.maxFileSize), globalMaxFileSize);
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

      const resultFiles: FileResponse[] = [];

      for (const file of files) {
        // Sanitize filename and validate MIME type
        const rawName = decodeFilename(file.originalname);
        const originalName = sanitizeFilename(rawName);
        const ext = path.extname(originalName);

        // Check for dangerous extensions
        if (isDangerousExtension(originalName, blockedExtensions)) {
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

        const normalizedMimeType = isMidiFile(file.mimetype, originalName) ? 'audio/midi' : file.mimetype;

        const fileId = uuidv4();
        const filePath = getUserFilePath(userId, fileId, ext);

        await moveFileStorage(file.path, filePath);

        // Queue thumbnail generation for after transaction (with userId for rate limiting)
        filesToGenerateThumbnails.push({ fileId, filePath, mimeType: normalizedMimeType, userId });
        if (isMidiFile(file.mimetype, originalName)) {
          midiFilesToTranscode.push({ fileId, filePath, userId });
        }

        const dbFile = await tx.file.create({
          data: {
            id: fileId,
            name: originalName,
            originalName: originalName,
            mimeType: normalizedMimeType,
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

    await queueMidiTranscodes(midiFilesToTranscode);

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
    const blockedExtensions = await getBlockedExtensions();

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
    const midiFilesToTranscode: MidiTranscodeItem[] = [];

    const uploadedFiles = await prisma.$transaction(async (tx) => {
      // Check quota inside transaction
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const totalSize = files.reduce((sum: number, file: Express.Multer.File) => sum + file.size, 0);
      const remainingQuota = Number(user.storageQuota) - Number(user.storageUsed) - Number(user.tempStorage || 0);

      // Use the HIGHER of user limit or global config (global can raise user limits)
      const maxFileSize = Math.max(Number(user.maxFileSize), globalMaxFileSize);
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

      const resultFiles: FileResponse[] = [];
      let accumulatedSize = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const decodedOriginalname = decodeFilename(file.originalname);
        const relativePath = decodeFilename(relativePaths[i] || decodedOriginalname);

        // Parse folder path from relative path
        const pathParts = splitRelativePath(relativePath);
        const rawFileName = pathParts.pop() || decodedOriginalname;
        const fileName = sanitizeFilename(rawFileName);
        const folderPath = pathParts.join('/');

        // Check for dangerous extensions
        if (isDangerousExtension(fileName, blockedExtensions)) {
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

        const normalizedMimeType = isMidiFile(file.mimetype, fileName) ? 'audio/midi' : file.mimetype;

        // Get or create the target folder
        let targetFolderId: string | null = baseFolderId;
        if (folderPath) {
          targetFolderId = await getOrCreateFolderPath(folderPath, baseFolderId, userId, tx as any, folderCache);
        }

        const fileId = uuidv4();
        const ext = path.extname(fileName);
        const filePath = getUserFilePath(userId, fileId, ext);

        await moveFileStorage(file.path, filePath);

        // Queue thumbnail generation for after transaction (with userId for rate limiting)
        filesToGenerateThumbnails.push({ fileId, filePath, mimeType: normalizedMimeType, userId });
        if (isMidiFile(file.mimetype, fileName)) {
          midiFilesToTranscode.push({ fileId, filePath, userId });
        }

        const dbFile = await tx.file.create({
          data: {
            id: fileId,
            name: fileName,
            originalName: fileName,
            mimeType: normalizedMimeType,
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

    await queueMidiTranscodes(midiFilesToTranscode);

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
    const blockedExtensions = await getBlockedExtensions();

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
      if (isDangerousExtension(sanitizedName, blockedExtensions)) {
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
    const blockedExtensions = await getBlockedExtensions();

    // Validate filename
    if (isDangerousExtension(sanitizedFilename, blockedExtensions)) {
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
    const normalizedMimeType = isMidiFile(effectiveMimeType, sanitizedFilename) ? 'audio/midi' : effectiveMimeType;
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
      // Use the HIGHER of user limit or global config (global can raise user limits)
      const maxFileSize = BigInt(Math.max(Number(user.maxFileSize), globalMaxFileSize));
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
          mimeType: normalizedMimeType,
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
    const blockedExtensions = await getBlockedExtensions();

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
          file: {
            ...existing,
            mimeType: normalizeMimeType(existing.mimeType, existing.name),
            size: existing.size.toString(),
          },
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
    if (isDangerousExtension(session.filename, blockedExtensions)) {
      await deleteFile(req.file.path);
      await cleanupChunks(uploadId, userId);
      logger.warn('Dangerous extension in chunk upload', { filename: session.filename, userId });
      res.status(400).json({ error: 'File type not allowed', code: UPLOAD_ERROR_CODES.DANGEROUS_EXTENSION });
      return;
    }

    const effectiveMimeType = session.mimeType || mimeType || 'application/octet-stream';
    const normalizedMimeType = isMidiFile(effectiveMimeType, session.filename) ? 'audio/midi' : effectiveMimeType;
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
            res.json({
              completed: true,
              file: {
                ...existing,
                mimeType: normalizeMimeType(existing.mimeType, existing.name),
                size: existing.size.toString(),
              },
            });
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
              mimeType: normalizedMimeType,
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
        generateThumbnail(filePath, fileId, normalizedMimeType)
          .then(async (thumbnailPath) => {
            if (thumbnailPath) {
              const lqip = await generateLqip(thumbnailPath);
              await prisma.file.update({
                where: { id: fileId },
                data: { thumbnailPath, lqip },
              }).catch(() => { });
            }
          })
          .catch(() => { });

        const shouldTranscodeMidi = isMidiFile(normalizedMimeType, session.filename);
        if (shouldTranscodeMidi) {
          await addMidiTranscodingJob(fileId, filePath, userId);
        }

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

    const pageNumRaw = parseInt(page as string, 10);
    const limitNumRaw = parseInt(limit as string, 10);
    const pageNum = Number.isFinite(pageNumRaw) && pageNumRaw > 0 ? pageNumRaw : 1;
    const limitNum = Number.isFinite(limitNumRaw)
      ? Math.min(Math.max(limitNumRaw, 1), 100)
      : 50;
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
          where.OR = [
            { mimeType: { startsWith: 'audio/' } },
            { mimeType: { in: Array.from(MIDI_MIME_TYPES) } },
            { name: { endsWith: '.mid', mode: 'insensitive' } },
            { name: { endsWith: '.midi', mode: 'insensitive' } },
          ];
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
      files: files.map((f: any) => ({
        ...f,
        mimeType: normalizeMimeType(f.mimeType, f.name),
        size: f.size.toString(),
      })),
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

    res.json({
      ...file,
      mimeType: normalizeMimeType(file.mimeType, file.name),
      size: file.size.toString(),
    });
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
    const blockedExtensions = await getBlockedExtensions();

    const sanitizedName = sanitizeFilename(name);
    if (isDangerousExtension(sanitizedName, blockedExtensions)) {
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

    res.json({
      ...updated,
      mimeType: normalizeMimeType(updated.mimeType, updated.name),
      size: updated.size.toString(),
    });
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

    res.json({
      ...updated,
      mimeType: normalizeMimeType(updated.mimeType, updated.name),
      size: updated.size.toString(),
    });
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

    res.json({
      ...updated,
      mimeType: normalizeMimeType(updated.mimeType, updated.name),
      size: updated.size.toString(),
    });
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
      if (file.transcodedPath) {
        await deleteFile(file.transcodedPath);
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

    if (isMidiFile(file.mimeType, file.name)) {
      const transcodedPath = file.transcodedPath || getStoragePath('files', userId, `${id}_transcoded.mp3`);
      if (await fileExists(transcodedPath)) {
        const transcodedStat = await fs.stat(transcodedPath);
            return streamFile(req, res, { path: transcodedPath, mimeType: 'audio/mpeg', name: file.name }, transcodedStat, id);
      }

      const existingStatus = await getTranscodingJobStatus(id);
      if (!existingStatus || existingStatus.status === 'FAILED' || existingStatus.status === 'CANCELLED') {
        await addMidiTranscodingJob(id, file.path, userId);
      }

      if (existingStatus) {
        res.status(202).json({
          message: 'MIDI rendering in progress',
          jobId: id,
          status: existingStatus.status,
          progress: existingStatus.progress,
        });
        return;
      }

      res.status(202).json({
        message: 'MIDI rendering started',
        jobId: id,
        status: 'queued',
        progress: 0,
      });
      return;
    }

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
            return streamFile(req, res, { path: transcodedPath, mimeType: 'video/mp4', name: file.name }, transcodedStat, id);
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

    return streamFile(req, res, file, stat, id);
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

    // ExcelJS preview only supports .xlsx (OOXML). Treat legacy .xls as unsupported.
    if (file.name.toLowerCase().endsWith('.xls') && !file.name.toLowerCase().endsWith('.xlsx')) {
      res.status(400).json({
        error: 'Unsupported spreadsheet format',
        code: 'UNSUPPORTED_SPREADSHEET_FORMAT',
        details: { extension: '.xls' },
      });
      return;
    }

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

    let preview;
    try {
      preview = await buildExcelHtmlPreview(file.path, sheetIndex);
    } catch (error) {
      if (error instanceof Error && error.message === 'NO_SHEETS') {
        res.status(400).json({ error: 'No worksheets found' });
        return;
      }
      throw error;
    }

    res.json({
      html: preview.html,
      sheetNames: preview.sheetNames,
      currentSheet: preview.currentSheet,
      fileName: file.name
    });
  } catch (error) {
    logger.error(
      'Excel to HTML error',
      {
        fileId: req.params.id,
        sheet: req.query.sheet,
      },
      error instanceof Error ? error : undefined
    );

    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: 'Failed to convert Excel file',
      code: 'EXCEL_PREVIEW_FAILED',
      details: isProd
        ? undefined
        : {
          message: error instanceof Error ? error.message : String(error),
        },
    });
  }
});

// Transcoding status for MIDI playback
router.get('/:id/transcoding-status', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (!isValidUUID(id)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const result = await findFile(id, userId);

    if (result.error === 'invalid_id') {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const file = result.file;
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!isMidiFile(file.mimeType, file.name)) {
      res.json({ ready: true, status: 'completed', progress: 100 });
      return;
    }

    const transcodedPath = file.transcodedPath || getStoragePath('files', userId, `${id}_transcoded.mp3`);
    if (await fileExists(transcodedPath)) {
      res.json({ ready: true, status: 'completed', progress: 100 });
      return;
    }

    const existingStatus = await getTranscodingJobStatus(id);
    if (!existingStatus || existingStatus.status === 'FAILED' || existingStatus.status === 'CANCELLED') {
      await addMidiTranscodingJob(id, file.path, userId);
    }

    res.json({
      ready: false,
      status: existingStatus?.status ?? 'queued',
      progress: existingStatus?.progress ?? 0,
      error: existingStatus?.error,
    });
  } catch (error) {
    logger.error('Transcoding status error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to get transcoding status' });
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

    if (isMidiFile(file.mimeType, file.name)) {
      const transcodedPath = file.transcodedPath || getStoragePath('files', userId, `${id}_transcoded.mp3`);
      if (await fileExists(transcodedPath)) {
        const transcodedStat = await fs.stat(transcodedPath);
        return streamFile(req, res, { path: transcodedPath, mimeType: 'audio/mpeg', name: file.name }, transcodedStat, id);
      }

      const existingStatus = await getTranscodingJobStatus(id);
      if (!existingStatus || existingStatus.status === 'FAILED' || existingStatus.status === 'CANCELLED') {
        await addMidiTranscodingJob(id, file.path, userId);
      }

      res.status(202).json({
        message: 'MIDI rendering in progress',
        jobId: id,
        status: existingStatus?.status ?? 'queued',
        progress: existingStatus?.progress ?? 0,
      });
      return;
    }

    return streamFile(req, res, file, stat, id);
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
    const blockedExtensions = await getBlockedExtensions();

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
    if (isDangerousExtension(sanitizedName, blockedExtensions)) {
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

      // Ensure file listings reflect the new file immediately (list endpoint is cached).
      await Promise.all([
        cache.invalidateAfterFileChange(userId, fileId),
        cache.invalidateFolders(userId),
      ]);

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

    const cached = await cache.getSignedUrl(userId, id, action);
    if (cached && new Date(cached.expiresAt).getTime() > Date.now()) {
      const existingTokens = getFileAccessTokens(req);
      const updatedTokens = addFileAccessToken(existingTokens, cached.token);
      setFileAccessCookie(res, updatedTokens);

      res.json({
        signedUrl: cached.signedUrl,
        expiresAt: cached.expiresAt,
      });
      return;
    }

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
    const host = req.get('x-forwarded-host') || req.get('host');
    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
    const origin = host ? `${protocol}://${host}` : config.frontendUrl.replace(/\/$/, '');
    const signedUrl = `${origin.replace(/\/$/, '')}/api/files/${id}/${action}`;

    await cache.setSignedUrl(userId, id, action, {
      signedUrl,
      expiresAt: expiresAt.toISOString(),
      token,
    });

    res.json({
      signedUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error('Generate signed URL error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

// Batch signed URLs
router.post('/batch-signed-urls', authenticate, validate(batchSignedUrlsSchema), async (req: Request, res: Response) => {
  try {
    const { fileIds, action } = req.body as { fileIds: string[]; action: 'view' | 'download' | 'stream' | 'thumbnail' };
    const userId = req.user!.userId;

    const uniqueFileIds = Array.from(new Set(fileIds));
    const files = await prisma.file.findMany({
      where: { id: { in: uniqueFileIds }, userId, isTrash: false },
      select: { id: true },
    });

    const foundIds = new Set(files.map((f) => f.id));
    const missingIds = uniqueFileIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      res.status(404).json({ error: 'File not found', missingIds });
      return;
    }

    const host = req.get('x-forwarded-host') || req.get('host');
    const forwardedProto = req.get('x-forwarded-proto');
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
    const origin = host ? `${protocol}://${host}` : config.frontendUrl.replace(/\/$/, '');

    let updatedTokens = getFileAccessTokens(req);
    const results: { fileId: string; signedUrl: string; expiresAt: string }[] = [];

    for (const fileId of uniqueFileIds) {
      const cached = await cache.getSignedUrl(userId, fileId, action);
      if (cached && new Date(cached.expiresAt).getTime() > Date.now()) {
        updatedTokens = addFileAccessToken(updatedTokens, cached.token);
        results.push({ fileId, signedUrl: cached.signedUrl, expiresAt: cached.expiresAt });
        continue;
      }

      const token = generateSignedUrlToken();
      const expiresAt = new Date(Date.now() + config.signedUrls.expiresIn * 1000);

      await prisma.signedUrl.create({
        data: {
          token,
          fileId,
          userId,
          action,
          expiresAt,
        },
      });

      const signedUrl = `${origin.replace(/\/$/, '')}/api/files/${fileId}/${action}`;
      await cache.setSignedUrl(userId, fileId, action, {
        signedUrl,
        expiresAt: expiresAt.toISOString(),
        token,
      });

      updatedTokens = addFileAccessToken(updatedTokens, token);
      results.push({ fileId, signedUrl, expiresAt: expiresAt.toISOString() });
    }

    setFileAccessCookie(res, updatedTokens);

    // Clean up expired signed URLs (async, don't wait)
    prisma.signedUrl.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }).catch(() => { });

    res.json({ urls: results });
  } catch (error) {
    logger.error('Batch signed URLs error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to generate signed URLs' });
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
        if (file.transcodedPath) {
          await deleteFile(file.transcodedPath);
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
          where.OR = [
            { mimeType: { startsWith: 'audio/' } },
            { mimeType: { in: Array.from(MIDI_MIME_TYPES) } },
            { name: { endsWith: '.mid', mode: 'insensitive' } },
            { name: { endsWith: '.midi', mode: 'insensitive' } },
          ];
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
    if (tagId) {
      const fileTags = await prisma.fileTag.findMany({
        where: { tagId: tagId as string },
        select: { fileId: true },
      });
      const fileIds = fileTags.map(ft => ft.fileId);
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
        mimeType: normalizeMimeType(f.mimeType, f.name),
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
