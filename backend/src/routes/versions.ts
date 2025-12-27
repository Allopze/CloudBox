import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { fileExists, getStoragePath, streamFile } from '../lib/storage.js';
import { isValidUUID } from '../lib/storage.js';
import logger from '../lib/logger.js';

const router = Router();

// Get all versions of a file
router.get('/:fileId/versions', authenticate, async (req: Request, res: Response) => {
    try {
        const { fileId } = req.params;
        const userId = req.user!.userId;

        if (!isValidUUID(fileId)) {
            res.status(400).json({ error: 'Invalid file ID format' });
            return;
        }

        // Verify file ownership
        const file = await prisma.file.findFirst({
            where: { id: fileId, userId },
            select: { id: true, name: true, size: true, mimeType: true, updatedAt: true },
        });

        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        // Get all versions
        const versions = await prisma.fileVersion.findMany({
            where: { fileId },
            orderBy: { version: 'desc' },
            select: {
                id: true,
                version: true,
                size: true,
                mimeType: true,
                createdAt: true,
            },
        });

        res.json({
            current: {
                id: file.id,
                name: file.name,
                size: file.size.toString(),
                mimeType: file.mimeType,
                updatedAt: file.updatedAt,
            },
            versions: versions.map(v => ({
                ...v,
                size: v.size.toString(),
            })),
        });
    } catch (error) {
        logger.error('Get file versions error', {}, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Failed to get file versions' });
    }
});

// Download a specific version
router.get('/:fileId/versions/:versionId/download', authenticate, async (req: Request, res: Response) => {
    try {
        const { fileId, versionId } = req.params;
        const userId = req.user!.userId;

        if (!isValidUUID(fileId) || !isValidUUID(versionId)) {
            res.status(400).json({ error: 'Invalid ID format' });
            return;
        }

        // Verify file ownership
        const file = await prisma.file.findFirst({
            where: { id: fileId, userId },
            select: { id: true, name: true },
        });

        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        // Get the version
        const version = await prisma.fileVersion.findFirst({
            where: { id: versionId, fileId },
        });

        if (!version) {
            res.status(404).json({ error: 'Version not found' });
            return;
        }

        if (!await fileExists(version.path)) {
            res.status(404).json({ error: 'Version file not found on disk' });
            return;
        }

        const stat = await fs.stat(version.path);
        const ext = path.extname(file.name);
        const baseName = path.basename(file.name, ext);
        const versionedName = `${baseName}_v${version.version}${ext}`;

        // Safe filename encoding for Content-Disposition
        const safeFilename = encodeURIComponent(versionedName).replace(/['()]/g, escape);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
        res.setHeader('Content-Type', version.mimeType);
        res.setHeader('Content-Length', stat.size);
        res.sendFile(version.path);
    } catch (error) {
        logger.error('Download version error', {}, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Failed to download version' });
    }
});

// Restore a specific version
router.post('/:fileId/versions/:versionId/restore', authenticate, async (req: Request, res: Response) => {
    try {
        const { fileId, versionId } = req.params;
        const userId = req.user!.userId;

        if (!isValidUUID(fileId) || !isValidUUID(versionId)) {
            res.status(400).json({ error: 'Invalid ID format' });
            return;
        }

        // Verify file ownership
        const file = await prisma.file.findFirst({
            where: { id: fileId, userId },
        });

        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        // Get the version to restore
        const versionToRestore = await prisma.fileVersion.findFirst({
            where: { id: versionId, fileId },
        });

        if (!versionToRestore) {
            res.status(404).json({ error: 'Version not found' });
            return;
        }

        if (!await fileExists(versionToRestore.path)) {
            res.status(404).json({ error: 'Version file not found on disk' });
            return;
        }

        // Get the highest version number
        const latestVersion = await prisma.fileVersion.findFirst({
            where: { fileId },
            orderBy: { version: 'desc' },
            select: { version: true },
        });

        const newVersionNumber = (latestVersion?.version || 0) + 1;

        // Create a new version from the current file
        const versionsDir = getStoragePath('versions', userId);
        await fs.mkdir(versionsDir, { recursive: true });
        const versionPath = path.join(versionsDir, `${fileId}_v${newVersionNumber}${path.extname(file.name)}`);

        // Copy current file to versions
        await fs.copyFile(file.path, versionPath);

        // Create version record for current file
        await prisma.fileVersion.create({
            data: {
                fileId,
                version: newVersionNumber,
                size: file.size,
                path: versionPath,
                mimeType: file.mimeType,
                createdBy: userId,
            },
        });

        // Copy the version to restore to the current file path
        await fs.copyFile(versionToRestore.path, file.path);

        // Update file metadata
        const restoredStat = await fs.stat(file.path);
        await prisma.file.update({
            where: { id: fileId },
            data: {
                size: restoredStat.size,
                mimeType: versionToRestore.mimeType,
                updatedAt: new Date(),
            },
        });

        // Update user storage
        const sizeDiff = restoredStat.size - Number(file.size);
        if (sizeDiff !== 0) {
            await prisma.user.update({
                where: { id: userId },
                data: { storageUsed: { increment: sizeDiff } },
            });
        }

        // Log activity
        await prisma.activity.create({
            data: {
                type: 'RESTORE_VERSION',
                userId,
                fileId,
                details: JSON.stringify({
                    restoredVersion: versionToRestore.version,
                    previousVersionSaved: newVersionNumber,
                }),
            },
        });

        res.json({
            message: 'Version restored successfully',
            previousVersionSaved: newVersionNumber,
        });
    } catch (error) {
        logger.error('Restore version error', {}, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Failed to restore version' });
    }
});

// Delete a specific version
router.delete('/:fileId/versions/:versionId', authenticate, async (req: Request, res: Response) => {
    try {
        const { fileId, versionId } = req.params;
        const userId = req.user!.userId;

        if (!isValidUUID(fileId) || !isValidUUID(versionId)) {
            res.status(400).json({ error: 'Invalid ID format' });
            return;
        }

        // Verify file ownership
        const file = await prisma.file.findFirst({
            where: { id: fileId, userId },
            select: { id: true },
        });

        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        // Get the version
        const version = await prisma.fileVersion.findFirst({
            where: { id: versionId, fileId },
        });

        if (!version) {
            res.status(404).json({ error: 'Version not found' });
            return;
        }

        // Delete the version file
        if (await fileExists(version.path)) {
            await fs.unlink(version.path);
        }

        // Delete the version record
        await prisma.fileVersion.delete({
            where: { id: versionId },
        });

        res.json({ message: 'Version deleted successfully' });
    } catch (error) {
        logger.error('Delete version error', {}, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Failed to delete version' });
    }
});

export default router;
