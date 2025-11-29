import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma, { updateParentFolderSizes } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { authOptional } from '../middleware/authOptional.js';
import { uploadFile, uploadChunk, decodeFilename } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { renameFileSchema, moveFileSchema } from '../schemas/index.js';
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
} from '../lib/storage.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { config } from '../config/index.js';
import { sanitizeFilename, validateMimeType, isDangerousExtension, checkUserRateLimit } from '../lib/security.js';
import { auditLog } from '../lib/audit.js';
import ExcelJS from 'exceljs';

const router = Router();

// Upload single/multiple files
router.post('/upload', authenticate, uploadFile.array('files', 20), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const folderId = req.body.folderId || null;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    // Rate limiting per user for uploads
    const rateLimit = checkUserRateLimit(userId, 50, 60000); // 50 uploads per minute
    if (!rateLimit.allowed) {
      await auditLog({
        action: 'FILE_UPLOAD',
        userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'],
        details: { reason: 'rate_limit', blocked: true },
        success: false,
      });
      res.status(429).json({ error: 'Too many uploads. Please wait a moment.' });
      return;
    }

    const uploadedFiles = await prisma.$transaction(async (tx) => {
      // Check quota inside transaction
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const totalSize = files.reduce((sum: number, file: Express.Multer.File) => sum + file.size, 0);
      const remainingQuota = Number(user.storageQuota) - Number(user.storageUsed);

      if (totalSize > remainingQuota) {
        throw new Error('Storage quota exceeded');
      }

      // Check max file size
      for (const file of files) {
        if (file.size > Number(user.maxFileSize)) {
          throw new Error(`File ${decodeFilename(file.originalname)} exceeds maximum size limit`);
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

        // Generate thumbnail
        let thumbnailPath: string | null = null;
        try {
          thumbnailPath = await generateThumbnail(filePath, fileId, file.mimetype);
        } catch (e) {
          console.error('Thumbnail generation failed:', e);
        }

        const dbFile = await tx.file.create({
          data: {
            id: fileId,
            name: originalName,
            originalName: originalName,
            mimeType: file.mimetype,
            size: BigInt(file.size),
            path: filePath,
            thumbnailPath,
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

    // Audit log successful upload
    await auditLog({
      action: 'FILE_UPLOAD',
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: { count: uploadedFiles.length, totalSize: files.reduce((sum, f) => sum + f.size, 0) },
      success: true,
    });

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
    
    console.error('Upload error:', error);
    if (error.message === 'Storage quota exceeded' || 
        error.message.includes('exceeds maximum size limit') ||
        error.message.includes('File type not allowed') ||
        error.message.includes('Invalid file type')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to upload files' });
    }
  }
});

// Upload files with folder structure (drag & drop folders)
router.post('/upload-with-folders', authenticate, uploadFile.array('files', 100), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const baseFolderId = req.body.folderId || null;
    const paths = req.body.paths; // Array of relative paths like "folder/subfolder/file.txt"
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    // Rate limiting per user for uploads
    const rateLimit = checkUserRateLimit(userId, 50, 60000);
    if (!rateLimit.allowed) {
      await auditLog({
        action: 'FILE_UPLOAD',
        userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'],
        details: { reason: 'rate_limit', blocked: true },
        success: false,
      });
      res.status(429).json({ error: 'Too many uploads. Please wait a moment.' });
      return;
    }

    // Normalize paths to array
    const relativePaths: string[] = Array.isArray(paths) ? paths : (paths ? [paths] : []);

    const uploadedFiles = await prisma.$transaction(async (tx) => {
      // Check quota inside transaction
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const totalSize = files.reduce((sum: number, file: Express.Multer.File) => sum + file.size, 0);
      const remainingQuota = Number(user.storageQuota) - Number(user.storageUsed);

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

          // Check if folder exists
          let folder = await tx.folder.findFirst({
            where: {
              name: sanitizedFolderName,
              parentId: currentParentId,
              userId,
            },
          });

          if (!folder) {
            // Create the folder
            folder = await tx.folder.create({
              data: {
                name: sanitizedFolderName,
                parentId: currentParentId,
                userId,
              },
            });
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

        // Generate thumbnail
        let thumbnailPath: string | null = null;
        try {
          thumbnailPath = await generateThumbnail(filePath, fileId, file.mimetype);
        } catch (e) {
          console.error('Thumbnail generation failed:', e);
        }

        const dbFile = await tx.file.create({
          data: {
            id: fileId,
            name: fileName,
            originalName: fileName,
            mimeType: file.mimetype,
            size: BigInt(file.size),
            path: filePath,
            thumbnailPath,
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

    // Audit log
    await auditLog({
      action: 'FILE_UPLOAD',
      userId,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
      details: { count: uploadedFiles.length, withFolders: true },
      success: true,
    });

    res.status(201).json(uploadedFiles);
  } catch (error: any) {
    // Clean up temp files
    const files = req.files as Express.Multer.File[] | undefined;
    if (files && Array.isArray(files)) {
      for (const file of files) {
        await deleteFile(file.path);
      }
    }
    
    console.error('Upload with folders error:', error);
    if (error.message === 'Storage quota exceeded') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to upload files' });
    }
  }
});

// Chunked upload - initialize
router.post('/upload/init', authenticate, async (req: Request, res: Response) => {
  try {
    const { filename, totalChunks, totalSize, folderId } = req.body;
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (totalSize > Number(user.maxFileSize)) {
      res.status(400).json({ error: 'File exceeds maximum size limit' });
      return;
    }

    const remainingQuota = Number(user.storageQuota) - Number(user.storageUsed);
    if (totalSize > remainingQuota) {
      res.status(400).json({ error: 'Storage quota exceeded' });
      return;
    }

    const uploadId = uuidv4();

    res.json({ uploadId, totalChunks });
  } catch (error) {
    console.error('Init upload error:', error);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
});

// Chunked upload - upload chunk
router.post('/upload/chunk', authenticate, uploadChunk.single('chunk'), async (req: Request, res: Response) => {
  try {
    const { uploadId, chunkIndex, totalChunks, filename: rawFilename, mimeType, totalSize, folderId } = req.body;
    const filename = decodeFilename(rawFilename);
    const userId = req.user!.userId;

    if (!req.file) {
      res.status(400).json({ error: 'No chunk uploaded' });
      return;
    }

    const chunkPath = getChunkPath(uploadId, parseInt(chunkIndex));
    await fs.mkdir(path.dirname(chunkPath), { recursive: true });
    await moveFileStorage(req.file.path, chunkPath);

    // Save chunk info
    await prisma.fileChunk.create({
      data: {
        uploadId,
        chunkIndex: parseInt(chunkIndex),
        totalChunks: parseInt(totalChunks),
        path: chunkPath,
        size: BigInt(req.file.size),
      },
    });

    // Check if all chunks are uploaded
    const chunks = await prisma.fileChunk.findMany({
      where: { uploadId },
      orderBy: { chunkIndex: 'asc' },
    });

    if (chunks.length === parseInt(totalChunks)) {
      // Merge chunks
      const fileId = uuidv4();
      const ext = path.extname(filename);
      const filePath = getUserFilePath(userId, fileId, ext);

      await ensureUserDir(userId);

      const writeStream = await fs.open(filePath, 'w');
      for (const chunk of chunks) {
        const chunkData = await fs.readFile(chunk.path);
        await writeStream.write(chunkData);
        await deleteFile(chunk.path);
      }
      await writeStream.close();

      // Clean up chunk directory
      await deleteDirectory(getStoragePath('chunks', uploadId));

      // Delete chunk records
      await prisma.fileChunk.deleteMany({ where: { uploadId } });

      // Generate thumbnail
      let thumbnailPath: string | null = null;
      try {
        thumbnailPath = await generateThumbnail(filePath, fileId, mimeType);
      } catch (e) {
        console.error('Thumbnail generation failed:', e);
      }

      const dbFile = await prisma.file.create({
        data: {
          id: fileId,
          name: filename,
          originalName: filename,
          mimeType,
          size: BigInt(totalSize),
          path: filePath,
          thumbnailPath,
          folderId: folderId || null,
          userId,
        },
      });

      // Update folder sizes
      await updateParentFolderSizes(folderId || null, parseInt(totalSize), prisma, 'increment');

      // Update storage used
      await prisma.user.update({
        where: { id: userId },
        data: {
          storageUsed: { increment: parseInt(totalSize) },
        },
      });

      // Log activity
      await prisma.activity.create({
        data: {
          type: 'UPLOAD',
          userId,
          fileId: dbFile.id,
          details: JSON.stringify({ name: filename, size: totalSize }),
        },
      });

      res.json({
        completed: true,
        file: {
          ...dbFile,
          size: dbFile.size.toString(),
        },
      });
    } else {
      res.json({
        completed: false,
        uploadedChunks: chunks.length,
        totalChunks: parseInt(totalChunks),
      });
    }
  } catch (error) {
    console.error('Chunk upload error:', error);
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

    const where: any = {
      userId,
      isTrash: false,
    };

    if (folderId === 'null' || folderId === '') {
      where.folderId = null;
    } else if (folderId) {
      where.folderId = folderId;
    }

    if (search) {
      where.name = { contains: search as string };
    }

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
          where.mimeType = {
            in: [
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/plain',
            ],
          };
          break;
      }
    }

    if (favorite === 'true') {
      where.isFavorite = true;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

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

    res.json({
      files: files.map((f: any) => ({ ...f, size: f.size.toString() })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Get single file
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json({ ...file, size: file.size.toString() });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// Rename file
router.patch('/:id/rename', authenticate, validate(renameFileSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: { name },
    });

    await prisma.activity.create({
      data: {
        type: 'RENAME',
        userId,
        fileId: id,
        details: JSON.stringify({ oldName: file.name, newName: name }),
      },
    });

    res.json({ ...updated, size: updated.size.toString() });
  } catch (error) {
    console.error('Rename file error:', error);
    res.status(500).json({ error: 'Failed to rename file' });
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

    res.json({ ...updated, size: updated.size.toString() });
  } catch (error) {
    console.error('Move file error:', error);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// Toggle favorite
router.patch('/:id/favorite', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: { isFavorite: !file.isFavorite },
    });

    res.json({ ...updated, size: updated.size.toString() });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

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

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Download file
router.get('/:id/download', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const file = await prisma.file.findFirst({
      where: { id, userId, isTrash: false },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!await fileExists(file.path)) {
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
      // Streaming / resume support
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
      stream.pipe(res);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', stat.size);
      res.sendFile(file.path);
    }
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

const findFile = async (id: string, userId?: string) => {
  const file = await prisma.file.findFirst({
    where: { 
      id,
      isTrash: false,
      ...(userId && { userId }),
    },
  });

  if (file) {
    return file;
  }

  if (!userId) {
    const share = await prisma.share.findFirst({
      where: {
        fileId: id,
        type: 'PUBLIC',
      },
    });
    if (share) {
      return prisma.file.findFirst({
        where: { id, isTrash: false }
      });
    }
  }

  return null;
};

// Stream/play file
router.get('/:id/stream', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const file = await findFile(id, userId);

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const stat = await fs.stat(file.path);

    // For video transcoding to MP4
    if (req.query.transcode === 'true' && file.mimeType.startsWith('video/') && !file.mimeType.includes('mp4')) {
      const { spawn } = await import('child_process');
      
      res.setHeader('Content-Type', 'video/mp4');
      
      const ffmpeg = spawn('ffmpeg', [
        '-i', file.path,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-movflags', 'frag_keyframe+empty_moov',
        '-f', 'mp4',
        'pipe:1'
      ]);

      ffmpeg.stdout.pipe(res);
      ffmpeg.stderr.on('data', () => {}); // Suppress ffmpeg logs

      req.on('close', () => {
        ffmpeg.kill('SIGTERM');
      });

      return;
    }

    return streamFile(req, res, file, stat);
  } catch (error) {
    console.error('Stream file error:', error);
    res.status(500).json({ error: 'Failed to stream file' });
  }
});

// Convert Excel to HTML with styles
router.get('/:id/excel-html', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sheetIndex = parseInt(req.query.sheet as string) || 0;
    const userId = req.user?.userId;

    const file = await findFile(id, userId);
    
    if (!file) {
      res.status(404).json({ error: 'File not found' });
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
    console.error('Excel to HTML error:', error);
    res.status(500).json({ error: 'Failed to convert Excel file' });
  }
});

// View file (alias for stream, for compatibility)
router.get('/:id/view', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const file = await findFile(id, userId);
    
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const stat = await fs.stat(file.path);
    return streamFile(req, res, file, stat);
  } catch (error) {
    console.error('View file error:', error);
    res.status(500).json({ error: 'Failed to view file' });
  }
});

// Get thumbnail
router.get('/:id/thumbnail', authOptional, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const file = await findFile(id, userId);

    if (!file || !file.thumbnailPath) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }

    if (await fileExists(file.thumbnailPath)) {
      res.sendFile(file.thumbnailPath);
    } else {
      res.status(404).json({ error: 'Thumbnail not found' });
    }
  } catch (error) {
    console.error('Get thumbnail error:', error);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

// Create empty file
router.post('/create-empty', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, folderId } = req.body;
    const userId = req.user!.userId;

    if (!name) {
      res.status(400).json({ error: 'File name is required' });
      return;
    }

    await ensureUserDir(userId);

    const fileId = uuidv4();
    const ext = path.extname(name) || '.txt';
    const filePath = getUserFilePath(userId, fileId, ext);

    await fs.writeFile(filePath, '');

    const mimeType = ext === '.txt' ? 'text/plain' : 'application/octet-stream';

    const dbFile = await prisma.file.create({
      data: {
        id: fileId,
        name,
        originalName: name,
        mimeType,
        size: BigInt(0),
        path: filePath,
        folderId: folderId || null,
        userId,
      },
    });

    res.status(201).json({ ...dbFile, size: '0' });
  } catch (error) {
    console.error('Create empty file error:', error);
    res.status(500).json({ error: 'Failed to create file' });
  }
});

export default router;
