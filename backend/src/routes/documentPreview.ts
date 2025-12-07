/**
 * Document Preview Routes
 * 
 * Handles PDF preview generation using LibreOffice for Office documents.
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { authOptional } from '../middleware/authOptional.js';
import { fileExists, streamFile, isValidUUID } from '../lib/storage.js';
import {
    addConversionJob,
    getConversionJobStatus,
    hasPreviewPdf,
    getPreviewPdfPath
} from '../lib/documentConversionQueue.js';
import logger from '../lib/logger.js';

const router = Router();

// Supported document types for PDF conversion
const CONVERTIBLE_MIME_TYPES = [
    // Word
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // PowerPoint
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Excel
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Other
    'application/rtf',
    'text/rtf',
];

const CONVERTIBLE_EXTENSIONS = ['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.rtf'];

function isConvertibleDocument(mimeType: string, fileName: string): boolean {
    if (CONVERTIBLE_MIME_TYPES.includes(mimeType)) return true;
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return CONVERTIBLE_EXTENSIONS.includes(ext);
}

/**
 * Get PDF preview for Office documents
 * - If PDF exists, stream it
 * - If not, queue conversion and return 202
 */
router.get('/:id/pdf-preview', authOptional, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        // Validate ID format
        if (!isValidUUID(id)) {
            res.status(400).json({ error: 'Invalid file ID format' });
            return;
        }

        // Find the file
        const file = await prisma.file.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                path: true,
                mimeType: true,
                userId: true
            },
        });

        if (!file) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        // Check ownership (for now, require auth)
        if (!userId || file.userId !== userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        // Check if it's a convertible document
        if (!isConvertibleDocument(file.mimeType, file.name)) {
            res.status(400).json({ error: 'File type not supported for PDF preview' });
            return;
        }

        // Check if PDF preview already exists
        const previewPath = getPreviewPdfPath(id, userId);

        if (await hasPreviewPdf(id, userId)) {
            // Serve the cached PDF
            const stat = await fs.stat(previewPath);
            return streamFile(req, res, {
                path: previewPath,
                mimeType: 'application/pdf',
                name: file.name.replace(/\.[^.]+$/, '.pdf'),
            }, stat);
        }

        // Check conversion status
        const status = await getConversionJobStatus(id);

        if (status) {
            if (status.status === 'completed' && status.outputPath) {
                // Conversion just finished, serve the PDF
                const stat = await fs.stat(status.outputPath);
                return streamFile(req, res, {
                    path: status.outputPath,
                    mimeType: 'application/pdf',
                    name: file.name.replace(/\.[^.]+$/, '.pdf'),
                }, stat);
            }

            if (status.status === 'processing' || status.status === 'queued') {
                // Still converting
                res.status(202).json({
                    status: status.status,
                    progress: status.progress,
                    message: 'Document is being converted to PDF',
                });
                return;
            }

            if (status.status === 'failed') {
                res.status(500).json({
                    error: 'Conversion failed',
                    details: status.error,
                });
                return;
            }
        }

        // Queue new conversion
        const jobId = await addConversionJob(id, file.path, userId);

        if (!jobId) {
            res.status(503).json({ error: 'Document conversion service unavailable' });
            return;
        }

        res.status(202).json({
            status: 'queued',
            jobId,
            message: 'Document conversion queued',
        });
    } catch (error) {
        logger.error('PDF preview error', {}, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Failed to get PDF preview' });
    }
});

/**
 * Check PDF conversion status
 */
router.get('/:id/pdf-preview/status', authOptional, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        if (!isValidUUID(id)) {
            res.status(400).json({ error: 'Invalid file ID format' });
            return;
        }

        // Check if PDF exists
        if (userId && await hasPreviewPdf(id, userId)) {
            res.json({ status: 'completed', progress: 100 });
            return;
        }

        const status = await getConversionJobStatus(id);

        if (!status) {
            res.status(404).json({ error: 'No conversion job found' });
            return;
        }

        res.json(status);
    } catch (error) {
        logger.error('PDF status error', {}, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

export default router;
