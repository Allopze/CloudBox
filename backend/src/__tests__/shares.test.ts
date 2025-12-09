/**
 * Tests for Share Routes
 * 
 * Tests share creation, permissions, password protection, expiration, and download limits.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import prisma from '../lib/prisma.js';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// Test data
let testUserId: string;
let testUserEmail: string;
let testFileId: string;
let testFolderId: string;

describe('Shares - Database Operations', () => {
    beforeAll(async () => {
        // Create a test user
        testUserEmail = `share-test-${Date.now()}@test.com`;
        const hashedPassword = await bcrypt.hash('testpassword', 10);

        const user = await prisma.user.create({
            data: {
                email: testUserEmail,
                password: hashedPassword,
                name: 'Share Test User',
                storageQuota: BigInt(5368709120),
            },
        });
        testUserId = user.id;

        // Create a test file
        const file = await prisma.file.create({
            data: {
                name: 'test-file.txt',
                originalName: 'test-file.txt',
                path: '/test/test-file.txt',
                mimeType: 'text/plain',
                size: BigInt(1024),
                userId: testUserId,
            },
        });
        testFileId = file.id;

        // Create a test folder
        const folder = await prisma.folder.create({
            data: {
                name: 'Test Folder',
                userId: testUserId,
            },
        });
        testFolderId = folder.id;
    });

    afterAll(async () => {
        // Clean up in order
        await prisma.shareCollaborator.deleteMany({});
        await prisma.share.deleteMany({});
        await prisma.file.deleteMany({ where: { userId: testUserId } });
        await prisma.folder.deleteMany({ where: { userId: testUserId } });
        await prisma.user.delete({ where: { id: testUserId } });
        await prisma.$disconnect();
    });

    afterEach(async () => {
        // Clean up shares after each test
        await prisma.shareCollaborator.deleteMany({});
        await prisma.share.deleteMany({});
    });

    describe('Share Creation', () => {
        it('should create a public share for a file', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            expect(share).toBeDefined();
            expect(share.type).toBe('PUBLIC');
            expect(share.publicToken).toBeDefined();
            expect(share.fileId).toBe(testFileId);
        });

        it('should create a private share for a file', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PRIVATE',
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            expect(share.type).toBe('PRIVATE');
            expect(share.publicToken).toBeNull();
        });

        it('should create a share for a folder', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    folderId: testFolderId,
                },
            });

            expect(share.folderId).toBe(testFolderId);
        });

        it('should create a password-protected share', async () => {
            const hashedPassword = await bcrypt.hash('sharepassword', 10);

            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                    password: hashedPassword,
                },
            });

            expect(share.password).toBeDefined();

            // Verify password
            const valid = await bcrypt.compare('sharepassword', share.password!);
            expect(valid).toBe(true);
        });

        it('should create a share with expiration date', async () => {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                    expiresAt,
                },
            });

            expect(share.expiresAt).toBeDefined();
            expect(share.expiresAt!.getTime()).toBeGreaterThan(Date.now());
        });

        it('should create a share with download limit', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                    downloadLimit: 10,
                },
            });

            expect(share.downloadLimit).toBe(10);
            expect(share.downloadCount).toBe(0);
        });
    });

    describe('Share Queries', () => {
        it('should find share by public token', async () => {
            const token = randomUUID();

            await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: token,
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            const found = await prisma.share.findFirst({
                where: { publicToken: token },
            });

            expect(found).toBeDefined();
            expect(found?.publicToken).toBe(token);
        });

        it('should find all shares by owner', async () => {
            await prisma.share.createMany({
                data: [
                    { id: randomUUID(), type: 'PUBLIC', publicToken: randomUUID(), ownerId: testUserId, fileId: testFileId },
                    { id: randomUUID(), type: 'PUBLIC', publicToken: randomUUID(), ownerId: testUserId, fileId: testFileId },
                ],
            });

            const shares = await prisma.share.findMany({
                where: { ownerId: testUserId },
            });

            expect(shares.length).toBe(2);
        });

        it('should find expired shares', async () => {
            const expiredDate = new Date();
            expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

            await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                    expiresAt: expiredDate,
                },
            });

            const expired = await prisma.share.findMany({
                where: {
                    expiresAt: { lt: new Date() },
                },
            });

            expect(expired.length).toBeGreaterThanOrEqual(1);
        });

        it('should find share with file included', async () => {
            const token = randomUUID();

            await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: token,
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            const share = await prisma.share.findFirst({
                where: { publicToken: token },
                include: { file: true },
            });

            expect(share?.file).toBeDefined();
            expect(share?.file?.name).toBe('test-file.txt');
        });
    });

    describe('Share Updates', () => {
        it('should update download count', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                    downloadCount: 0,
                },
            });

            const updated = await prisma.share.update({
                where: { id: share.id },
                data: { downloadCount: { increment: 1 } },
            });

            expect(updated.downloadCount).toBe(1);
        });

        it('should update expiration date', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            const newExpiry = new Date();
            newExpiry.setDate(newExpiry.getDate() + 30);

            const updated = await prisma.share.update({
                where: { id: share.id },
                data: { expiresAt: newExpiry },
            });

            expect(updated.expiresAt).toBeDefined();
        });

        it('should update password', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            const newPassword = await bcrypt.hash('newpassword', 10);

            const updated = await prisma.share.update({
                where: { id: share.id },
                data: { password: newPassword },
            });

            expect(updated.password).toBeDefined();
        });

        it('should remove password', async () => {
            const hashedPassword = await bcrypt.hash('password', 10);

            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                    password: hashedPassword,
                },
            });

            const updated = await prisma.share.update({
                where: { id: share.id },
                data: { password: null },
            });

            expect(updated.password).toBeNull();
        });
    });

    describe('Share Deletion', () => {
        it('should delete a share', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            await prisma.share.delete({
                where: { id: share.id },
            });

            const found = await prisma.share.findUnique({
                where: { id: share.id },
            });

            expect(found).toBeNull();
        });

        it('should delete multiple shares at once', async () => {
            const share1 = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            const share2 = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            await prisma.share.deleteMany({
                where: { id: { in: [share1.id, share2.id] } },
            });

            const count = await prisma.share.count({
                where: { ownerId: testUserId },
            });

            expect(count).toBe(0);
        });
    });

    describe('Share Collaborators', () => {
        it('should add a collaborator to a share', async () => {
            // Create another user to be collaborator
            const collaboratorUser = await prisma.user.create({
                data: {
                    email: `collab-${Date.now()}@test.com`,
                    password: await bcrypt.hash('test', 10),
                    name: 'Collaborator',
                    storageQuota: BigInt(5368709120),
                },
            });

            const share = await prisma.share.create({
                data: {
                    type: 'PRIVATE',
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            const collaborator = await prisma.shareCollaborator.create({
                data: {
                    shareId: share.id,
                    userId: collaboratorUser.id,
                    permission: 'VIEW',
                },
            });

            expect(collaborator.shareId).toBe(share.id);
            expect(collaborator.userId).toBe(collaboratorUser.id);
            expect(collaborator.permission).toBe('VIEW');

            // Cleanup
            await prisma.shareCollaborator.delete({ where: { id: collaborator.id } });
            await prisma.share.delete({ where: { id: share.id } });
            await prisma.user.delete({ where: { id: collaboratorUser.id } });
        });

        it('should update collaborator permission', async () => {
            const collaboratorUser = await prisma.user.create({
                data: {
                    email: `collab2-${Date.now()}@test.com`,
                    password: await bcrypt.hash('test', 10),
                    name: 'Collaborator 2',
                    storageQuota: BigInt(5368709120),
                },
            });

            const share = await prisma.share.create({
                data: {
                    type: 'PRIVATE',
                    ownerId: testUserId,
                    fileId: testFileId,
                },
            });

            const collaborator = await prisma.shareCollaborator.create({
                data: {
                    shareId: share.id,
                    userId: collaboratorUser.id,
                    permission: 'VIEW',
                },
            });

            const updated = await prisma.shareCollaborator.update({
                where: { id: collaborator.id },
                data: { permission: 'EDIT' },
            });

            expect(updated.permission).toBe('EDIT');

            // Cleanup
            await prisma.shareCollaborator.delete({ where: { id: collaborator.id } });
            await prisma.share.delete({ where: { id: share.id } });
            await prisma.user.delete({ where: { id: collaboratorUser.id } });
        });
    });

    describe('Share Validation', () => {
        it('should check if share is expired', async () => {
            const expiredDate = new Date();
            expiredDate.setHours(expiredDate.getHours() - 1); // 1 hour ago

            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                    expiresAt: expiredDate,
                },
            });

            const isExpired = share.expiresAt && share.expiresAt < new Date();
            expect(isExpired).toBe(true);
        });

        it('should check if download limit reached', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                    downloadLimit: 5,
                    downloadCount: 5,
                },
            });

            const limitReached = share.downloadLimit !== null && share.downloadCount >= share.downloadLimit;
            expect(limitReached).toBe(true);
        });

        it('should allow download when under limit', async () => {
            const share = await prisma.share.create({
                data: {
                    type: 'PUBLIC',
                    publicToken: randomUUID(),
                    ownerId: testUserId,
                    fileId: testFileId,
                    downloadLimit: 5,
                    downloadCount: 3,
                },
            });

            const limitReached = share.downloadLimit !== null && share.downloadCount >= share.downloadLimit;
            expect(limitReached).toBe(false);
        });
    });
});
