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

// Admin: Get all activity logs with filters
router.get('/admin', authenticate, async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      page = '1',
      limit = '50',
      type,
      userId,
      dateFrom,
      dateTo
    } = req.query;

    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (userId) {
      where.userId = userId;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo as string);
      }
    }

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100); // Max 100 per page

    const [activities, total, users] = await Promise.all([
      prisma.activity.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.activity.count({ where }),
      // Get all users for filter dropdown
      prisma.user.findMany({
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Get unique activity types for filter dropdown
    const activityTypes = await prisma.activity.findMany({
      distinct: ['type'],
      select: { type: true },
    });

    res.json({
      activities,
      users,
      activityTypes: activityTypes.map(a => a.type),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get admin activity error:', error);
    res.status(500).json({ error: 'Failed to get activity logs' });
  }
});

// Admin: Export activity logs as CSV
router.get('/admin/export', authenticate, async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { type, userId, dateFrom, dateTo } = req.query;

    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (userId) {
      where.userId = userId;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo as string);
      }
    }

    const activities = await prisma.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000, // Max 10k records for export
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    // Generate CSV
    const headers = ['Date', 'User', 'Email', 'Action', 'File ID', 'Folder ID', 'Details'];
    const rows = activities.map(a => [
      new Date(a.createdAt).toISOString(),
      a.user?.name || 'Unknown',
      a.user?.email || 'Unknown',
      a.type,
      a.fileId || '',
      a.folderId || '',
      a.details || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=activity_log_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export activity error:', error);
    res.status(500).json({ error: 'Failed to export activity logs' });
  }
});

export default router;
