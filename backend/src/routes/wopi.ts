/**
 * WOPI Host Endpoints
 * 
 * Implements the WOPI protocol for Office file editing via external WOPI clients.
 * https://docs.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/
 */

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';
import logger from '../lib/logger.js';
import { isValidUUID, fileExists, getStoragePath, getUserFilePath } from '../lib/storage.js';
import {
    verifyWopiToken,
    extractTokenFromRequest,
    hasRequiredScope,
    WopiTokenPayload,
} from '../lib/wopi/token.js';
import {
    acquireLock,
    refreshLock,
    releaseLock,
    getLock,
    validateLock,
    unlockAndRelock,
} from '../lib/wopi/lockManager.js';

const router = Router();

// WOPI protocol constants
const WOPI_VERSION = '1.0';

/**
 * Middleware to validate WOPI token
 */
async function validateWopiToken(
    req: Request,
    res: Response,
    requiredScope: 'view' | 'edit'
): Promise<WopiTokenPayload | null> {
    const token = extractTokenFromRequest(req);

    if (!token) {
        res.status(401).json({ error: 'Unauthorized: No access token provided' });
        return null;
    }

    try {
        const payload = verifyWopiToken(token);

        // Validate file ID matches
        const fileId = req.params.fileId;
        if (payload.fileId !== fileId) {
            res.status(401).json({ error: 'Unauthorized: Token file ID mismatch' });
            return null;
        }

        // Validate scope
        if (!hasRequiredScope(payload, requiredScope)) {
            res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
            return null;
        }

        return payload;
    } catch (error) {
        logger.warn('WOPI token validation failed', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        return null;
    }
}

/**
 * Helper to get file with ownership/permission check
 */
async function getFileWithPermissions(fileId: string, userId: string) {
    const file = await prisma.file.findUnique({
        where: { id: fileId },
        include: {
            user: { select: { id: true, name: true, email: true } },
            shares: {
                include: {
                    collaborators: {
                        where: { userId },
                        select: { permission: true },
                    },
                },
            },
        },
    });

    if (!file || file.isTrash) {
        return null;
    }

    // Check if user is owner or has share access
    const isOwner = file.userId === userId;
    let canWrite = isOwner;
    let canView = isOwner;

    if (!isOwner) {
        for (const share of file.shares) {
            for (const collab of share.collaborators) {
                canView = true;
                if (collab.permission === 'EDITOR') {
                    canWrite = true;
                }
            }
        }
    }

    return { file, isOwner, canWrite, canView };
}

/**
 * Generate file version string
 */
function getFileVersion(file: { updatedAt: Date }): string {
    return file.updatedAt.getTime().toString();
}

/**
 * Calculate SHA256 hash of file (for optional CheckFileInfo property)
 */
async function calculateFileSha256(filePath: string): Promise<string | null> {
    try {
        const content = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(content).digest('base64');
    } catch {
        return null;
    }
}

async function streamRequestToFile(req: Request, filePath: string, maxBytes: number): Promise<number> {
    let total = 0;
    const limiter = new Transform({
        transform(chunk, _enc, callback) {
            total += chunk.length;
            if (total > maxBytes) {
                callback(new Error('MAX_SIZE_EXCEEDED'));
                return;
            }
            callback(null, chunk);
        },
    });

    await pipeline(req, limiter, createWriteStream(filePath));
    return total;
}

// =============================================================================
// WOPI Endpoints
// =============================================================================

/**
 * CheckFileInfo
 * GET /wopi/files/{fileId}
 * 
 * Returns information about the file and permissions for the user.
 */
router.get('/files/:fileId', async (req: Request, res: Response) => {
    try {
        const { fileId } = req.params;

        if (!isValidUUID(fileId)) {
            res.status(400).json({ error: 'Invalid file ID format' });
            return;
        }

        const tokenPayload = await validateWopiToken(req, res, 'view');
        if (!tokenPayload) return;

        const result = await getFileWithPermissions(fileId, tokenPayload.userId);
        if (!result) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        const { file, canWrite } = result;

        // Check file exists on disk
        if (!await fileExists(file.path)) {
            res.status(404).json({ error: 'File not found on disk' });
            return;
        }

        const stat = await fs.stat(file.path);
        const sha256 = await calculateFileSha256(file.path);

        // Build CheckFileInfo response
        // See: https://docs.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/files/checkfileinfo
        const checkFileInfo: Record<string, unknown> = {
            // Required properties
            BaseFileName: file.name,
            OwnerId: file.userId,
            Size: Number(stat.size),
            UserId: tokenPayload.userId,
            Version: getFileVersion(file),

            // Permissions
            UserCanWrite: canWrite && config.wopi.editEnabled,
            UserCanNotWriteRelative: !canWrite || !config.wopi.editEnabled,
            ReadOnly: !canWrite || !config.wopi.editEnabled,

            // User info
            UserFriendlyName: tokenPayload.userName,
            UserInfo: tokenPayload.userEmail,
            IsAnonymousUser: false,

            // Capabilities
            SupportsUpdate: config.wopi.editEnabled && canWrite,
            SupportsLocks: config.wopi.editEnabled && canWrite,
            SupportsGetLock: config.wopi.editEnabled && canWrite,
            SupportsExtendedLockLength: true,
            SupportsDeleteFile: false, // Not implementing delete via WOPI
            SupportsRename: false, // Not implementing rename via WOPI
            SupportsFolders: false,
            SupportsCoauth: false, // Single-user editing for now

            // File properties
            LastModifiedTime: file.updatedAt.toISOString(),
            FileExtension: path.extname(file.name),

            // Optional but useful
            BreadcrumbBrandName: 'CloudBox',
            BreadcrumbBrandUrl: config.wopi.publicUrl,
            BreadcrumbFolderName: 'Files',
            BreadcrumbFolderUrl: `${config.wopi.publicUrl}/files`,

            // Host capabilities
            HostEditUrl: `${config.wopi.publicUrl}${config.wopi.officeOpenPath}/${fileId}?mode=edit`,
            HostViewUrl: `${config.wopi.publicUrl}${config.wopi.officeOpenPath}/${fileId}?mode=view`,
            FileSharingUrl: `${config.wopi.publicUrl}/files?file=${fileId}`,
        };

        // Add SHA256 if calculated
        if (sha256) {
            checkFileInfo.SHA256 = sha256;
        }

        res.json(checkFileInfo);
    } catch (error) {
        logger.error('WOPI CheckFileInfo error', { fileId: req.params.fileId }, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GetFile
 * GET /wopi/files/{fileId}/contents
 * 
 * Returns the binary contents of the file.
 */
router.get('/files/:fileId/contents', async (req: Request, res: Response) => {
    try {
        const { fileId } = req.params;

        if (!isValidUUID(fileId)) {
            res.status(400).json({ error: 'Invalid file ID format' });
            return;
        }

        const tokenPayload = await validateWopiToken(req, res, 'view');
        if (!tokenPayload) return;

        const file = await prisma.file.findUnique({
            where: { id: fileId },
            select: { id: true, name: true, path: true, mimeType: true, isTrash: true, updatedAt: true, size: true },
        });

        if (!file || file.isTrash) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        if (!await fileExists(file.path)) {
            res.status(404).json({ error: 'File not found on disk' });
            return;
        }

        const stat = await fs.stat(file.path);

        // Set WOPI headers
        res.setHeader('X-WOPI-ItemVersion', getFileVersion(file));
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);

        // Stream the file
        const stream = createReadStream(file.path);

        stream.on('error', (err) => {
            logger.error('WOPI GetFile stream error', { fileId }, err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to stream file' });
            }
        });

        res.on('close', () => {
            stream.destroy();
        });

        stream.pipe(res);
    } catch (error) {
        logger.error('WOPI GetFile error', { fileId: req.params.fileId }, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PutFile
 * POST /wopi/files/{fileId}/contents
 * X-WOPI-Override: PUT
 * 
 * Updates the binary contents of the file.
 */
router.post('/files/:fileId/contents', async (req: Request, res: Response) => {
    try {
        const override = req.headers['x-wopi-override'] as string;
        if (override?.toUpperCase() !== 'PUT') {
            res.status(400).json({ error: 'Invalid X-WOPI-Override header' });
            return;
        }

        const { fileId } = req.params;

        if (!isValidUUID(fileId)) {
            res.status(400).json({ error: 'Invalid file ID format' });
            return;
        }

        if (!config.wopi.editEnabled) {
            res.status(403).json({ error: 'Edit mode is disabled' });
            return;
        }

        const tokenPayload = await validateWopiToken(req, res, 'edit');
        if (!tokenPayload) return;

        const result = await getFileWithPermissions(fileId, tokenPayload.userId);
        if (!result) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        const { file, canWrite } = result;

        if (!canWrite) {
            res.status(403).json({ error: 'User does not have write permission' });
            return;
        }

        // Validate lock if present
        const providedLockId = req.headers['x-wopi-lock'] as string;
        const currentLock = await getLock(fileId);

        if (currentLock) {
            if (!providedLockId || currentLock.lockId !== providedLockId) {
                res.status(409);
                res.setHeader('X-WOPI-Lock', currentLock.lockId);
                res.setHeader('X-WOPI-LockFailureReason', 'Lock mismatch');
                res.json({ error: 'Lock conflict' });
                return;
            }
        }

        // Check file size
        const contentLengthHeader = req.headers['content-length'];
        const contentLength = contentLengthHeader ? parseInt(contentLengthHeader as string, 10) : 0;
        if (contentLength > config.wopi.maxFileSize) {
            res.status(413).json({ error: 'File too large' });
            return;
        }

        // Atomic write: stream to temp then rename
        const tempPath = `${file.path}.wopi-tmp`;
        let actualSize = 0;
        try {
            actualSize = await streamRequestToFile(req, tempPath, config.wopi.maxFileSize);
        } catch (error) {
            await fs.unlink(tempPath).catch(() => { });
            if (error instanceof Error && error.message === 'MAX_SIZE_EXCEEDED') {
                res.status(413).json({ error: 'File too large' });
                return;
            }
            throw error;
        }
        await fs.rename(tempPath, file.path);

        // Update file metadata
        const updatedFile = await prisma.file.update({
            where: { id: fileId },
            data: {
                size: BigInt(actualSize),
                updatedAt: new Date(),
            },
        });

        // Update user storage if size changed
        const sizeDiff = actualSize - Number(file.size);
        if (sizeDiff !== 0) {
            await prisma.user.update({
                where: { id: file.userId },
                data: {
                    storageUsed: { increment: sizeDiff },
                },
            });
        }

        // Set response headers
        res.setHeader('X-WOPI-ItemVersion', getFileVersion(updatedFile));
        res.status(200).json({});
    } catch (error) {
        logger.error('WOPI PutFile error', { fileId: req.params.fileId }, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Lock Operations
 * POST /wopi/files/{fileId}
 * X-WOPI-Override: LOCK | UNLOCK | REFRESH_LOCK | UNLOCK_AND_RELOCK | GET_LOCK
 */
router.post('/files/:fileId', async (req: Request, res: Response) => {
    try {
        const override = (req.headers['x-wopi-override'] as string)?.toUpperCase();
        const { fileId } = req.params;

        if (!isValidUUID(fileId)) {
            res.status(400).json({ error: 'Invalid file ID format' });
            return;
        }

        // Validate operation
        const lockOperations = ['LOCK', 'UNLOCK', 'REFRESH_LOCK', 'GET_LOCK', 'UNLOCK_AND_RELOCK'];
        const otherOperations = ['PUT_RELATIVE'];

        if (lockOperations.includes(override)) {
            await handleLockOperation(req, res, override, fileId);
        } else if (override === 'PUT_RELATIVE') {
            await handlePutRelative(req, res, fileId);
        } else {
            res.status(400).json({ error: 'Invalid X-WOPI-Override header' });
        }
    } catch (error) {
        logger.error('WOPI operation error', {
            fileId: req.params.fileId,
            override: req.headers['x-wopi-override'],
        }, error instanceof Error ? error : undefined);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function handleLockOperation(
    req: Request,
    res: Response,
    operation: string,
    fileId: string
): Promise<void> {
    if (!config.wopi.editEnabled) {
        res.status(403).json({ error: 'Edit mode is disabled' });
        return;
    }

    const tokenPayload = await validateWopiToken(req, res, 'edit');
    if (!tokenPayload) return;

    const result = await getFileWithPermissions(fileId, tokenPayload.userId);
    if (!result) {
        res.status(404).json({ error: 'File not found' });
        return;
    }

    if (!result.canWrite) {
        res.status(403).json({ error: 'User does not have write permission' });
        return;
    }

    const providedLockId = req.headers['x-wopi-lock'] as string;
    const oldLockId = req.headers['x-wopi-oldlock'] as string;

    switch (operation) {
        case 'LOCK': {
            if (!providedLockId) {
                res.status(400).json({ error: 'Missing X-WOPI-Lock header' });
                return;
            }

            const lockResult = await acquireLock(fileId, providedLockId, tokenPayload.userId);

            if (lockResult.success) {
                res.setHeader('X-WOPI-ItemVersion', getFileVersion(result.file));
                res.status(200).json({});
            } else {
                res.status(409);
                res.setHeader('X-WOPI-Lock', lockResult.existingLockId || '');
                res.setHeader('X-WOPI-LockFailureReason', lockResult.reason || 'Lock conflict');
                res.json({ error: 'Lock conflict' });
            }
            break;
        }

        case 'UNLOCK': {
            if (!providedLockId) {
                res.status(400).json({ error: 'Missing X-WOPI-Lock header' });
                return;
            }

            const unlockResult = await releaseLock(fileId, providedLockId);

            if (unlockResult.success) {
                res.setHeader('X-WOPI-ItemVersion', getFileVersion(result.file));
                res.status(200).json({});
            } else {
                res.status(409);
                res.setHeader('X-WOPI-Lock', unlockResult.existingLockId || '');
                res.setHeader('X-WOPI-LockFailureReason', unlockResult.reason || 'Lock mismatch');
                res.json({ error: 'Lock mismatch' });
            }
            break;
        }

        case 'REFRESH_LOCK': {
            if (!providedLockId) {
                res.status(400).json({ error: 'Missing X-WOPI-Lock header' });
                return;
            }

            const refreshResult = await refreshLock(fileId, providedLockId);

            if (refreshResult.success) {
                res.setHeader('X-WOPI-ItemVersion', getFileVersion(result.file));
                res.status(200).json({});
            } else {
                res.status(409);
                res.setHeader('X-WOPI-Lock', refreshResult.existingLockId || '');
                res.setHeader('X-WOPI-LockFailureReason', refreshResult.reason || 'Lock not found');
                res.json({ error: 'Lock not found or mismatch' });
            }
            break;
        }

        case 'GET_LOCK': {
            const currentLock = await getLock(fileId);

            if (currentLock) {
                res.setHeader('X-WOPI-Lock', currentLock.lockId);
            } else {
                res.setHeader('X-WOPI-Lock', '');
            }
            res.status(200).json({});
            break;
        }

        case 'UNLOCK_AND_RELOCK': {
            if (!providedLockId || !oldLockId) {
                res.status(400).json({ error: 'Missing X-WOPI-Lock or X-WOPI-OldLock header' });
                return;
            }

            const relockResult = await unlockAndRelock(fileId, oldLockId, providedLockId, tokenPayload.userId);

            if (relockResult.success) {
                res.setHeader('X-WOPI-ItemVersion', getFileVersion(result.file));
                res.status(200).json({});
            } else {
                res.status(409);
                res.setHeader('X-WOPI-Lock', relockResult.existingLockId || '');
                res.setHeader('X-WOPI-LockFailureReason', relockResult.reason || 'Lock operation failed');
                res.json({ error: 'Lock operation failed' });
            }
            break;
        }
    }
}

async function handlePutRelative(req: Request, res: Response, fileId: string): Promise<void> {
    if (!config.wopi.editEnabled) {
        res.status(403).json({ error: 'Edit mode is disabled' });
        return;
    }

    const tokenPayload = await validateWopiToken(req, res, 'edit');
    if (!tokenPayload) return;

    const result = await getFileWithPermissions(fileId, tokenPayload.userId);
    if (!result) {
        res.status(404).json({ error: 'File not found' });
        return;
    }

    if (!result.canWrite) {
        res.status(501).json({ error: 'PutRelativeFile not implemented for non-owners' });
        return;
    }

    // Get suggested or relative target
    const suggestedTarget = req.headers['x-wopi-suggestedtarget'] as string;
    const relativeTarget = req.headers['x-wopi-relativetarget'] as string;
    const overwriteRelative = (req.headers['x-wopi-overwriterelativetarget'] as string)?.toLowerCase() === 'true';

    let newFileName: string;

    if (relativeTarget) {
        // Use exact filename
        newFileName = relativeTarget;
    } else if (suggestedTarget) {
        // Suggested target can be extension only (starts with .) or full name
        if (suggestedTarget.startsWith('.')) {
            // Extension only - use original name with new extension
            const baseName = path.basename(result.file.name, path.extname(result.file.name));
            newFileName = baseName + suggestedTarget;
        } else {
            newFileName = suggestedTarget;
        }
    } else {
        // Default: create copy with timestamp
        const baseName = path.basename(result.file.name, path.extname(result.file.name));
        const ext = path.extname(result.file.name);
        newFileName = `${baseName}_${Date.now()}${ext}`;
    }

    // Check if file with same name exists
    const existingFile = await prisma.file.findFirst({
        where: {
            userId: result.file.userId,
            folderId: result.file.folderId,
            name: newFileName,
            isTrash: false,
        },
    });

    if (existingFile && !overwriteRelative) {
        res.status(409);
        res.setHeader('X-WOPI-ValidRelativeTarget', newFileName);
        res.json({ error: 'File already exists' });
        return;
    }

    // Collect request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    const content = Buffer.concat(chunks);

    // Create new file
    const newFileId = uuidv4();
    const ext = path.extname(newFileName);
    const newFilePath = getUserFilePath(result.file.userId, newFileId, ext);

    await fs.mkdir(path.dirname(newFilePath), { recursive: true });
    await fs.writeFile(newFilePath, content);

    // If overwriting, delete old file first
    if (existingFile && overwriteRelative) {
        await prisma.file.delete({ where: { id: existingFile.id } });
        await fs.unlink(existingFile.path).catch(() => { });
    }

    // Create file record
    const newFile = await prisma.file.create({
        data: {
            id: newFileId,
            name: newFileName,
            originalName: newFileName,
            mimeType: result.file.mimeType,
            size: BigInt(content.length),
            path: newFilePath,
            userId: result.file.userId,
            folderId: result.file.folderId,
        },
    });

    // Update user storage
    await prisma.user.update({
        where: { id: result.file.userId },
        data: {
            storageUsed: { increment: content.length },
        },
    });

    // Response with new file info
    res.json({
        Name: newFile.name,
        Url: `${config.wopi.publicUrl}${config.wopi.basePath}/files/${newFile.id}`,
        HostViewUrl: `${config.wopi.publicUrl}${config.wopi.officeOpenPath}/${newFile.id}?mode=view`,
        HostEditUrl: `${config.wopi.publicUrl}${config.wopi.officeOpenPath}/${newFile.id}?mode=edit`,
    });
}

export default router;
