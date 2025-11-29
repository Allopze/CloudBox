import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// List trash items
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [files, folders] = await Promise.all([
      prisma.file.findMany({
        where: { userId, isTrash: true },
        orderBy: { trashedAt: 'desc' },
      }),
      prisma.folder.findMany({
        where: { userId, isTrash: true },
        orderBy: { trashedAt: 'desc' },
      }),
    ]);

    res.json({
      files: files.map((f: any) => ({ ...f, size: f.size.toString() })),
      folders,
    });
  } catch (error) {
    console.error('List trash error:', error);
    res.status(500).json({ error: 'Failed to list trash' });
  }
});

// Restore file
router.post('/restore/file/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const file = await prisma.file.findFirst({
      where: { id, userId, isTrash: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found in trash' });
      return;
    }

    await prisma.file.update({
      where: { id },
      data: { isTrash: false, trashedAt: null },
    });

    await prisma.activity.create({
      data: {
        type: 'RESTORE',
        userId,
        fileId: id,
        details: JSON.stringify({ name: file.name }),
      },
    });

    res.json({ message: 'File restored successfully' });
  } catch (error) {
    console.error('Restore file error:', error);
    res.status(500).json({ error: 'Failed to restore file' });
  }
});

// Restore folder
router.post('/restore/folder/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const folder = await prisma.folder.findFirst({
      where: { id, userId, isTrash: true },
    });

    if (!folder) {
      res.status(404).json({ error: 'Folder not found in trash' });
      return;
    }

    // Restore folder and all its contents
    const restoreRecursively = async (folderId: string) => {
      await prisma.folder.update({
        where: { id: folderId },
        data: { isTrash: false, trashedAt: null },
      });

      await prisma.file.updateMany({
        where: { folderId },
        data: { isTrash: false, trashedAt: null },
      });

      const subfolders = await prisma.folder.findMany({
        where: { parentId: folderId },
      });

      for (const subfolder of subfolders) {
        await restoreRecursively(subfolder.id);
      }
    };

    await restoreRecursively(id);

    res.json({ message: 'Folder restored successfully' });
  } catch (error) {
    console.error('Restore folder error:', error);
    res.status(500).json({ error: 'Failed to restore folder' });
  }
});

// Batch restore
router.post('/restore/batch', authenticate, async (req: Request, res: Response) => {
  try {
    const { fileIds, folderIds } = req.body;
    const userId = req.user!.userId;

    if (fileIds && Array.isArray(fileIds)) {
      await prisma.file.updateMany({
        where: { id: { in: fileIds }, userId, isTrash: true },
        data: { isTrash: false, trashedAt: null },
      });
    }

    if (folderIds && Array.isArray(folderIds)) {
      for (const folderId of folderIds) {
        const folder = await prisma.folder.findFirst({
          where: { id: folderId, userId, isTrash: true },
        });

        if (folder) {
          const restoreRecursively = async (id: string) => {
            await prisma.folder.update({
              where: { id },
              data: { isTrash: false, trashedAt: null },
            });

            await prisma.file.updateMany({
              where: { folderId: id },
              data: { isTrash: false, trashedAt: null },
            });

            const subfolders = await prisma.folder.findMany({
              where: { parentId: id },
            });

            for (const subfolder of subfolders) {
              await restoreRecursively(subfolder.id);
            }
          };

          await restoreRecursively(folderId);
        }
      }
    }

    res.json({ message: 'Items restored successfully' });
  } catch (error) {
    console.error('Batch restore error:', error);
    res.status(500).json({ error: 'Failed to restore items' });
  }
});

// Empty trash
router.delete('/empty', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { deleteFile: deleteStorageFile } = await import('../lib/storage.js');

    // Delete all trashed files
    const files = await prisma.file.findMany({
      where: { userId, isTrash: true },
    });

    let freedSpace = BigInt(0);

    for (const file of files) {
      await deleteStorageFile(file.path);
      if (file.thumbnailPath) {
        await deleteStorageFile(file.thumbnailPath);
      }
      freedSpace += file.size;
    }

    await prisma.file.deleteMany({
      where: { userId, isTrash: true },
    });

    // Delete all trashed folders
    await prisma.folder.deleteMany({
      where: { userId, isTrash: true },
    });

    // Update storage used
    await prisma.user.update({
      where: { id: userId },
      data: { storageUsed: { decrement: Number(freedSpace) } },
    });

    res.json({ message: 'Trash emptied successfully', freedSpace: freedSpace.toString() });
  } catch (error) {
    console.error('Empty trash error:', error);
    res.status(500).json({ error: 'Failed to empty trash' });
  }
});

export default router;
