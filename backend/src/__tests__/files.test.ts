import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import prisma from '../lib/prisma.js';
import path from 'path';

/**
 * Files CRUD Unit Tests
 * 
 * These tests verify file and folder database operations.
 * For full integration tests with actual file uploads, see upload.integration.test.ts
 */

describe('Files - Database Operations', () => {
    let testUserId: string;
    const testEmail = 'files-test@cloudbox.test';

    beforeAll(async () => {
        // Create test user
        const user = await prisma.user.upsert({
            where: { email: testEmail },
            update: {},
            create: {
                email: testEmail,
                password: 'hashedpassword',
                name: 'Files Test User',
                role: 'USER',
                storageQuota: BigInt(5368709120),
            },
        });
        testUserId = user.id;
    });

    beforeEach(async () => {
        // Clean files and folders
        await prisma.file.deleteMany({ where: { userId: testUserId } });
        await prisma.folder.deleteMany({ where: { userId: testUserId } });
    });

    afterAll(async () => {
        await prisma.file.deleteMany({ where: { userId: testUserId } });
        await prisma.folder.deleteMany({ where: { userId: testUserId } });
        await prisma.user.delete({ where: { id: testUserId } }).catch(() => { });
    });

    describe('File Creation', () => {
        it('should create a file record', async () => {
            const file = await prisma.file.create({
                data: {
                    name: 'test-file.txt',
                    originalName: 'test-file.txt',
                    mimeType: 'text/plain',
                    size: BigInt(1024),
                    path: '/data/test-file.txt',
                    userId: testUserId,
                },
            });

            expect(file.id).toBeDefined();
            expect(file.name).toBe('test-file.txt');
            expect(file.mimeType).toBe('text/plain');
            expect(file.size.toString()).toBe('1024');
            expect(file.isTrash).toBe(false);
            expect(file.isFavorite).toBe(false);
        });

        it('should create file in a folder', async () => {
            // Create folder first
            const folder = await prisma.folder.create({
                data: {
                    name: 'Test Folder',
                    userId: testUserId,
                },
            });

            // Create file in folder
            const file = await prisma.file.create({
                data: {
                    name: 'nested-file.txt',
                    originalName: 'nested-file.txt',
                    mimeType: 'text/plain',
                    size: BigInt(512),
                    path: '/data/nested-file.txt',
                    userId: testUserId,
                    folderId: folder.id,
                },
            });

            expect(file.folderId).toBe(folder.id);
        });

        it('should handle different mime types', async () => {
            const mimeTypes = [
                { name: 'image.png', mimeType: 'image/png' },
                { name: 'video.mp4', mimeType: 'video/mp4' },
                { name: 'audio.mp3', mimeType: 'audio/mpeg' },
                { name: 'document.pdf', mimeType: 'application/pdf' },
                { name: 'archive.zip', mimeType: 'application/zip' },
            ];

            for (const { name, mimeType } of mimeTypes) {
                const file = await prisma.file.create({
                    data: {
                        name,
                        originalName: name,
                        mimeType,
                        size: BigInt(1024),
                        path: `/data/${name}`,
                        userId: testUserId,
                    },
                });

                expect(file.mimeType).toBe(mimeType);
            }
        });
    });

    describe('File Queries', () => {
        beforeEach(async () => {
            // Create test files
            await prisma.file.createMany({
                data: [
                    { name: 'file1.txt', originalName: 'file1.txt', mimeType: 'text/plain', size: BigInt(100), path: '/data/file1.txt', userId: testUserId },
                    { name: 'file2.txt', originalName: 'file2.txt', mimeType: 'text/plain', size: BigInt(200), path: '/data/file2.txt', userId: testUserId },
                    { name: 'file3.pdf', originalName: 'file3.pdf', mimeType: 'application/pdf', size: BigInt(300), path: '/data/file3.pdf', userId: testUserId },
                ],
            });
        });

        it('should list files for user', async () => {
            const files = await prisma.file.findMany({
                where: { userId: testUserId, isTrash: false },
            });

            expect(files.length).toBe(3);
        });

        it('should filter by mime type', async () => {
            const pdfFiles = await prisma.file.findMany({
                where: {
                    userId: testUserId,
                    mimeType: { startsWith: 'application/' }
                },
            });

            expect(pdfFiles.length).toBe(1);
            expect(pdfFiles[0].name).toBe('file3.pdf');
        });

        it('should order by creation date', async () => {
            const files = await prisma.file.findMany({
                where: { userId: testUserId },
                orderBy: { createdAt: 'desc' },
            });

            expect(files.length).toBe(3);
            // Most recent should be first
            const timestamps = files.map(f => f.createdAt.getTime());
            expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
        });

        it('should paginate results', async () => {
            const page1 = await prisma.file.findMany({
                where: { userId: testUserId },
                take: 2,
                skip: 0,
            });

            const page2 = await prisma.file.findMany({
                where: { userId: testUserId },
                take: 2,
                skip: 2,
            });

            expect(page1.length).toBe(2);
            expect(page2.length).toBe(1);
        });
    });

    describe('File Updates', () => {
        let fileId: string;

        beforeEach(async () => {
            const file = await prisma.file.create({
                data: {
                    name: 'update-test.txt',
                    originalName: 'update-test.txt',
                    mimeType: 'text/plain',
                    size: BigInt(1024),
                    path: '/data/update-test.txt',
                    userId: testUserId,
                },
            });
            fileId = file.id;
        });

        it('should rename file', async () => {
            const updated = await prisma.file.update({
                where: { id: fileId },
                data: { name: 'renamed-file.txt' },
            });

            expect(updated.name).toBe('renamed-file.txt');
        });

        it('should toggle favorite', async () => {
            // Add to favorites
            let updated = await prisma.file.update({
                where: { id: fileId },
                data: { isFavorite: true },
            });
            expect(updated.isFavorite).toBe(true);

            // Remove from favorites
            updated = await prisma.file.update({
                where: { id: fileId },
                data: { isFavorite: false },
            });
            expect(updated.isFavorite).toBe(false);
        });

        it('should move to trash', async () => {
            const updated = await prisma.file.update({
                where: { id: fileId },
                data: {
                    isTrash: true,
                    trashedAt: new Date(),
                },
            });

            expect(updated.isTrash).toBe(true);
            expect(updated.trashedAt).toBeDefined();
        });

        it('should restore from trash', async () => {
            // Move to trash first
            await prisma.file.update({
                where: { id: fileId },
                data: { isTrash: true, trashedAt: new Date() },
            });

            // Restore
            const restored = await prisma.file.update({
                where: { id: fileId },
                data: { isTrash: false, trashedAt: null },
            });

            expect(restored.isTrash).toBe(false);
            expect(restored.trashedAt).toBeNull();
        });
    });

    describe('File Deletion', () => {
        it('should delete single file', async () => {
            const file = await prisma.file.create({
                data: {
                    name: 'delete-me.txt',
                    originalName: 'delete-me.txt',
                    mimeType: 'text/plain',
                    size: BigInt(1024),
                    path: '/data/delete-me.txt',
                    userId: testUserId,
                },
            });

            await prisma.file.delete({ where: { id: file.id } });

            const deleted = await prisma.file.findUnique({
                where: { id: file.id },
            });

            expect(deleted).toBeNull();
        });

        it('should delete files in trash older than retention period', async () => {
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago

            await prisma.file.create({
                data: {
                    name: 'old-trash.txt',
                    originalName: 'old-trash.txt',
                    mimeType: 'text/plain',
                    size: BigInt(1024),
                    path: '/data/old-trash.txt',
                    userId: testUserId,
                    isTrash: true,
                    trashedAt: oldDate,
                },
            });

            const retentionDays = 30;
            const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

            const deleted = await prisma.file.deleteMany({
                where: {
                    userId: testUserId,
                    isTrash: true,
                    trashedAt: { lt: cutoffDate },
                },
            });

            expect(deleted.count).toBe(1);
        });
    });
});

describe('Folders - Database Operations', () => {
    let testUserId: string;
    const testEmail = 'folders-test@cloudbox.test';

    beforeAll(async () => {
        const user = await prisma.user.upsert({
            where: { email: testEmail },
            update: {},
            create: {
                email: testEmail,
                password: 'hashedpassword',
                name: 'Folders Test User',
                role: 'USER',
                storageQuota: BigInt(5368709120),
            },
        });
        testUserId = user.id;
    });

    beforeEach(async () => {
        await prisma.file.deleteMany({ where: { userId: testUserId } });
        await prisma.folder.deleteMany({ where: { userId: testUserId } });
    });

    afterAll(async () => {
        await prisma.file.deleteMany({ where: { userId: testUserId } });
        await prisma.folder.deleteMany({ where: { userId: testUserId } });
        await prisma.user.delete({ where: { id: testUserId } }).catch(() => { });
    });

    describe('Folder Creation', () => {
        it('should create a root folder', async () => {
            const folder = await prisma.folder.create({
                data: {
                    name: 'My Documents',
                    userId: testUserId,
                },
            });

            expect(folder.id).toBeDefined();
            expect(folder.name).toBe('My Documents');
            expect(folder.parentId).toBeNull();
        });

        it('should create nested folders', async () => {
            const parent = await prisma.folder.create({
                data: { name: 'Parent', userId: testUserId },
            });

            const child = await prisma.folder.create({
                data: {
                    name: 'Child',
                    userId: testUserId,
                    parentId: parent.id,
                },
            });

            expect(child.parentId).toBe(parent.id);
        });

        it('should enforce unique name within same parent', async () => {
            // Create a parent folder first (because NULL parentId is treated as unique each time in PostgreSQL)
            const parent = await prisma.folder.create({
                data: { name: 'Parent Container', userId: testUserId },
            });

            await prisma.folder.create({
                data: { name: 'Unique Folder', userId: testUserId, parentId: parent.id },
            });

            await expect(
                prisma.folder.create({
                    data: { name: 'Unique Folder', userId: testUserId, parentId: parent.id },
                })
            ).rejects.toThrow();
        });

        it('should allow same name in different parents', async () => {
            const parent1 = await prisma.folder.create({
                data: { name: 'Parent 1', userId: testUserId },
            });

            const parent2 = await prisma.folder.create({
                data: { name: 'Parent 2', userId: testUserId },
            });

            // Same name but different parents - should work
            const child1 = await prisma.folder.create({
                data: {
                    name: 'Same Name',
                    userId: testUserId,
                    parentId: parent1.id,
                },
            });

            const child2 = await prisma.folder.create({
                data: {
                    name: 'Same Name',
                    userId: testUserId,
                    parentId: parent2.id,
                },
            });

            expect(child1.name).toBe(child2.name);
            expect(child1.parentId).not.toBe(child2.parentId);
        });
    });

    describe('Folder Queries', () => {
        it('should get folder with its children', async () => {
            const parent = await prisma.folder.create({
                data: { name: 'Parent', userId: testUserId },
            });

            await prisma.folder.createMany({
                data: [
                    { name: 'Child 1', userId: testUserId, parentId: parent.id },
                    { name: 'Child 2', userId: testUserId, parentId: parent.id },
                ],
            });

            const folderWithChildren = await prisma.folder.findUnique({
                where: { id: parent.id },
                include: { children: true },
            });

            expect(folderWithChildren?.children.length).toBe(2);
        });

        it('should get folder with its files', async () => {
            const folder = await prisma.folder.create({
                data: { name: 'Files Folder', userId: testUserId },
            });

            await prisma.file.createMany({
                data: [
                    { name: 'file1.txt', originalName: 'file1.txt', mimeType: 'text/plain', size: BigInt(100), path: '/data/file1.txt', userId: testUserId, folderId: folder.id },
                    { name: 'file2.txt', originalName: 'file2.txt', mimeType: 'text/plain', size: BigInt(100), path: '/data/file2.txt', userId: testUserId, folderId: folder.id },
                ],
            });

            const folderWithFiles = await prisma.folder.findUnique({
                where: { id: folder.id },
                include: { files: true },
            });

            expect(folderWithFiles?.files.length).toBe(2);
        });
    });

    describe('Cascade Delete', () => {
        it('should cascade delete children when parent is deleted', async () => {
            const parent = await prisma.folder.create({
                data: { name: 'Parent To Delete', userId: testUserId },
            });

            const child = await prisma.folder.create({
                data: {
                    name: 'Child To Cascade',
                    userId: testUserId,
                    parentId: parent.id,
                },
            });

            // Delete parent
            await prisma.folder.delete({ where: { id: parent.id } });

            // Child should also be deleted
            const deletedChild = await prisma.folder.findUnique({
                where: { id: child.id },
            });

            expect(deletedChild).toBeNull();
        });
    });
});

describe('Storage Quota', () => {
    let testUserId: string;
    const testEmail = 'quota-test@cloudbox.test';

    beforeAll(async () => {
        const user = await prisma.user.upsert({
            where: { email: testEmail },
            update: { storageUsed: BigInt(0) },
            create: {
                email: testEmail,
                password: 'hashedpassword',
                name: 'Quota Test User',
                role: 'USER',
                storageQuota: BigInt(5368709120), // 5GB
                storageUsed: BigInt(0),
            },
        });
        testUserId = user.id;
    });

    afterAll(async () => {
        await prisma.file.deleteMany({ where: { userId: testUserId } });
        await prisma.user.delete({ where: { id: testUserId } }).catch(() => { });
    });

    it('should track storage usage', async () => {
        const fileSize = BigInt(1024 * 1024); // 1MB

        // Simulate file upload by updating storage used
        const updated = await prisma.user.update({
            where: { id: testUserId },
            data: {
                storageUsed: { increment: fileSize }
            },
        });

        expect(updated.storageUsed.toString()).toBe(fileSize.toString());
    });

    it('should check quota before upload', async () => {
        const user = await prisma.user.findUnique({
            where: { id: testUserId },
        });

        const newFileSize = BigInt(1024 * 1024); // 1MB
        const wouldExceedQuota =
            (user!.storageUsed + newFileSize) > user!.storageQuota;

        // With 5GB quota and minimal usage, should not exceed
        expect(wouldExceedQuota).toBe(false);
    });

    it('should detect quota exceeded', async () => {
        // Set storage near quota
        await prisma.user.update({
            where: { id: testUserId },
            data: { storageUsed: BigInt(5368709110) }, // Just under 5GB
        });

        const user = await prisma.user.findUnique({
            where: { id: testUserId },
        });

        const largeFileSize = BigInt(100 * 1024 * 1024); // 100MB
        const wouldExceedQuota =
            (user!.storageUsed + largeFileSize) > user!.storageQuota;

        expect(wouldExceedQuota).toBe(true);
    });
});
