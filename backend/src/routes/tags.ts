import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get all tags for the current user
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;

        const tags = await prisma.tag.findMany({
            where: { userId },
            orderBy: { name: 'asc' },
            include: {
                _count: { select: { fileTags: true } },
            },
        });

        res.json(tags.map(tag => ({
            ...tag,
            fileCount: tag._count.fileTags,
        })));
    } catch (error) {
        console.error('Get tags error:', error);
        res.status(500).json({ error: 'Failed to get tags' });
    }
});

// Create a new tag
router.post('/', authenticate, async (req: Request, res: Response) => {
    try {
        const { name, color } = req.body;
        const userId = req.user!.userId;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            res.status(400).json({ error: 'Tag name is required' });
            return;
        }

        // Check for duplicate
        const existing = await prisma.tag.findFirst({
            where: { name: name.trim(), userId },
        });

        if (existing) {
            res.status(409).json({ error: 'Tag already exists' });
            return;
        }

        const tag = await prisma.tag.create({
            data: {
                name: name.trim(),
                color: color || null,
                userId,
            },
        });

        res.status(201).json(tag);
    } catch (error) {
        console.error('Create tag error:', error);
        res.status(500).json({ error: 'Failed to create tag' });
    }
});

// Update a tag
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, color } = req.body;
        const userId = req.user!.userId;

        const tag = await prisma.tag.findFirst({
            where: { id, userId },
        });

        if (!tag) {
            res.status(404).json({ error: 'Tag not found' });
            return;
        }

        // Check for duplicate name if changing
        if (name && name !== tag.name) {
            const existing = await prisma.tag.findFirst({
                where: { name: name.trim(), userId, NOT: { id } },
            });

            if (existing) {
                res.status(409).json({ error: 'Tag with this name already exists' });
                return;
            }
        }

        const updated = await prisma.tag.update({
            where: { id },
            data: {
                ...(name && { name: name.trim() }),
                ...(color !== undefined && { color }),
            },
        });

        res.json(updated);
    } catch (error) {
        console.error('Update tag error:', error);
        res.status(500).json({ error: 'Failed to update tag' });
    }
});

// Delete a tag
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const tag = await prisma.tag.findFirst({
            where: { id, userId },
        });

        if (!tag) {
            res.status(404).json({ error: 'Tag not found' });
            return;
        }

        await prisma.tag.delete({ where: { id } });

        res.json({ message: 'Tag deleted successfully' });
    } catch (error) {
        console.error('Delete tag error:', error);
        res.status(500).json({ error: 'Failed to delete tag' });
    }
});

// Add tag to file
router.post('/files/:fileId/tags/:tagId', authenticate, async (req: Request, res: Response) => {
    try {
        const { fileId, tagId } = req.params;
        const userId = req.user!.userId;

        // Verify file belongs to user
        const file = await prisma.file.findFirst({
            where: { id: fileId, userId },
        });

        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        // Verify tag belongs to user
        const tag = await prisma.tag.findFirst({
            where: { id: tagId, userId },
        });

        if (!tag) {
            res.status(404).json({ error: 'Tag not found' });
            return;
        }

        // Check if already tagged
        const existing = await prisma.fileTag.findFirst({
            where: { fileId, tagId },
        });

        if (existing) {
            res.json({ message: 'Tag already added to file' });
            return;
        }

        await prisma.fileTag.create({
            data: { fileId, tagId },
        });

        res.status(201).json({ message: 'Tag added to file' });
    } catch (error) {
        console.error('Add tag to file error:', error);
        res.status(500).json({ error: 'Failed to add tag to file' });
    }
});

// Remove tag from file
router.delete('/files/:fileId/tags/:tagId', authenticate, async (req: Request, res: Response) => {
    try {
        const { fileId, tagId } = req.params;
        const userId = req.user!.userId;

        // Verify file belongs to user
        const file = await prisma.file.findFirst({
            where: { id: fileId, userId },
        });

        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        const fileTag = await prisma.fileTag.findFirst({
            where: { fileId, tagId },
        });

        if (!fileTag) {
            res.status(404).json({ error: 'Tag not assigned to file' });
            return;
        }

        await prisma.fileTag.delete({ where: { id: fileTag.id } });

        res.json({ message: 'Tag removed from file' });
    } catch (error) {
        console.error('Remove tag from file error:', error);
        res.status(500).json({ error: 'Failed to remove tag from file' });
    }
});

// Get tags for a specific file
router.get('/files/:fileId', authenticate, async (req: Request, res: Response) => {
    try {
        const { fileId } = req.params;
        const userId = req.user!.userId;

        // Verify file belongs to user
        const file = await prisma.file.findFirst({
            where: { id: fileId, userId },
        });

        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        const fileTags = await prisma.fileTag.findMany({
            where: { fileId },
            include: { tag: true },
        });

        res.json(fileTags.map(ft => ft.tag));
    } catch (error) {
        console.error('Get file tags error:', error);
        res.status(500).json({ error: 'Failed to get file tags' });
    }
});

// Bulk add tags to file
router.post('/files/:fileId/tags', authenticate, async (req: Request, res: Response) => {
    try {
        const { fileId } = req.params;
        const { tagIds } = req.body;
        const userId = req.user!.userId;

        if (!Array.isArray(tagIds)) {
            res.status(400).json({ error: 'tagIds array is required' });
            return;
        }

        // Verify file belongs to user
        const file = await prisma.file.findFirst({
            where: { id: fileId, userId },
        });

        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        // Verify all tags belong to user
        const tags = await prisma.tag.findMany({
            where: { id: { in: tagIds }, userId },
        });

        if (tags.length !== tagIds.length) {
            res.status(400).json({ error: 'Some tags not found or not owned by user' });
            return;
        }

        // Get existing file tags
        const existingFileTags = await prisma.fileTag.findMany({
            where: { fileId },
        });
        const existingTagIds = existingFileTags.map(ft => ft.tagId);

        // Add new tags
        const newTagIds = tagIds.filter((id: string) => !existingTagIds.includes(id));

        if (newTagIds.length > 0) {
            await prisma.fileTag.createMany({
                data: newTagIds.map((tagId: string) => ({ fileId, tagId })),
            });
        }

        res.json({ message: `${newTagIds.length} tags added` });
    } catch (error) {
        console.error('Bulk add tags error:', error);
        res.status(500).json({ error: 'Failed to add tags' });
    }
});

// Get files by tag
router.get('/:tagId/files', authenticate, async (req: Request, res: Response) => {
    try {
        const { tagId } = req.params;
        const userId = req.user!.userId;
        const { page = '1', limit = '50' } = req.query;

        // Verify tag belongs to user
        const tag = await prisma.tag.findFirst({
            where: { id: tagId, userId },
        });

        if (!tag) {
            res.status(404).json({ error: 'Tag not found' });
            return;
        }

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);

        const [fileTags, total] = await Promise.all([
            prisma.fileTag.findMany({
                where: { tagId },
                include: {
                    file: true,
                },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
            }),
            prisma.fileTag.count({ where: { tagId } }),
        ]);

        res.json({
            files: fileTags.map(ft => ({
                ...ft.file,
                size: ft.file.size.toString(),
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Get files by tag error:', error);
        res.status(500).json({ error: 'Failed to get files' });
    }
});

export default router;
