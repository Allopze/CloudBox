import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import DOMPurify from 'isomorphic-dompurify';

const router = Router();

// Valid file icon categories
const VALID_CATEGORIES = [
    'folder', 'default',
    'image', 'video', 'audio',
    'pdf', 'word', 'spreadsheet', 'presentation', 'csv', 'text', 'markdown', 'ebook',
    'onenote', 'access', 'publisher',
    'js', 'html', 'css', 'py', 'json', 'sql',
    'illustrator', 'photoshop', 'indesign', 'figma', 'vector',
    'zip', 'rar', '7z',
    'exe', 'dmg', 'apk', 'ipa', 'deb', 'rpm'
] as const;
type IconCategory = typeof VALID_CATEGORIES[number];

// Helper to get settings key for a category
const getSettingsKey = (category: IconCategory) => `file_icon_${category}`;

// Sanitize SVG content to prevent XSS
const sanitizeSvg = (svgContent: string): string => {
    // Use DOMPurify to sanitize the SVG
    const clean = DOMPurify.sanitize(svgContent, {
        USE_PROFILES: { svg: true, svgFilters: true },
        ADD_TAGS: ['svg', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse', 'g', 'defs', 'use', 'text', 'tspan'],
        ADD_ATTR: ['viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'class', 'id'],
    });
    return clean;
};

// GET /api/file-icons - Get all custom file icons (public)
router.get('/', async (_req: Request, res: Response) => {
    try {
        const settings = await prisma.settings.findMany({
            where: {
                key: {
                    startsWith: 'file_icon_',
                },
            },
        });

        const icons: Record<string, string> = {};
        for (const setting of settings) {
            const category = setting.key.replace('file_icon_', '');
            icons[category] = setting.value;
        }

        res.json(icons);
    } catch (error) {
        console.error('Get file icons error:', error);
        res.status(500).json({ error: 'Failed to get file icons' });
    }
});

// GET /api/admin/file-icons - Get all custom icons (admin)
router.get('/admin', authenticate, requireAdmin, async (_req: Request, res: Response) => {
    try {
        const settings = await prisma.settings.findMany({
            where: {
                key: {
                    startsWith: 'file_icon_',
                },
            },
        });

        const icons: Record<string, { svg: string; updatedAt: Date }> = {};
        for (const setting of settings) {
            const category = setting.key.replace('file_icon_', '');
            icons[category] = {
                svg: setting.value,
                updatedAt: setting.updatedAt,
            };
        }

        // Return all categories with their status
        const result = VALID_CATEGORIES.map(category => ({
            category,
            hasCustomIcon: !!icons[category],
            svg: icons[category]?.svg || null,
            updatedAt: icons[category]?.updatedAt || null,
        }));

        res.json(result);
    } catch (error) {
        console.error('Get admin file icons error:', error);
        res.status(500).json({ error: 'Failed to get file icons' });
    }
});

// PUT /api/admin/file-icons/:category - Set icon for a category
router.put('/admin/:category', authenticate, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { category } = req.params;
        const { svg } = req.body;

        if (!VALID_CATEGORIES.includes(category as IconCategory)) {
            res.status(400).json({ error: 'Invalid category. Valid categories: ' + VALID_CATEGORIES.join(', ') });
            return;
        }

        if (!svg || typeof svg !== 'string') {
            res.status(400).json({ error: 'SVG content is required' });
            return;
        }

        // Limit SVG size to 50KB to prevent DoS
        const MAX_SVG_SIZE = 50 * 1024; // 50KB
        if (svg.length > MAX_SVG_SIZE) {
            res.status(400).json({ error: 'SVG too large. Maximum size is 50KB.' });
            return;
        }

        // Validate that it looks like an SVG
        if (!svg.trim().startsWith('<svg') && !svg.trim().startsWith('<?xml')) {
            res.status(400).json({ error: 'Invalid SVG format' });
            return;
        }

        // Sanitize SVG content
        const sanitizedSvg = sanitizeSvg(svg);

        if (!sanitizedSvg.includes('<svg')) {
            res.status(400).json({ error: 'SVG was rejected by sanitizer' });
            return;
        }

        const key = getSettingsKey(category as IconCategory);

        await prisma.settings.upsert({
            where: { key },
            create: { key, value: sanitizedSvg },
            update: { value: sanitizedSvg },
        });

        res.json({ success: true, category, message: 'Icon updated successfully' });
    } catch (error) {
        console.error('Set file icon error:', error);
        res.status(500).json({ error: 'Failed to set file icon' });
    }
});

// DELETE /api/admin/file-icons/:category - Reset icon to default
router.delete('/admin/:category', authenticate, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { category } = req.params;

        if (!VALID_CATEGORIES.includes(category as IconCategory)) {
            res.status(400).json({ error: 'Invalid category' });
            return;
        }

        const key = getSettingsKey(category as IconCategory);

        await prisma.settings.delete({
            where: { key },
        }).catch(() => {
            // Ignore if it doesn't exist
        });

        res.json({ success: true, category, message: 'Icon reset to default' });
    } catch (error) {
        console.error('Delete file icon error:', error);
        res.status(500).json({ error: 'Failed to delete file icon' });
    }
});

export default router;
