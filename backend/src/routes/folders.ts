import { Router, Request, Response } from 'express';
import prisma, { updateParentFolderSizes } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createFolderSchema, updateFolderSchema, moveFolderSchema } from '../schemas/index.js';
import archiver from 'archiver';
import fs from 'fs/promises';
import { fileExists, getStoragePath, deleteFile as deleteStorageFile } from '../lib/storage.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import * as cache from '../lib/cache.js';
import logger from '../lib/logger.js';

const router = Router();

// Helper function to serialize folder BigInt fields
const serializeFolder = (folder: any) => ({
  ...folder,
  size: folder.size?.toString() ?? '0',
});

// Create folder
router.post('/', authenticate, validate(createFolderSchema), async (req: Request, res: Response) => {
  try {
    const { name, parentId, color, category } = req.body;
    const userId = req.user!.userId;

    // Check if parent exists
    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, userId },
      });

      if (!parent) {
        res.status(404).json({ error: 'Parent folder not found' });
        return;
      }
    }

    // Check for duplicate name (only among non-trashed folders)
    const existing = await prisma.folder.findFirst({
      where: { name, parentId: parentId || null, userId, isTrash: false },
    });

    if (existing) {
      res.status(400).json({ error: 'Folder with this name already exists' });
      return;
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        parentId: parentId || null,
        color,
        category,
        userId,
      },
    });

    await prisma.activity.create({
      data: {
        type: 'CREATE_FOLDER',
        userId,
        folderId: folder.id,
        details: JSON.stringify({ name }),
      },
    });

    // Invalidate folder cache after creation
    await cache.invalidateAfterFolderChange(userId);

    res.status(201).json(serializeFolder(folder));
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// List folders
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { parentId, favorites, search } = req.query;

    // Try cache for non-filtered requests (root folders without favorites filter and no search)
    const canUseCache = !favorites && !search && (parentId === 'null' || parentId === '' || !parentId);

    if (canUseCache) {
      const cachedFolders = await cache.getFolders(userId);
      if (cachedFolders) {
        logger.debug('Cache hit for folders list', { userId });
        res.json(cachedFolders);
        return;
      }
    }

    const where: any = {
      userId,
      isTrash: false,
    };

    // When searching, ignore parentId to search across all folders (global search)
    // When not searching, respect the folder navigation
    // When searching, ignore parentId to search across all folders (global search)
    // When not searching, respect the folder navigation
    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    } else if (parentId === 'null' || parentId === '' || parentId === undefined) {
      where.parentId = null;
    } else {
      where.parentId = parentId;
    }

    if (favorites === 'true') {
      where.isFavorite = true;
    }

    const folders = await prisma.folder.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { files: true, children: true } },
      },
    });

    // Convert BigInt to string for JSON serialization
    // Combine files and subfolders count into a single itemCount for UI display
    const serializedFolders = folders.map(folder => ({
      ...folder,
      size: folder.size?.toString() ?? '0',
      _count: {
        ...folder._count,
        // Total items = files + subfolders
        items: (folder._count?.files || 0) + (folder._count?.children || 0),
      },
    }));

    // Cache root folders (most commonly accessed)
    if (canUseCache) {
      await cache.setFolders(userId, serializedFolders);
    }

    res.json(serializedFolders);
  } catch (error) {
    console.error('List folders error:', error);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// Get folder with breadcrumb
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const folder = await prisma.folder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    // Build breadcrumb with depth limit (using centralized config)
    const breadcrumb = [];
    let currentFolder = folder;
    let depth = 0;

    while (currentFolder && depth < config.limits.maxBreadcrumbDepth) {
      breadcrumb.unshift({ id: currentFolder.id, name: currentFolder.name });
      if (currentFolder.parentId) {
        const parent = await prisma.folder.findUnique({
          where: { id: currentFolder.parentId },
        });
        currentFolder = parent as typeof currentFolder;
      } else {
        break;
      }
      depth++;
    }

    res.json({ folder: serializeFolder(folder), breadcrumb });
  } catch (error) {
    console.error('Get folder error:', error);
    res.status(500).json({ error: 'Failed to get folder' });
  }
});

// Update folder
router.patch('/:id', authenticate, validate(updateFolderSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color, category } = req.body;
    const userId = req.user!.userId;

    const folder = await prisma.folder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    // Check for duplicate name
    if (name && name !== folder.name) {
      const existing = await prisma.folder.findFirst({
        where: { name, parentId: folder.parentId, userId, NOT: { id } },
      });

      if (existing) {
        res.status(400).json({ error: 'Folder with this name already exists' });
        return;
      }
    }

    const updated = await prisma.folder.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(color !== undefined && { color }),
        ...(category !== undefined && { category }),
      },
    });

    // Invalidate folder cache after update
    await cache.invalidateAfterFolderChange(userId);

    res.json(serializeFolder(updated));
  } catch (error) {
    console.error('Update folder error:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Move folder
router.patch('/:id/move', authenticate, validate(moveFolderSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { parentId } = req.body;
    const userId = req.user!.userId;

    const folder = await prisma.folder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    // Check if moving to itself or its children (prevent loops)
    if (parentId) {
      if (parentId === id) {
        res.status(400).json({ error: 'Cannot move folder into itself' });
        return;
      }

      // Check if parentId is a descendant
      const isDescendant = async (folderId: string, targetId: string): Promise<boolean> => {
        const children = await prisma.folder.findMany({
          where: { parentId: folderId },
        });

        for (const child of children) {
          if (child.id === targetId) return true;
          if (await isDescendant(child.id, targetId)) return true;
        }

        return false;
      };

      if (await isDescendant(id, parentId)) {
        res.status(400).json({ error: 'Cannot move folder into its own subfolder' });
        return;
      }

      // Check if target exists
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, userId },
      });

      if (!parent) {
        res.status(404).json({ error: 'Destination folder not found' });
        return;
      }
    }

    // Check for duplicate name in target
    const existing = await prisma.folder.findFirst({
      where: { name: folder.name, parentId, userId, NOT: { id } },
    });

    if (existing) {
      res.status(400).json({ error: 'Folder with this name already exists in destination' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const folderToMove = await tx.folder.update({
        where: { id },
        data: { parentId },
      });

      // Get folder with size using raw query to get the size field
      // Cast the id to UUID for PostgreSQL compatibility
      const folderWithSize = await tx.$queryRaw<Array<{ size: bigint }>>`
        SELECT size FROM folders WHERE id = ${id}::uuid
      `;

      const folderSize = folderWithSize[0]?.size ?? BigInt(0);

      // Update old parent folder size
      if (folder.parentId) {
        await updateParentFolderSizes(folder.parentId, folderSize, tx, 'decrement');
      }

      // Update new parent folder size
      if (parentId) {
        await updateParentFolderSizes(parentId, folderSize, tx, 'increment');
      }

      return folderToMove;
    });

    await prisma.activity.create({
      data: {
        type: 'MOVE',
        userId,
        folderId: id,
        details: JSON.stringify({ from: folder.parentId, to: parentId }),
      },
    });

    // Invalidate folder cache after move
    await cache.invalidateAfterFolderChange(userId);

    res.json(serializeFolder(updated));
  } catch (error) {
    console.error('Move folder error:', error);
    res.status(500).json({ error: 'Failed to move folder' });
  }
});

// Delete folder (move to trash)
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { permanent } = req.query;

    const folder = await prisma.folder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    // Issue #13: Add depth limit to recursive deletion (using centralized config)
    const deleteRecursively = async (folderId: string, isPermanent: boolean, depth: number = 0) => {
      if (depth > config.limits.maxFolderDepth) {
        console.error(`Maximum folder depth (${config.limits.maxFolderDepth}) exceeded during deletion`);
        return;
      }

      const folderToDelete = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folderToDelete) return;

      // Get all files in folder
      const files = await prisma.file.findMany({
        where: { folderId },
      });

      for (const file of files) {
        if (isPermanent) {
          await deleteStorageFile(file.path);
          if (file.thumbnailPath) {
            await deleteStorageFile(file.thumbnailPath);
          }
          await prisma.file.delete({ where: { id: file.id } });

          // Update storage
          await prisma.user.update({
            where: { id: userId },
            data: { storageUsed: { decrement: Number(file.size) } },
          });
        } else {
          await prisma.file.update({
            where: { id: file.id },
            data: { isTrash: true, trashedAt: new Date() },
          });
        }
      }

      // Get all subfolders
      const subfolders = await prisma.folder.findMany({
        where: { parentId: folderId },
      });

      for (const subfolder of subfolders) {
        await deleteRecursively(subfolder.id, isPermanent, depth + 1);
      }

      if (isPermanent) {
        await prisma.folder.delete({ where: { id: folderId } });
        // After deleting the folder, update the parent's size
        if (folderToDelete.parentId) {
          const deletedFolderSize = (folderToDelete as any).size ?? BigInt(0);
          await updateParentFolderSizes(folderToDelete.parentId, deletedFolderSize, prisma, 'decrement');
        }
      } else {
        await prisma.folder.update({
          where: { id: folderId },
          data: { isTrash: true, trashedAt: new Date() },
        });
      }
    };

    await deleteRecursively(id, permanent === 'true' || folder.isTrash);

    // Invalidate folder cache after deletion
    await cache.invalidateAfterFolderChange(userId);

    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Get folder size
router.get('/:id/size', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const folder = await prisma.folder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    // Get size using raw query since Prisma client might not be regenerated
    // Cast the id to UUID for PostgreSQL compatibility
    const sizeResult = await prisma.$queryRaw<Array<{ size: bigint }>>`
      SELECT size FROM folders WHERE id = ${id}::uuid
    `;

    res.json({ size: (sizeResult[0]?.size ?? BigInt(0)).toString() });
  } catch (error) {
    console.error('Get folder size error:', error);
    res.status(500).json({ error: 'Failed to get folder size' });
  }
});

// Toggle folder favorite
router.patch('/:id/favorite', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const folder = await prisma.folder.findFirst({
      where: { id, userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    const updated = await prisma.folder.update({
      where: { id },
      data: { isFavorite: !folder.isFavorite },
    });

    // Invalidate folder cache after favorite toggle
    await cache.invalidateAfterFolderChange(userId);

    res.json(serializeFolder(updated));
  } catch (error) {
    console.error('Toggle folder favorite error:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// Download folder as ZIP (using centralized config for max size)
router.get('/:id/download', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const folder = await prisma.folder.findFirst({
      where: { id, userId, isTrash: false },
    });

    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    // Calculate total folder size before creating ZIP
    const calculateFolderSize = async (folderId: string): Promise<bigint> => {
      let totalSize = BigInt(0);

      const files = await prisma.file.findMany({
        where: { folderId, isTrash: false },
        select: { size: true },
      });

      for (const file of files) {
        totalSize += file.size;
      }

      const subfolders = await prisma.folder.findMany({
        where: { parentId: folderId, isTrash: false },
        select: { id: true },
      });

      for (const subfolder of subfolders) {
        totalSize += await calculateFolderSize(subfolder.id);
      }

      return totalSize;
    };

    const totalSize = await calculateFolderSize(id);
    if (totalSize > BigInt(config.limits.maxZipSize)) {
      res.status(400).json({
        error: 'Folder too large for ZIP download',
        maxSize: config.limits.maxZipSize,
        folderSize: totalSize.toString(),
      });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folder.name)}.zip"`);

    const archive = archiver('zip', { zlib: { level: config.compression.zipLevel } });
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

    await addFolderToArchive(id, folder.name);
    await archive.finalize();
  } catch (error) {
    console.error('Download folder error:', error);
    res.status(500).json({ error: 'Failed to download folder' });
  }
});

export default router;
