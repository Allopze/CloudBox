import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { uploadFile, uploadChunk } from '../middleware/upload.js';
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
} from '../lib/storage.js';
import { generateThumbnail } from '../lib/thumbnail.js';
import { config } from '../config/index.js';

const router = Router();

// Upload single/multiple files
router.post('/upload', authenticate, uploadFile.array('files', 20), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const folderId = req.body.folderId || null;

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    // Check quota
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
    const remainingQuota = Number(user.storageQuota) - Number(user.storageUsed);

    if (totalSize > remainingQuota) {
      // Clean up temp files
      for (const file of req.files) {
        await deleteFile(file.path);
      }
      res.status(400).json({ error: 'Storage quota exceeded' });
      return;
    }

    // Check max file size
    for (const file of req.files) {
      if (file.size > Number(user.maxFileSize)) {
        for (const f of req.files) {
          await deleteFile(f.path);
        }
        res.status(400).json({ error: `File ${file.originalname} exceeds maximum size limit` });
        return;
      }
    }

    await ensureUserDir(userId);

    const uploadedFiles = [];

    for (const file of req.files) {
      const fileId = uuidv4();
      const ext = path.extname(file.originalname);
      const filePath = getUserFilePath(userId, fileId, ext);

      await moveFileStorage(file.path, filePath);

      // Generate thumbnail
      let thumbnailPath: string | null = null;
      try {
        thumbnailPath = await generateThumbnail(filePath, fileId, file.mimetype);
      } catch (e) {
        console.error('Thumbnail generation failed:', e);
      }

      const dbFile = await prisma.file.create({
        data: {
          id: fileId,
          name: file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: BigInt(file.size),
          path: filePath,
          thumbnailPath,
          folderId: folderId || null,
          userId,
        },
      });

      // Update storage used
      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: file.size } },
      });

      // Log activity
      await prisma.activity.create({
        data: {
          type: 'UPLOAD',
          userId,
          fileId: dbFile.id,
          details: JSON.stringify({ name: file.originalname, size: file.size }),
        },
      });

      uploadedFiles.push({
        ...dbFile,
        size: dbFile.size.toString(),
      });
    }

    res.status(201).json(uploadedFiles);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Chunked upload - initialize
router.post('/upload/init', authenticate, async (req: Request, res: Response) => {
  try {
    const { filename, totalChunks, totalSize, folderId } = req.body;
    const userId = req.user!.userId;

    // Check quota
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
    const { uploadId, chunkIndex, totalChunks, filename, mimeType, totalSize, folderId } = req.body;
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

      // Update storage used
      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: parseInt(totalSize) } },
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

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
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

    const updated = await prisma.file.update({
      where: { id },
      data: { folderId },
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

      // Update storage used
      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { decrement: Number(file.size) } },
      });
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
router.get('/:id/download', authenticate, async (req: Request, res: Response) => {
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

// Stream/play file
router.get('/:id/stream', authenticate, async (req: Request, res: Response) => {
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

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const stat = await fs.stat(file.path);
    const range = req.headers.range;

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
      stream.pipe(res);
    } else {
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Accept-Ranges', 'bytes');
      res.sendFile(file.path);
    }
  } catch (error) {
    console.error('Stream file error:', error);
    res.status(500).json({ error: 'Failed to stream file' });
  }
});

// View file (alias for stream, for compatibility)
router.get('/:id/view', authenticate, async (req: Request, res: Response) => {
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

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const stat = await fs.stat(file.path);
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
      stream.pipe(res);
    } else {
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Accept-Ranges', 'bytes');
      res.sendFile(file.path);
    }
  } catch (error) {
    console.error('View file error:', error);
    res.status(500).json({ error: 'Failed to view file' });
  }
});

// Get thumbnail
router.get('/:id/thumbnail', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id, userId },
    });

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
