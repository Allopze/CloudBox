import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createShareSchema, addCollaboratorSchema, publicLinkPasswordSchema } from '../schemas/index.js';
import { fileExists, isValidUUID } from '../lib/storage.js';
import { shareRateLimiter } from '../middleware/shareRateLimiter.js';
import archiver from 'archiver';
import { config } from '../config/index.js';
import logger from '../lib/logger.js';

const router = Router();

// Create share
router.post('/', authenticate, validate(createShareSchema), async (req: Request, res: Response) => {
  try {
    const { fileId, folderId, type, password, expiresAt, downloadLimit } = req.body;
    const userId = req.user!.userId;

    if (!fileId && !folderId) {
      res.status(400).json({ error: 'Either fileId or folderId is required' });
      return;
    }

    // Verify ownership
    if (fileId) {
      const file = await prisma.file.findFirst({
        where: { id: fileId, userId },
      });
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
    }

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId },
      });
      if (!folder) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }
    }

    const shareData: any = {
      type,
      fileId,
      folderId,
      ownerId: userId,
    };

    if (type === 'PUBLIC') {
      shareData.publicToken = uuidv4();
      if (password) {
        shareData.password = await bcrypt.hash(password, 10);
      }
      if (expiresAt) {
        shareData.expiresAt = new Date(expiresAt);
      }
      if (downloadLimit) {
        shareData.downloadLimit = downloadLimit;
      }
    }

    const share = await prisma.share.create({
      data: shareData,
      include: {
        file: { select: { id: true, name: true, mimeType: true, size: true } },
        folder: { select: { id: true, name: true } },
      },
    });

    await prisma.activity.create({
      data: {
        type: 'SHARE',
        userId,
        fileId,
        folderId,
        details: JSON.stringify({ type, hasPassword: !!password }),
      },
    });

    res.status(201).json({
      ...share,
      file: share.file ? { ...share.file, size: share.file.size?.toString() } : null,
      publicUrl: share.publicToken ? `/share/${share.publicToken}` : null,
    });
  } catch (error) {
    logger.error('Create share error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

// Add collaborator
router.post('/:id/collaborators', authenticate, validate(addCollaboratorSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, permission } = req.body;
    const userId = req.user!.userId;

    const share = await prisma.share.findFirst({
      where: { id, ownerId: userId },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.id === userId) {
      res.status(400).json({ error: 'Cannot share with yourself' });
      return;
    }

    const existingCollab = await prisma.shareCollaborator.findFirst({
      where: { shareId: id, userId: targetUser.id },
    });

    if (existingCollab) {
      await prisma.shareCollaborator.update({
        where: { id: existingCollab.id },
        data: { permission },
      });
    } else {
      await prisma.shareCollaborator.create({
        data: {
          shareId: id,
          userId: targetUser.id,
          permission,
        },
      });
    }

    res.json({ message: 'Collaborator added successfully' });
  } catch (error) {
    logger.error('Add collaborator error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

// Remove collaborator
router.delete('/:id/collaborators/:userId', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, userId: targetUserId } = req.params;
    const userId = req.user!.userId;

    const share = await prisma.share.findFirst({
      where: { id, ownerId: userId },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    await prisma.shareCollaborator.deleteMany({
      where: { shareId: id, userId: targetUserId },
    });

    res.json({ message: 'Collaborator removed successfully' });
  } catch (error) {
    logger.error('Remove collaborator error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

// List shares by me
router.get('/by-me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const shares = await prisma.share.findMany({
      where: { ownerId: userId },
      include: {
        file: { select: { id: true, name: true, mimeType: true, size: true } },
        folder: { select: { id: true, name: true } },
        collaborators: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(shares.map((s: any) => ({
      ...s,
      file: s.file ? { ...s.file, size: s.file.size?.toString() } : null,
      publicUrl: s.publicToken ? `/share/${s.publicToken}` : null,
    })));
  } catch (error) {
    logger.error('List shares by me error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to list shares' });
  }
});

// List shares with me
router.get('/with-me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const collaborations = await prisma.shareCollaborator.findMany({
      where: { userId },
      include: {
        share: {
          include: {
            file: { select: { id: true, name: true, mimeType: true, size: true } },
            folder: { select: { id: true, name: true } },
            owner: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(collaborations.map((c: any) => ({
      ...c.share,
      permission: c.permission,
      file: c.share.file ? { ...c.share.file, size: c.share.file.size?.toString() } : null,
    })));
  } catch (error) {
    logger.error('List shares with me error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to list shares' });
  }
});

// Update share
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, expiresAt, downloadLimit } = req.body;
    const userId = req.user!.userId;

    const share = await prisma.share.findFirst({
      where: { id, ownerId: userId },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    const updateData: any = {};
    if (password !== undefined) {
      updateData.password = password ? await bcrypt.hash(password, 10) : null;
    }
    if (expiresAt !== undefined) {
      updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }
    if (downloadLimit !== undefined) {
      updateData.downloadLimit = downloadLimit ? parseInt(downloadLimit) : null;
    }

    const updatedShare = await prisma.share.update({
      where: { id },
      data: updateData,
    });

    res.json(updatedShare);
  } catch (error) {
    logger.error('Update share error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to update share' });
  }
});

// Delete share
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const share = await prisma.share.findFirst({
      where: { id, ownerId: userId },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    await prisma.share.delete({ where: { id } });

    await prisma.activity.create({
      data: {
        type: 'UNSHARE',
        userId,
        fileId: share.fileId,
        folderId: share.folderId,
      },
    });

    res.json({ message: 'Share deleted successfully' });
  } catch (error) {
    logger.error('Delete share error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to delete share' });
  }
});

// Bulk delete shares
router.post('/bulk-delete', authenticate, async (req: Request, res: Response) => {
  try {
    const { shareIds } = req.body;
    const userId = req.user!.userId;

    if (!Array.isArray(shareIds) || shareIds.length === 0) {
      res.status(400).json({ error: 'shareIds array is required' });
      return;
    }

    await prisma.share.deleteMany({
      where: {
        id: { in: shareIds },
        ownerId: userId,
      },
    });

    res.json({ message: 'Shares deleted successfully' });
  } catch (error) {
    logger.error('Bulk delete shares error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to delete shares' });
  }
});

// Get public share info - RATE LIMITED to prevent password brute-force
router.get('/public/:token', shareRateLimiter(), optionalAuth, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const share = await prisma.share.findFirst({
      where: {
        publicToken: token,
        type: 'PUBLIC',
      },
      include: {
        file: { select: { id: true, name: true, mimeType: true, size: true } },
        folder: { select: { id: true, name: true } },
        owner: { select: { name: true } },
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      res.status(410).json({ error: 'This share has expired' });
      return;
    }

    if (share.downloadLimit && share.downloadCount >= share.downloadLimit) {
      res.status(410).json({ error: 'Download limit reached' });
      return;
    }

    if (share.password) {
      const { password } = req.query;
      if (!password || typeof password !== 'string') {
        res.status(401).json({ error: 'Password required', hasPassword: true });
        return;
      }

      const valid = await bcrypt.compare(password, share.password);
      if (!valid) {
        // SECURITY FIX: Record failed password attempt for rate limiting
        res.locals.recordPasswordFailure?.();
        res.status(401).json({ error: 'Invalid password', hasPassword: true });
        return;
      }
      // SECURITY FIX: Clear rate limit on successful password
      res.locals.recordPasswordSuccess?.();
    }

    let files: any[] = [];
    let folders: any[] = [];

    if (share.folderId) {
      [files, folders] = await Promise.all([
        prisma.file.findMany({
          where: { folderId: share.folderId, isTrash: false },
          select: { id: true, name: true, mimeType: true, size: true, updatedAt: true, thumbnailPath: true },
        }),
        prisma.folder.findMany({
          where: { parentId: share.folderId, isTrash: false },
          select: { id: true, name: true, updatedAt: true },
        }),
      ]);
    } else if (share.file) {
      files = [share.file];
    }

    res.json({
      share: {
        id: share.id,
        name: share.file?.name || share.folder?.name,
        hasPassword: !!share.password,
        expiresAt: share.expiresAt,
        allowDownload: true, // Assuming true if not specified in schema, or add field
        downloadLimit: share.downloadLimit,
        downloadCount: share.downloadCount,
      },
      files: files.map(f => ({ ...f, size: f.size?.toString() })),
      folders,
    });
  } catch (error) {
    logger.error('Get public share error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to get share' });
  }
});

// Verify public share password - RATE LIMITED to prevent brute-force
router.post('/public/:token/verify', shareRateLimiter(), validate(publicLinkPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const share = await prisma.share.findFirst({
      where: { publicToken: token, type: 'PUBLIC' },
    });

    if (!share || !share.password) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    const valid = await bcrypt.compare(password, share.password);
    if (!valid) {
      // SECURITY FIX: Record failed password attempt for rate limiting
      res.locals.recordPasswordFailure?.();
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    // SECURITY FIX: Clear rate limit on successful password
    res.locals.recordPasswordSuccess?.();
    res.json({ verified: true });
  } catch (error) {
    logger.error('Verify password error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// Download public file - RATE LIMITED to prevent password brute-force
router.get('/public/:token/download', shareRateLimiter(), async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.query;

    const share = await prisma.share.findFirst({
      where: { publicToken: token, type: 'PUBLIC' },
      include: {
        file: true,
        folder: true,
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      res.status(410).json({ error: 'This share has expired' });
      return;
    }

    if (share.downloadLimit && share.downloadCount >= share.downloadLimit) {
      res.status(410).json({ error: 'Download limit reached' });
      return;
    }

    if (share.password) {
      if (!password || typeof password !== 'string') {
        res.status(401).json({ error: 'Password required' });
        return;
      }

      const valid = await bcrypt.compare(password, share.password);
      if (!valid) {
        // SECURITY FIX: Record failed password attempt for rate limiting
        res.locals.recordPasswordFailure?.();
        res.status(401).json({ error: 'Invalid password' });
        return;
      }
      // SECURITY FIX: Clear rate limit on successful password
      res.locals.recordPasswordSuccess?.();
    }

    // Update download count atomically (prevent race condition)
    const updatedShare = await prisma.share.update({
      where: { id: share.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Double-check limit after increment (atomic check)
    if (share.downloadLimit && updatedShare.downloadCount > share.downloadLimit) {
      // Rollback the increment
      await prisma.share.update({
        where: { id: share.id },
        data: { downloadCount: { decrement: 1 } },
      });
      res.status(410).json({ error: 'Download limit reached' });
      return;
    }

    if (share.file) {
      if (!await fileExists(share.file.path)) {
        logger.warn('Share file exists in DB but not on disk', { shareId: share.id, path: share.file.path });
        res.status(404).json({ error: 'File not found' });
        return;
      }

      // Safe filename encoding for Content-Disposition
      const safeFilename = encodeURIComponent(share.file.name).replace(/['()]/g, escape);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
      res.setHeader('Content-Type', share.file.mimeType);
      res.sendFile(share.file.path);
    } else if (share.folder) {
      // Download folder as ZIP
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.folder.name)}.zip"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);

      const addFolderToArchive = async (folderId: string, archivePath: string) => {
        const files = await prisma.file.findMany({
          where: { folderId, isTrash: false },
        });

        for (const file of files) {
          if (await fileExists(file.path)) {
            archive.file(file.path, { name: `${archivePath}/${file.name}` });
          }
        }

        const subfolders = await prisma.folder.findMany({
          where: { parentId: folderId, isTrash: false },
        });

        for (const subfolder of subfolders) {
          await addFolderToArchive(subfolder.id, `${archivePath}/${subfolder.name}`);
        }
      };

      await addFolderToArchive(share.folder.id, share.folder.name);
      await archive.finalize();
    }
  } catch (error) {
    logger.error('Download public file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to download' });
  }
});

// Download individual file from shared folder - RATE LIMITED to prevent password brute-force
router.get('/public/:token/files/:fileId/download', shareRateLimiter(), async (req: Request, res: Response) => {
  try {
    const { token, fileId } = req.params;
    const { password } = req.query;

    const share = await prisma.share.findFirst({
      where: { publicToken: token, type: 'PUBLIC' },
      include: {
        folder: true,
      },
    });

    if (!share || !share.folderId) {
      res.status(404).json({ error: 'Share not found or not a folder share' });
      return;
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      res.status(410).json({ error: 'This share has expired' });
      return;
    }

    // Issue #3: Validate download limit for individual files too
    if (share.downloadLimit && share.downloadCount >= share.downloadLimit) {
      res.status(410).json({ error: 'Download limit reached' });
      return;
    }

    if (share.password) {
      if (!password || typeof password !== 'string') {
        res.status(401).json({ error: 'Password required' });
        return;
      }

      const valid = await bcrypt.compare(password, share.password);
      if (!valid) {
        // SECURITY FIX: Record failed password attempt for rate limiting
        res.locals.recordPasswordFailure?.();
        res.status(401).json({ error: 'Invalid password' });
        return;
      }
      // SECURITY FIX: Clear rate limit on successful password
      res.locals.recordPasswordSuccess?.();
    }

    // Verify file belongs to shared folder (recursively)
    // For simplicity, we just check if the file exists and is not in trash, 
    // and we trust the ID if we want to be fast, BUT we must ensure it's inside the shared folder.
    // A robust way is to traverse up from file.folderId until we hit share.folderId.

    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.isTrash) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    let isChild = false;
    let currentFolderId = file.folderId;

    // Safety depth limit (using centralized config)
    let depth = 0;
    while (currentFolderId && depth < config.limits.maxShareDepthCheck) {
      if (currentFolderId === share.folderId) {
        isChild = true;
        break;
      }
      const folder = await prisma.folder.findUnique({
        where: { id: currentFolderId },
        select: { parentId: true },
      });
      currentFolderId = folder?.parentId || null;
      depth++;
    }

    if (!isChild) {
      res.status(403).json({ error: 'File does not belong to this share' });
      return;
    }

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    // Increment download count for individual file downloads too (atomic)
    const updatedShare = await prisma.share.update({
      where: { id: share.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Double-check limit after increment
    if (share.downloadLimit && updatedShare.downloadCount > share.downloadLimit) {
      await prisma.share.update({
        where: { id: share.id },
        data: { downloadCount: { decrement: 1 } },
      });
      res.status(410).json({ error: 'Download limit reached' });
      return;
    }

    // Safe filename encoding for Content-Disposition
    const safeFilename = encodeURIComponent(file.name).replace(/['()]/g, escape);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    res.setHeader('Content-Type', file.mimeType);
    res.sendFile(file.path);

  } catch (error) {
    logger.error('Download shared file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

export default router;
