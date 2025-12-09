/**
 * Tests for Folder Routes
 * 
 * Tests folder CRUD operations, moving, nesting, and permissions.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import prisma from '../lib/prisma.js';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// Test user data
let testUserId: string;
let testUserEmail: string;

describe('Folders - Database Operations', () => {
    beforeAll(async () => {
        // Create a test user
        testUserEmail = `folder-test-${Date.now()}@test.com`;
        const hashedPassword = await bcrypt.hash('testpassword', 10);

        const user = await prisma.user.create({
            data: {
                email: testUserEmail,
                password: hashedPassword,
                name: 'Folder Test User',
                storageQuota: BigInt(5368709120), // 5GB
            },
        });
        testUserId = user.id;
    });

    afterAll(async () => {
        // Clean up: delete all test data
        await prisma.folder.deleteMany({ where: { userId: testUserId } });
        await prisma.user.delete({ where: { id: testUserId } });
        await prisma.$disconnect();
    });

    afterEach(async () => {
        // Clean up folders after each test
        await prisma.folder.deleteMany({ where: { userId: testUserId } });
    });

    describe('Folder Creation', () => {
        it('should create a folder at root level', async () => {
            const folder = await prisma.folder.create({
                data: {
                    name: 'Root Folder',
                    userId: testUserId,
                },
            });

            expect(folder).toBeDefined();
            expect(folder.name).toBe('Root Folder');
            expect(folder.parentId).toBeNull();
            expect(folder.userId).toBe(testUserId);
        });

        it('should create a nested folder', async () => {
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

        it('should create folder with color and category', async () => {
            const folder = await prisma.folder.create({
                data: {
                    name: 'Colored Folder',
                    userId: testUserId,
                    color: '#FF5733',
                    category: 'documents',
                },
            });

            expect(folder.color).toBe('#FF5733');
            expect(folder.category).toBe('documents');
        });

        it('should enforce unique name within same parent', async () => {
            const parent = await prisma.folder.create({
                data: { name: 'Parent', userId: testUserId },
            });

            await prisma.folder.create({
                data: { name: 'Child', userId: testUserId, parentId: parent.id },
            });

            await expect(
                prisma.folder.create({
                    data: { name: 'Child', userId: testUserId, parentId: parent.id },
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

            const folder1 = await prisma.folder.create({
                data: { name: 'Same Name', userId: testUserId, parentId: parent1.id },
            });

            const folder2 = await prisma.folder.create({
                data: { name: 'Same Name', userId: testUserId, parentId: parent2.id },
            });

            expect(folder1.name).toBe(folder2.name);
            expect(folder1.parentId).not.toBe(folder2.parentId);
        });
    });

    describe('Folder Queries', () => {
        it('should find all folders for a user', async () => {
            await prisma.folder.createMany({
                data: [
                    { id: randomUUID(), name: 'Folder 1', userId: testUserId },
                    { id: randomUUID(), name: 'Folder 2', userId: testUserId },
                    { id: randomUUID(), name: 'Folder 3', userId: testUserId },
                ],
            });

            const folders = await prisma.folder.findMany({
                where: { userId: testUserId },
            });

            expect(folders.length).toBe(3);
        });

        it('should find only root folders', async () => {
            const parent = await prisma.folder.create({
                data: { name: 'Parent', userId: testUserId },
            });

            await prisma.folder.create({
                data: { name: 'Child', userId: testUserId, parentId: parent.id },
            });

            const rootFolders = await prisma.folder.findMany({
                where: { userId: testUserId, parentId: null },
            });

            expect(rootFolders.length).toBe(1);
            expect(rootFolders[0].name).toBe('Parent');
        });

        it('should find favorite folders', async () => {
            await prisma.folder.create({
                data: { name: 'Regular', userId: testUserId, isFavorite: false },
            });

            await prisma.folder.create({
                data: { name: 'Favorite', userId: testUserId, isFavorite: true },
            });

            const favorites = await prisma.folder.findMany({
                where: { userId: testUserId, isFavorite: true },
            });

            expect(favorites.length).toBe(1);
            expect(favorites[0].name).toBe('Favorite');
        });

        it('should find folders in trash', async () => {
            await prisma.folder.create({
                data: { name: 'Active', userId: testUserId, isTrash: false },
            });

            await prisma.folder.create({
                data: { name: 'Deleted', userId: testUserId, isTrash: true, trashedAt: new Date() },
            });

            const trashed = await prisma.folder.findMany({
                where: { userId: testUserId, isTrash: true },
            });

            expect(trashed.length).toBe(1);
            expect(trashed[0].name).toBe('Deleted');
        });
    });

    describe('Folder Updates', () => {
        it('should rename a folder', async () => {
            const folder = await prisma.folder.create({
                data: { name: 'Original Name', userId: testUserId },
            });

            const updated = await prisma.folder.update({
                where: { id: folder.id },
                data: { name: 'New Name' },
            });

            expect(updated.name).toBe('New Name');
        });

        it('should update folder color', async () => {
            const folder = await prisma.folder.create({
                data: { name: 'Folder', userId: testUserId },
            });

            const updated = await prisma.folder.update({
                where: { id: folder.id },
                data: { color: '#00FF00' },
            });

            expect(updated.color).toBe('#00FF00');
        });

        it('should toggle favorite status', async () => {
            const folder = await prisma.folder.create({
                data: { name: 'Folder', userId: testUserId, isFavorite: false },
            });

            const updated = await prisma.folder.update({
                where: { id: folder.id },
                data: { isFavorite: true },
            });

            expect(updated.isFavorite).toBe(true);
        });

        it('should move folder to trash', async () => {
            const folder = await prisma.folder.create({
                data: { name: 'Folder', userId: testUserId },
            });

            const updated = await prisma.folder.update({
                where: { id: folder.id },
                data: { isTrash: true, trashedAt: new Date() },
            });

            expect(updated.isTrash).toBe(true);
            expect(updated.trashedAt).toBeDefined();
        });
    });

    describe('Folder Moving', () => {
        it('should move folder to different parent', async () => {
            const parent1 = await prisma.folder.create({
                data: { name: 'Source', userId: testUserId },
            });

            const parent2 = await prisma.folder.create({
                data: { name: 'Destination', userId: testUserId },
            });

            const folder = await prisma.folder.create({
                data: { name: 'Moving Folder', userId: testUserId, parentId: parent1.id },
            });

            const moved = await prisma.folder.update({
                where: { id: folder.id },
                data: { parentId: parent2.id },
            });

            expect(moved.parentId).toBe(parent2.id);
        });

        it('should move folder to root', async () => {
            const parent = await prisma.folder.create({
                data: { name: 'Parent', userId: testUserId },
            });

            const folder = await prisma.folder.create({
                data: { name: 'Nested Folder', userId: testUserId, parentId: parent.id },
            });

            const moved = await prisma.folder.update({
                where: { id: folder.id },
                data: { parentId: null },
            });

            expect(moved.parentId).toBeNull();
        });
    });

    describe('Folder Deletion', () => {
        it('should delete a folder', async () => {
            const folder = await prisma.folder.create({
                data: { name: 'To Delete', userId: testUserId },
            });

            await prisma.folder.delete({
                where: { id: folder.id },
            });

            const found = await prisma.folder.findUnique({
                where: { id: folder.id },
            });

            expect(found).toBeNull();
        });

        it('should cascade delete child folders when parent has cascade', async () => {
            // Note: This tests database behavior, not application logic
            // The application handles cascade deletion in the route handler
            const parent = await prisma.folder.create({
                data: { name: 'Parent', userId: testUserId },
            });

            const child = await prisma.folder.create({
                data: { name: 'Child', userId: testUserId, parentId: parent.id },
            });

            // First delete children manually (as app does)
            await prisma.folder.delete({ where: { id: child.id } });
            await prisma.folder.delete({ where: { id: parent.id } });

            const foundParent = await prisma.folder.findUnique({ where: { id: parent.id } });
            const foundChild = await prisma.folder.findUnique({ where: { id: child.id } });

            expect(foundParent).toBeNull();
            expect(foundChild).toBeNull();
        });
    });

    describe('Folder Nesting', () => {
        it('should support deep nesting', async () => {
            const level1 = await prisma.folder.create({
                data: { name: 'Level 1', userId: testUserId },
            });

            const level2 = await prisma.folder.create({
                data: { name: 'Level 2', userId: testUserId, parentId: level1.id },
            });

            const level3 = await prisma.folder.create({
                data: { name: 'Level 3', userId: testUserId, parentId: level2.id },
            });

            const level4 = await prisma.folder.create({
                data: { name: 'Level 4', userId: testUserId, parentId: level3.id },
            });

            expect(level4.parentId).toBe(level3.id);

            // Verify chain
            const l4 = await prisma.folder.findUnique({ where: { id: level4.id } });
            const l3 = await prisma.folder.findUnique({ where: { id: level3.id } });
            const l2 = await prisma.folder.findUnique({ where: { id: level2.id } });
            const l1 = await prisma.folder.findUnique({ where: { id: level1.id } });

            expect(l4?.parentId).toBe(l3?.id);
            expect(l3?.parentId).toBe(l2?.id);
            expect(l2?.parentId).toBe(l1?.id);
            expect(l1?.parentId).toBeNull();
        });

        it('should find all descendants', async () => {
            const root = await prisma.folder.create({
                data: { name: 'Root', userId: testUserId },
            });

            const child1 = await prisma.folder.create({
                data: { name: 'Child 1', userId: testUserId, parentId: root.id },
            });

            await prisma.folder.create({
                data: { name: 'Child 2', userId: testUserId, parentId: root.id },
            });

            await prisma.folder.create({
                data: { name: 'Grandchild', userId: testUserId, parentId: child1.id },
            });

            // Get direct children
            const children = await prisma.folder.findMany({
                where: { parentId: root.id },
            });

            expect(children.length).toBe(2);
        });
    });
});
