import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get activity log
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { page = '1', limit = '50', type } = req.query;

    const where: any = { userId };
    
    if (type) {
      where.type = type;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.activity.count({ where }),
    ]);

    res.json({
      activities,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ error: 'Failed to get activity' });
  }
});

// Get dashboard stats
router.get('/dashboard', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [
      user,
      totalFiles,
      totalFolders,
      filesByType,
      recentActivity,
      mostAccessed,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { storageQuota: true, storageUsed: true },
      }),
      prisma.file.count({
        where: { userId, isTrash: false },
      }),
      prisma.folder.count({
        where: { userId, isTrash: false },
      }),
      prisma.file.groupBy({
        by: ['mimeType'],
        where: { userId, isTrash: false },
        _count: true,
        _sum: { size: true },
      }),
      prisma.activity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.activity.groupBy({
        by: ['fileId'],
        where: { userId, fileId: { not: null } },
        _count: true,
        orderBy: { _count: { fileId: 'desc' } },
        take: 5,
      }),
    ]);

    // Get most accessed files details
    const mostAccessedFiles = await prisma.file.findMany({
      where: {
        id: { in: mostAccessed.map((a: any) => a.fileId!).filter(Boolean) },
      },
      select: { id: true, name: true, mimeType: true, size: true },
    });

    // Categorize files by type
    const categories = {
      images: { count: 0, size: BigInt(0) },
      videos: { count: 0, size: BigInt(0) },
      audio: { count: 0, size: BigInt(0) },
      documents: { count: 0, size: BigInt(0) },
      other: { count: 0, size: BigInt(0) },
    };

    for (const item of filesByType) {
      const mime = item.mimeType;
      const count = item._count;
      const size = item._sum.size || BigInt(0);

      if (mime.startsWith('image/')) {
        categories.images.count += count;
        categories.images.size += size;
      } else if (mime.startsWith('video/')) {
        categories.videos.count += count;
        categories.videos.size += size;
      } else if (mime.startsWith('audio/')) {
        categories.audio.count += count;
        categories.audio.size += size;
      } else if (
        mime.includes('pdf') ||
        mime.includes('document') ||
        mime.includes('text')
      ) {
        categories.documents.count += count;
        categories.documents.size += size;
      } else {
        categories.other.count += count;
        categories.other.size += size;
      }
    }

    res.json({
      storage: {
        quota: user?.storageQuota.toString() || '0',
        used: user?.storageUsed.toString() || '0',
        percentage: user
          ? Math.round((Number(user.storageUsed) / Number(user.storageQuota)) * 100)
          : 0,
      },
      counts: {
        files: totalFiles,
        folders: totalFolders,
      },
      categories: Object.fromEntries(
        Object.entries(categories).map(([k, v]) => [
          k,
          { count: v.count, size: v.size.toString() },
        ])
      ),
      recentActivity,
      mostAccessed: mostAccessedFiles.map((f: any) => ({
        ...f,
        size: f.size.toString(),
        accessCount: mostAccessed.find((a: any) => a.fileId === f.id)?._count || 0,
      })),
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

export default router;
