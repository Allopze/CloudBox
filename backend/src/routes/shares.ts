import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createShareSchema, addCollaboratorSchema, publicLinkPasswordSchema } from '../schemas/index.js';
import { fileExists, isValidUUID, streamFile } from '../lib/storage.js';
import { buildExcelHtmlPreview } from '../lib/excelPreview.js';
import { sanitizeFilename } from '../lib/security.js';
import { shareRateLimiter } from '../middleware/shareRateLimiter.js';
import archiver from 'archiver';
import { config } from '../config/index.js';
import logger from '../lib/logger.js';
import * as cache from '../lib/cache.js';

// H-03 SECURITY: Cookie-based share access token
const SHARE_ACCESS_TOKEN_EXPIRY = '1h';
const SHARE_COOKIE_NAME = 'share_access';

interface ShareAccessPayload {
  shareToken: string;
  verified: boolean;
}

// Generate share access token and set as httpOnly cookie
function setShareAccessCookie(res: Response, shareToken: string): void {
  const accessToken = jwt.sign(
    { shareToken, verified: true } as ShareAccessPayload,
    config.jwt.secret,
    { expiresIn: SHARE_ACCESS_TOKEN_EXPIRY }
  );

  res.cookie(`${SHARE_COOKIE_NAME}_${shareToken}`, accessToken, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax',
    maxAge: 60 * 60 * 1000, // 1 hour
    path: '/',
  });
}

// Verify share access from cookie
async function verifyShareAccess(
  req: Request,
  share: { password: string | null; publicToken: string }
): Promise<{ valid: boolean; fromCookie: boolean }> {
  // If no password required, it's valid
  if (!share.password) {
    return { valid: true, fromCookie: false };
  }

  // H-03: First try cookie-based access
  const cookieName = `${SHARE_COOKIE_NAME}_${share.publicToken}`;
  const accessToken = req.cookies?.[cookieName];

  if (accessToken) {
    try {
      const payload = jwt.verify(accessToken, config.jwt.secret) as ShareAccessPayload;
      if (payload.shareToken === share.publicToken && payload.verified) {
        return { valid: true, fromCookie: true };
      }
    } catch {
      // Token invalid/expired, require verification via /verify
    }
  }

  return { valid: false, fromCookie: false };
}

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

      await cache.invalidateAfterShareChange(userId, share.publicToken || undefined);
      if (share.folderId) {
        await cache.invalidateAfterFolderChange(userId);
      }

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

      await cache.invalidateAfterShareChange(userId, share.publicToken || undefined);
      if (share.folderId) {
        await cache.invalidateAfterFolderChange(userId);
      }

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

      await Promise.all([
        cache.invalidateAfterShareChange(userId),
        cache.invalidateAfterFolderChange(userId),
      ]);

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
        file: { select: { id: true, name: true, mimeType: true, size: true, updatedAt: true, thumbnailPath: true } },
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
      const accessResult = await verifyShareAccess(req, { password: share.password, publicToken: token });
      if (!accessResult.valid) {
        res.status(401).json({ error: 'Password required', hasPassword: true });
        return;
      }
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
        allowDownload: share.allowDownload,
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

    // H-03: Set httpOnly cookie for subsequent requests
    setShareAccessCookie(res, token);

    res.json({ verified: true });
  } catch (error) {
    logger.error('Verify password error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

async function fileBelongsToSharedFolder(fileFolderId: string | null, shareFolderId: string): Promise<boolean> {
  let currentFolderId = fileFolderId;
  let depth = 0;

  while (currentFolderId && depth < config.limits.maxShareDepthCheck) {
    if (currentFolderId === shareFolderId) return true;

    const folder = await prisma.folder.findUnique({
      where: { id: currentFolderId },
      select: { parentId: true },
    });

    currentFolderId = folder?.parentId || null;
    depth++;
  }

  return false;
}

// View/stream a file from a public share (for previews)
router.get('/public/:token/files/:fileId/view', shareRateLimiter(), async (req: Request, res: Response) => {
  try {
    const { token, fileId } = req.params;

    if (!isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const share = await prisma.share.findFirst({
      where: { publicToken: token, type: 'PUBLIC' },
      select: {
        id: true,
        fileId: true,
        folderId: true,
        password: true,
        expiresAt: true,
        downloadLimit: true,
        downloadCount: true,
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

    // H-03: Use cookie-based auth
    const accessResult = await verifyShareAccess(req, { password: share.password, publicToken: token });
    if (!accessResult.valid) {
      res.status(401).json({ error: 'Password required', hasPassword: !!share.password });
      return;
    }

    // Ensure the requested file actually belongs to this share
    if (share.fileId && share.fileId !== fileId) {
      res.status(403).json({ error: 'File does not belong to this share' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, path: true, mimeType: true, isTrash: true, folderId: true, thumbnailPath: true },
    });

    if (!file || file.isTrash) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (share.folderId) {
      const isChild = await fileBelongsToSharedFolder(file.folderId, share.folderId);
      if (!isChild) {
        res.status(403).json({ error: 'File does not belong to this share' });
        return;
      }
    }

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const stat = await fs.stat(file.path);
    await streamFile(req, res, file, stat);
  } catch (error) {
    logger.error('View shared file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to view file' });
  }
});

// Excel preview for public share
router.get('/public/:token/files/:fileId/excel-html', shareRateLimiter(), async (req: Request, res: Response) => {
  try {
    const { token, fileId } = req.params;
    const sheetIndex = parseInt(req.query.sheet as string) || 0;

    if (!isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const share = await prisma.share.findFirst({
      where: { publicToken: token, type: 'PUBLIC' },
      select: {
        id: true,
        fileId: true,
        folderId: true,
        password: true,
        expiresAt: true,
        downloadLimit: true,
        downloadCount: true,
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

    const accessResult = await verifyShareAccess(req, { password: share.password, publicToken: token });
    if (!accessResult.valid) {
      res.status(401).json({ error: 'Password required', hasPassword: !!share.password });
      return;
    }

    if (share.fileId && share.fileId !== fileId) {
      res.status(403).json({ error: 'File does not belong to this share' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, path: true, mimeType: true, isTrash: true, folderId: true },
    });

    if (!file || file.isTrash) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (share.folderId) {
      const isChild = await fileBelongsToSharedFolder(file.folderId, share.folderId);
      if (!isChild) {
        res.status(403).json({ error: 'File does not belong to this share' });
        return;
      }
    }

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

    // ExcelJS preview only supports .xlsx (OOXML). Treat legacy .xls as unsupported.
    if (file.name.toLowerCase().endsWith('.xls') && !file.name.toLowerCase().endsWith('.xlsx')) {
      res.status(400).json({
        error: 'Unsupported spreadsheet format',
        code: 'UNSUPPORTED_SPREADSHEET_FORMAT',
        details: { extension: '.xls' },
      });
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
      'Excel preview shared file error',
      {
        fileId: req.params.fileId,
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

// Get a thumbnail from a public share (for previews)
router.get('/public/:token/files/:fileId/thumbnail', shareRateLimiter(), async (req: Request, res: Response) => {
  try {
    const { token, fileId } = req.params;

    if (!isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const share = await prisma.share.findFirst({
      where: { publicToken: token, type: 'PUBLIC' },
      select: {
        id: true,
        fileId: true,
        folderId: true,
        password: true,
        expiresAt: true,
        downloadLimit: true,
        downloadCount: true,
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

    // H-03: Use cookie-based auth
    const accessResult = await verifyShareAccess(req, { password: share.password, publicToken: token });
    if (!accessResult.valid) {
      res.status(401).json({ error: 'Password required', hasPassword: !!share.password });
      return;
    }

    if (share.fileId && share.fileId !== fileId) {
      res.status(403).json({ error: 'File does not belong to this share' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, path: true, mimeType: true, isTrash: true, folderId: true, thumbnailPath: true },
    });

    if (!file || file.isTrash) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (share.folderId) {
      const isChild = await fileBelongsToSharedFolder(file.folderId, share.folderId);
      if (!isChild) {
        res.status(403).json({ error: 'File does not belong to this share' });
        return;
      }
    }

    if (!file.thumbnailPath) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }

    if (!await fileExists(file.thumbnailPath)) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }

    // Avoid caching password-protected resources in shared/proxy caches.
    const cacheControl = share.password ? 'private, no-store' : 'private, max-age=3600';
    const etag = `"${file.id}-thumb"`;

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('ETag', etag);
    res.sendFile(file.thumbnailPath);
  } catch (error) {
    logger.error('Thumbnail shared file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

// Download public file - RATE LIMITED to prevent password brute-force
router.get('/public/:token/download', shareRateLimiter(), async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

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

    // H-03: Use cookie-based auth
    const accessResult = await verifyShareAccess(req, { password: share.password, publicToken: token });
    if (!accessResult.valid) {
      res.status(401).json({ error: 'Password required', hasPassword: !!share.password });
      return;
    }

    // P1-2: Validate allowDownload setting before serving file
    if (share.allowDownload === false) {
      res.status(403).json({
        error: 'Downloads are disabled for this share',
        code: 'DOWNLOAD_DISABLED'
      });
      return;
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
      // H-09 SECURITY: Calculate total size before creating ZIP to prevent resource exhaustion
      const calculateFolderSize = async (folderId: string): Promise<bigint> => {
        const files = await prisma.file.findMany({
          where: { folderId, isTrash: false },
          select: { size: true },
        });
        let total = files.reduce((sum, f) => sum + f.size, BigInt(0));

        const subfolders = await prisma.folder.findMany({
          where: { parentId: folderId, isTrash: false },
          select: { id: true },
        });
        for (const sub of subfolders) {
          total += await calculateFolderSize(sub.id);
        }
        return total;
      };

      const totalSize = share.folder?.size !== undefined && share.folder?.size !== null
        ? share.folder.size
        : await calculateFolderSize(share.folder.id);
      const maxZipSize = BigInt(config.limits.maxZipSize);

      if (totalSize > maxZipSize) {
        const maxSizeGB = Number(maxZipSize) / (1024 * 1024 * 1024);
        res.status(413).json({
          error: `Folder too large to download as ZIP (max ${maxSizeGB}GB)`,
          code: 'ZIP_SIZE_EXCEEDED'
        });
        return;
      }

      // Download folder as ZIP
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.folder.name)}.zip"`);

      const archive = archiver('zip', { zlib: { level: config.compression.zipLevel } });
      archive.pipe(res);

      const addFolderToArchive = async (folderId: string, archivePath: string) => {
        const files = await prisma.file.findMany({
          where: { folderId, isTrash: false },
        });

        for (const file of files) {
          if (await fileExists(file.path)) {
            const safeFileName = sanitizeFilename(file.name);
            archive.file(file.path, { name: `${archivePath}/${safeFileName}` });
          }
        }

        const subfolders = await prisma.folder.findMany({
          where: { parentId: folderId, isTrash: false },
        });

        for (const subfolder of subfolders) {
          const safeFolderName = sanitizeFilename(subfolder.name);
          await addFolderToArchive(subfolder.id, `${archivePath}/${safeFolderName}`);
        }
      };

      await addFolderToArchive(share.folder.id, sanitizeFilename(share.folder.name));
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
      const accessResult = await verifyShareAccess(req, { password: share.password, publicToken: token });
      if (!accessResult.valid) {
        res.status(401).json({ error: 'Password required' });
        return;
      }
    }

    if (!share.allowDownload) {
      res.status(403).json({ error: 'Downloads are disabled for this share' });
      return;
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

// ==========================================
// PRIVATE SHARE ACCESS FOR COLLABORATORS
// ==========================================

// Get share access for a collaborator - returns share details and content
router.get('/:id/access', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Find the share
    const share = await prisma.share.findUnique({
      where: { id },
      include: {
        file: { select: { id: true, name: true, mimeType: true, size: true, updatedAt: true, thumbnailPath: true } },
        folder: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true, avatar: true } },
        collaborators: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    // Check if user is owner or collaborator
    const isOwner = share.ownerId === userId;
    const collaboration = share.collaborators.find(c => c.userId === userId);

    if (!isOwner && !collaboration) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check if share is expired
    if (share.expiresAt && share.expiresAt < new Date()) {
      res.status(410).json({ error: 'Share has expired' });
      return;
    }

    // Get contents if folder share
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
        type: share.type,
        name: share.file?.name || share.folder?.name,
        fileId: share.fileId,
        folderId: share.folderId,
        allowDownload: share.allowDownload,
        expiresAt: share.expiresAt,
        owner: share.owner,
      },
      permission: isOwner ? 'OWNER' : collaboration?.permission || 'VIEWER',
      files: files.map(f => ({ ...f, size: f.size?.toString() })),
      folders,
    });
  } catch (error) {
    logger.error('Get share access error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to get share access' });
  }
});

// View/stream file from private share (for collaborators)
router.get('/:id/files/:fileId/view', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, fileId } = req.params;
    const userId = req.user!.userId;

    if (!isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    // Find the share and verify access
    const share = await prisma.share.findUnique({
      where: { id },
      include: {
        collaborators: true,
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    // Check if user is owner or collaborator
    const isOwner = share.ownerId === userId;
    const isCollaborator = share.collaborators.some(c => c.userId === userId);

    if (!isOwner && !isCollaborator) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check if share is expired
    if (share.expiresAt && share.expiresAt < new Date()) {
      res.status(410).json({ error: 'Share has expired' });
      return;
    }

    // Get the file
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, path: true, mimeType: true, isTrash: true, folderId: true },
    });

    if (!file || file.isTrash) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify file belongs to share
    if (share.fileId && share.fileId !== fileId) {
      res.status(403).json({ error: 'File does not belong to this share' });
      return;
    }

    if (share.folderId) {
      const isChild = await fileBelongsToSharedFolder(file.folderId, share.folderId);
      if (!isChild) {
        res.status(403).json({ error: 'File does not belong to this share' });
        return;
      }
    }

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const stat = await fs.stat(file.path);
    await streamFile(req, res, file, stat);
  } catch (error) {
    logger.error('View private share file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to view file' });
  }
});

// Excel preview for private share (for collaborators)
router.get('/:id/files/:fileId/excel-html', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, fileId } = req.params;
    const sheetIndex = parseInt(req.query.sheet as string) || 0;
    const userId = req.user!.userId;

    if (!isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const share = await prisma.share.findUnique({
      where: { id },
      include: { collaborators: true },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    const isOwner = share.ownerId === userId;
    const isCollaborator = share.collaborators.some(c => c.userId === userId);

    if (!isOwner && !isCollaborator) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      res.status(410).json({ error: 'Share has expired' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, path: true, mimeType: true, isTrash: true, folderId: true },
    });

    if (!file || file.isTrash) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (share.fileId && share.fileId !== fileId) {
      res.status(403).json({ error: 'File does not belong to this share' });
      return;
    }

    if (share.folderId) {
      const isChild = await fileBelongsToSharedFolder(file.folderId, share.folderId);
      if (!isChild) {
        res.status(403).json({ error: 'File does not belong to this share' });
        return;
      }
    }

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
    logger.error('Excel preview private share error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to convert Excel file' });
  }
});

// Download file from private share (for collaborators)
router.get('/:id/files/:fileId/download', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, fileId } = req.params;
    const userId = req.user!.userId;

    if (!isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    // Find the share and verify access
    const share = await prisma.share.findUnique({
      where: { id },
      include: {
        collaborators: true,
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    // Check allowDownload flag
    if (!share.allowDownload) {
      res.status(403).json({ error: 'Downloads are disabled for this share' });
      return;
    }

    // Check if user is owner or collaborator
    const isOwner = share.ownerId === userId;
    const isCollaborator = share.collaborators.some(c => c.userId === userId);

    if (!isOwner && !isCollaborator) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Check if share is expired
    if (share.expiresAt && share.expiresAt < new Date()) {
      res.status(410).json({ error: 'Share has expired' });
      return;
    }

    // Get the file
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.isTrash) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify file belongs to share
    if (share.fileId && share.fileId !== fileId) {
      res.status(403).json({ error: 'File does not belong to this share' });
      return;
    }

    if (share.folderId) {
      const isChild = await fileBelongsToSharedFolder(file.folderId, share.folderId);
      if (!isChild) {
        res.status(403).json({ error: 'File does not belong to this share' });
        return;
      }
    }

    if (!await fileExists(file.path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    // Safe filename encoding for Content-Disposition
    const safeFilename = encodeURIComponent(file.name).replace(/['()]/g, escape);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    res.setHeader('Content-Type', file.mimeType);
    res.sendFile(file.path);
  } catch (error) {
    logger.error('Download private share file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Get thumbnail from private share (for collaborators)
router.get('/:id/files/:fileId/thumbnail', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, fileId } = req.params;
    const userId = req.user!.userId;

    if (!isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    // Find the share and verify access
    const share = await prisma.share.findUnique({
      where: { id },
      include: {
        collaborators: true,
      },
    });

    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    // Check if user is owner or collaborator
    const isOwner = share.ownerId === userId;
    const isCollaborator = share.collaborators.some(c => c.userId === userId);

    if (!isOwner && !isCollaborator) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get the file
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, folderId: true, thumbnailPath: true, isTrash: true },
    });

    if (!file || file.isTrash) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify file belongs to share
    if (share.fileId && share.fileId !== fileId) {
      res.status(403).json({ error: 'File does not belong to this share' });
      return;
    }

    if (share.folderId) {
      const isChild = await fileBelongsToSharedFolder(file.folderId, share.folderId);
      if (!isChild) {
        res.status(403).json({ error: 'File does not belong to this share' });
        return;
      }
    }

    if (!file.thumbnailPath || !await fileExists(file.thumbnailPath)) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }

    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(file.thumbnailPath);
  } catch (error) {
    logger.error('Thumbnail private share file error', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

export default router;
