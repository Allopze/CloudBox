import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { compressionSchema, decompressSchema } from '../schemas/index.js';
import {
  compressToZip,
  extractZip,
  compress7z,
  extract7z,
  cancelJob,
  listZipContents,
  getTempPath
} from '../lib/compression.js';
import { getStoragePath, fileExists, ensureUserDir, getUserFilePath } from '../lib/storage.js';
import path from 'path';
import fs from 'fs/promises';

const router = Router();

// SSE clients for progress updates with timeout cleanup
const sseClients = new Map<string, { res: Response; createdAt: number }>();
const SSE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes timeout

// Cleanup stale SSE connections periodically
setInterval(() => {
  const now = Date.now();
  for (const [jobId, client] of sseClients.entries()) {
    if (now - client.createdAt > SSE_TIMEOUT_MS) {
      try {
        client.res.end();
      } catch (e) {
        // Connection may already be closed
      }
      sseClients.delete(jobId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Create compression job
router.post('/compress', authenticate, validate(compressionSchema), async (req: Request, res: Response) => {
  try {
    const { paths, format, outputName } = req.body;
    const userId = req.user!.userId;

    // Resolve file paths from IDs
    const inputPaths: string[] = [];
    const tempFolders: string[] = [];

    for (const p of paths) {
      // Check if it's a file ID
      const file = await prisma.file.findFirst({
        where: { id: p, userId, isTrash: false },
      });

      if (file) {
        inputPaths.push(file.path);
        continue;
      }

      // Check if it's a folder ID
      const folder = await prisma.folder.findFirst({
        where: { id: p, userId, isTrash: false },
      });

      if (folder) {
        // Create temp folder with contents
        const tempFolderPath = getTempPath(`folder_${folder.id}`);
        tempFolders.push(tempFolderPath);
        await fs.mkdir(tempFolderPath, { recursive: true });

        const copyFolderContents = async (folderId: string, targetPath: string) => {
          const files = await prisma.file.findMany({
            where: { folderId, isTrash: false },
          });

          for (const f of files) {
            if (await fileExists(f.path)) {
              await fs.copyFile(f.path, path.join(targetPath, f.name));
            }
          }

          const subfolders = await prisma.folder.findMany({
            where: { parentId: folderId, isTrash: false },
          });

          for (const sf of subfolders) {
            const sfPath = path.join(targetPath, sf.name);
            await fs.mkdir(sfPath, { recursive: true });
            await copyFolderContents(sf.id, sfPath);
          }
        };

        await copyFolderContents(folder.id, tempFolderPath);
        inputPaths.push(tempFolderPath);
      }
    }

    if (inputPaths.length === 0) {
      res.status(400).json({ error: 'No valid files or folders found' });
      return;
    }

    const jobId = uuidv4();
    const outputFileName = outputName || `archive_${Date.now()}`;
    const outputPath = getTempPath(`${outputFileName}.${format}`);

    const job = await prisma.compressionJob.create({
      data: {
        id: jobId,
        type: 'COMPRESS',
        inputPaths: JSON.stringify(inputPaths),
        outputPath,
        format,
        userId,
        status: 'PROCESSING',
      },
    });

    // Start compression in background
    (async () => {
      try {
        const onProgress = (progress: { jobId: string; progress: number; currentFile?: string }) => {
          const client = sseClients.get(jobId);
          if (client) {
            client.res.write(`data: ${JSON.stringify(progress)}\n\n`);
          }
        };

        if (format === 'zip') {
          await compressToZip(jobId, inputPaths, outputPath, onProgress);
        } else {
          await compress7z(jobId, inputPaths, outputPath, format as 'zip' | '7z' | 'tar', onProgress);
        }

        // Move to user's files
        await ensureUserDir(userId);
        const fileId = uuidv4();
        const ext = `.${format}`;
        const finalPath = getUserFilePath(userId, fileId, ext);
        await fs.rename(outputPath, finalPath);

        const stats = await fs.stat(finalPath);

        // Create file record
        await prisma.file.create({
          data: {
            id: fileId,
            name: `${outputFileName}.${format}`,
            originalName: `${outputFileName}.${format}`,
            mimeType: format === 'zip' ? 'application/zip' : 'application/octet-stream',
            size: BigInt(stats.size),
            path: finalPath,
            userId,
          },
        });

        // Update storage
        await prisma.user.update({
          where: { id: userId },
          data: { storageUsed: { increment: stats.size } },
        });

        await prisma.compressionJob.update({
          where: { id: jobId },
          data: { status: 'COMPLETED', progress: 100, outputPath: finalPath },
        });

        const client = sseClients.get(jobId);
        if (client) {
          client.res.write(`data: ${JSON.stringify({ jobId, progress: 100, status: 'COMPLETED', fileId })}\n\n`);
          client.res.end();
          sseClients.delete(jobId);
        }

        await prisma.activity.create({
          data: {
            type: 'COMPRESS',
            userId,
            fileId,
            details: JSON.stringify({ format, inputCount: inputPaths.length }),
          },
        });
      } catch (error) {
        console.error('Compression error:', error);
        await prisma.compressionJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', error: String(error) },
        });

        const client = sseClients.get(jobId);
        if (client) {
          client.res.write(`data: ${JSON.stringify({ jobId, status: 'FAILED', error: String(error) })}\n\n`);
          client.res.end();
          sseClients.delete(jobId);
        }
      } finally {
        // Cleanup temp folders
        for (const folder of tempFolders) {
          try {
            await fs.rm(folder, { recursive: true, force: true });
          } catch (e) {
            console.error(`Failed to cleanup temp folder ${folder}:`, e);
          }
        }
      }
    })();

    res.json({ jobId });
  } catch (error) {
    console.error('Create compression job error:', error);
    res.status(500).json({ error: 'Failed to create compression job' });
  }
});

// Decompress file
router.post('/decompress', authenticate, validate(decompressSchema), async (req: Request, res: Response) => {
  try {
    const { fileId, targetFolderId } = req.body;
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id: fileId, userId, isTrash: false },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!['.zip', '.7z', '.tar', '.rar'].includes(ext)) {
      res.status(400).json({ error: 'Unsupported archive format' });
      return;
    }

    // Check quota for ZIP files
    if (ext === '.zip') {
      try {
        const contents = await listZipContents(file.path);
        const totalSize = contents.reduce((acc, item) => acc + BigInt(item.size), BigInt(0));

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user && (user.storageUsed + totalSize > user.storageQuota)) {
          res.status(400).json({ error: 'Not enough storage space to decompress this archive' });
          return;
        }
      } catch (error) {
        console.error('Failed to check zip contents:', error);
        // Continue but warn? Or fail? Safe to fail if we can't verify size.
        res.status(400).json({ error: 'Failed to verify archive contents' });
        return;
      }
    }

    const jobId = uuidv4();
    const extractPath = getTempPath(`extract_${jobId}`);

    const job = await prisma.compressionJob.create({
      data: {
        id: jobId,
        type: 'DECOMPRESS',
        inputPaths: JSON.stringify([file.path]),
        outputPath: extractPath,
        format: ext.slice(1),
        userId,
        status: 'PROCESSING',
      },
    });

    // Start decompression in background
    (async () => {
      try {
        const onProgress = (progress: { jobId: string; progress: number; currentFile?: string }) => {
          const client = sseClients.get(jobId);
          if (client) {
            client.res.write(`data: ${JSON.stringify(progress)}\n\n`);
          }
        };

        if (ext === '.zip') {
          await extractZip(jobId, file.path, extractPath, onProgress);
        } else {
          await extract7z(jobId, file.path, extractPath, onProgress);
        }

        // Create files and folders from extracted content
        const processExtracted = async (dirPath: string, parentFolderId: string | null) => {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
              const folder = await prisma.folder.create({
                data: {
                  name: entry.name,
                  parentId: parentFolderId,
                  userId,
                },
              });

              await processExtracted(entryPath, folder.id);
            } else {
              const stats = await fs.stat(entryPath);
              const newFileId = uuidv4();
              const ext = path.extname(entry.name);
              const newFilePath = getUserFilePath(userId, newFileId, ext);

              await ensureUserDir(userId);
              await fs.rename(entryPath, newFilePath);

              // Determine mime type
              const mimeType = getMimeType(ext);

              await prisma.file.create({
                data: {
                  id: newFileId,
                  name: entry.name,
                  originalName: entry.name,
                  mimeType,
                  size: BigInt(stats.size),
                  path: newFilePath,
                  folderId: parentFolderId,
                  userId,
                },
              });

              // Update storage
              await prisma.user.update({
                where: { id: userId },
                data: { storageUsed: { increment: stats.size } },
              });
            }
          }
        };

        await processExtracted(extractPath, targetFolderId || null);

        // Cleanup
        await fs.rm(extractPath, { recursive: true, force: true });

        await prisma.compressionJob.update({
          where: { id: jobId },
          data: { status: 'COMPLETED', progress: 100 },
        });

        const client = sseClients.get(jobId);
        if (client) {
          client.res.write(`data: ${JSON.stringify({ jobId, progress: 100, status: 'COMPLETED' })}\n\n`);
          client.res.end();
          sseClients.delete(jobId);
        }

        await prisma.activity.create({
          data: {
            type: 'DECOMPRESS',
            userId,
            fileId,
            details: JSON.stringify({ fileName: file.name }),
          },
        });
      } catch (error) {
        console.error('Decompression error:', error);
        await prisma.compressionJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', error: String(error) },
        });

        const client = sseClients.get(jobId);
        if (client) {
          client.res.write(`data: ${JSON.stringify({ jobId, status: 'FAILED', error: String(error) })}\n\n`);
          client.res.end();
          sseClients.delete(jobId);
        }
      }
    })();

    res.json({ jobId });
  } catch (error) {
    console.error('Create decompression job error:', error);
    res.status(500).json({ error: 'Failed to create decompression job' });
  }
});

// SSE endpoint for progress
router.get('/progress/:jobId', authenticate, async (req: Request, res: Response) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  sseClients.set(jobId, { res, createdAt: Date.now() });

  // Send initial status
  const job = await prisma.compressionJob.findUnique({
    where: { id: jobId },
  });

  if (job) {
    res.write(`data: ${JSON.stringify({ jobId, progress: job.progress, status: job.status })}\n\n`);
  }

  req.on('close', () => {
    sseClients.delete(jobId);
  });
});

// Get job status (polling alternative to SSE)
router.get('/status/:jobId', authenticate, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const userId = req.user!.userId;

    const job = await prisma.compressionJob.findFirst({
      where: { id: jobId, userId },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      currentFile: job.currentFile,
      // Use the dedicated error column from the compressionJob record
      error: job.error,
    });
  } catch (error) {
    console.error('Get job status error:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

// Cancel job
router.post('/cancel/:jobId', authenticate, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const userId = req.user!.userId;

    const job = await prisma.compressionJob.findFirst({
      where: { id: jobId, userId },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const cancelled = cancelJob(jobId);

    if (cancelled) {
      await prisma.compressionJob.update({
        where: { id: jobId },
        data: { status: 'CANCELLED' },
      });

      const client = sseClients.get(jobId);
      if (client) {
        client.res.write(`data: ${JSON.stringify({ jobId, status: 'CANCELLED' })}\\n\\n`);
        client.res.end();
        sseClients.delete(jobId);
      }
    }

    res.json({ cancelled });
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// List job history
router.get('/jobs', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const jobs = await prisma.compressionJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(jobs);
  } catch (error) {
    console.error('List jobs error:', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// List archive contents
router.get('/list/:fileId', authenticate, async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id: fileId, userId },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const ext = path.extname(file.name).toLowerCase();
    if (ext !== '.zip') {
      res.status(400).json({ error: 'Only ZIP files can be listed' });
      return;
    }

    const contents = await listZipContents(file.path);
    res.json(contents);
  } catch (error) {
    console.error('List archive error:', error);
    res.status(500).json({ error: 'Failed to list archive contents' });
  }
});

// Helper function for mime types
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.zip': 'application/zip',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.rar': 'application/vnd.rar',
  };

  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

export default router;
