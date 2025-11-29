import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createAlbumSchema, updateAlbumSchema, albumFilesSchema } from '../schemas/index.js';

const router = Router();

// Create album
router.post('/', authenticate, validate(createAlbumSchema), async (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;
    const userId = req.user!.userId;

    const existing = await prisma.album.findFirst({
      where: { name, userId },
    });

    if (existing) {
      res.status(400).json({ error: 'Album with this name already exists' });
      return;
    }

    const album = await prisma.album.create({
      data: { name, color, userId },
    });

    res.status(201).json(album);
  } catch (error) {
    console.error('Create album error:', error);
    res.status(500).json({ error: 'Failed to create album' });
  }
});

// List albums
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const albums = await prisma.album.findMany({
      where: { userId },
      include: {
        _count: { select: { files: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(albums);
  } catch (error) {
    console.error('List albums error:', error);
    res.status(500).json({ error: 'Failed to list albums' });
  }
});

// Get album with files
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const album = await prisma.album.findFirst({
      where: { id, userId },
      include: {
        files: {
          include: {
            file: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    res.json({
      ...album,
      files: album.files.map((af: any) => ({
        ...af.file,
        size: af.file.size.toString(),
        order: af.order,
      })),
    });
  } catch (error) {
    console.error('Get album error:', error);
    res.status(500).json({ error: 'Failed to get album' });
  }
});

// Update album
router.patch('/:id', authenticate, validate(updateAlbumSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    const userId = req.user!.userId;

    const album = await prisma.album.findFirst({
      where: { id, userId },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    if (name) {
      const existing = await prisma.album.findFirst({
        where: { name, userId, NOT: { id } },
      });

      if (existing) {
        res.status(400).json({ error: 'Album with this name already exists' });
        return;
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (color !== undefined) updateData.color = color;

    const updated = await prisma.album.update({
      where: { id },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    console.error('Update album error:', error);
    res.status(500).json({ error: 'Failed to update album' });
  }
});

// Delete album
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const album = await prisma.album.findFirst({
      where: { id, userId },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    await prisma.album.delete({ where: { id } });

    res.json({ message: 'Album deleted successfully' });
  } catch (error) {
    console.error('Delete album error:', error);
    res.status(500).json({ error: 'Failed to delete album' });
  }
});

// Get album files
router.get('/:id/files', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const album = await prisma.album.findFirst({
      where: { id, userId },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    const albumFiles = await prisma.albumFile.findMany({
      where: { albumId: id },
      include: { file: true },
      orderBy: { order: 'asc' },
    });

    const files = albumFiles.map((af: any) => ({
      ...af.file,
      size: af.file.size.toString(),
      order: af.order,
    }));

    res.json(files);
  } catch (error) {
    console.error('Get album files error:', error);
    res.status(500).json({ error: 'Failed to get album files' });
  }
});

// Add files to album
router.post('/:id/files', authenticate, validate(albumFilesSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fileIds } = req.body;
    const userId = req.user!.userId;

    const album = await prisma.album.findFirst({
      where: { id, userId },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    // Verify files belong to user and are images
    const files = await prisma.file.findMany({
      where: {
        id: { in: fileIds },
        userId,
        mimeType: { startsWith: 'image/' },
      },
    });

    if (files.length === 0) {
      res.status(400).json({ error: 'No valid image files found' });
      return;
    }

    // Get current max order
    const maxOrder = await prisma.albumFile.findFirst({
      where: { albumId: id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    let order = (maxOrder?.order || 0) + 1;

    for (const file of files) {
      const existing = await prisma.albumFile.findFirst({
        where: { albumId: id, fileId: file.id },
      });

      if (!existing) {
        await prisma.albumFile.create({
          data: {
            albumId: id,
            fileId: file.id,
            order: order++,
          },
        });
      }
    }

    // Set cover if not set
    if (!album.coverPath && files.length > 0) {
      await prisma.album.update({
        where: { id },
        data: { coverPath: files[0].thumbnailPath || files[0].path },
      });
    }

    res.json({ message: 'Files added to album' });
  } catch (error) {
    console.error('Add files to album error:', error);
    res.status(500).json({ error: 'Failed to add files to album' });
  }
});

// Remove files from album
router.delete('/:id/files', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fileIds } = req.body;
    const userId = req.user!.userId;

    const album = await prisma.album.findFirst({
      where: { id, userId },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    await prisma.albumFile.deleteMany({
      where: {
        albumId: id,
        fileId: { in: fileIds },
      },
    });

    res.json({ message: 'Files removed from album' });
  } catch (error) {
    console.error('Remove files from album error:', error);
    res.status(500).json({ error: 'Failed to remove files from album' });
  }
});

export default router;
