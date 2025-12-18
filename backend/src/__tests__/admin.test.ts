import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import prisma from '../lib/prisma.js';

/**
 * Admin Routes Unit Tests
 * 
 * These tests verify admin operations like user management and settings.
 */

describe('Admin - User Management', () => {
    let adminUserId: string;
    let testUserId: string;
    const adminEmail = 'admin-test@cloudbox.test';
    const testEmail = 'managed-user@cloudbox.test';

    beforeAll(async () => {
        // Create admin user
        const admin = await prisma.user.upsert({
            where: { email: adminEmail },
            update: {},
            create: {
                email: adminEmail,
                password: 'hashedpassword',
                name: 'Admin Test User',
                role: 'ADMIN',
                storageQuota: BigInt(10737418240), // 10GB
            },
        });
        adminUserId = admin.id;
    });

    beforeEach(async () => {
        // Clean up test user before each test
        await prisma.user.deleteMany({
            where: { email: testEmail },
        });
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: { email: { in: [adminEmail, testEmail] } },
        });
    });

    describe('User CRUD Operations', () => {
        it('should create a new user', async () => {
            const user = await prisma.user.create({
                data: {
                    email: testEmail,
                    password: 'hashedpassword',
                    name: 'Managed User',
                    role: 'USER',
                    storageQuota: BigInt(5368709120),
                },
            });

            expect(user.id).toBeDefined();
            expect(user.email).toBe(testEmail);
            expect(user.role).toBe('USER');
        });

        it('should update user quota', async () => {
            const user = await prisma.user.create({
                data: {
                    email: testEmail,
                    password: 'hashedpassword',
                    name: 'Managed User',
                    role: 'USER',
                    storageQuota: BigInt(5368709120),
                },
            });

            const newQuota = BigInt(10737418240); // 10GB
            const updated = await prisma.user.update({
                where: { id: user.id },
                data: { storageQuota: newQuota },
            });

            expect(updated.storageQuota).toBe(newQuota);
        });

        it('should change user role', async () => {
            const user = await prisma.user.create({
                data: {
                    email: testEmail,
                    password: 'hashedpassword',
                    name: 'Managed User',
                    role: 'USER',
                    storageQuota: BigInt(5368709120),
                },
            });

            const updated = await prisma.user.update({
                where: { id: user.id },
                data: { role: 'ADMIN' },
            });

            expect(updated.role).toBe('ADMIN');
        });

        it('should list users with pagination', async () => {
            // Create multiple users
            for (let i = 0; i < 5; i++) {
                await prisma.user.create({
                    data: {
                        email: `pagination-test-${i}@cloudbox.test`,
                        password: 'hashedpassword',
                        name: `User ${i}`,
                        role: 'USER',
                        storageQuota: BigInt(5368709120),
                    },
                });
            }

            const page1 = await prisma.user.findMany({
                take: 3,
                skip: 0,
                orderBy: { createdAt: 'desc' },
            });

            expect(page1.length).toBe(3);

            // Cleanup
            await prisma.user.deleteMany({
                where: { email: { startsWith: 'pagination-test-' } },
            });
        });

        it('should count total users', async () => {
            const initialCount = await prisma.user.count();

            await prisma.user.create({
                data: {
                    email: testEmail,
                    password: 'hashedpassword',
                    name: 'Managed User',
                    role: 'USER',
                    storageQuota: BigInt(5368709120),
                },
            });

            const newCount = await prisma.user.count();
            expect(newCount).toBe(initialCount + 1);
        });
    });

    describe('Storage Request Management', () => {
        it('should create storage request', async () => {
            const user = await prisma.user.create({
                data: {
                    email: testEmail,
                    password: 'hashedpassword',
                    name: 'Managed User',
                    role: 'USER',
                    storageQuota: BigInt(5368709120),
                },
            });

            const request = await prisma.storageRequest.create({
                data: {
                    userId: user.id,
                    currentQuota: user.storageQuota,
                    requestedQuota: BigInt(10737418240),
                    reason: 'Need more space for projects',
                    status: 'PENDING',
                },
            });

            expect(request.id).toBeDefined();
            expect(request.status).toBe('PENDING');
        });

        it('should approve storage request', async () => {
            const user = await prisma.user.create({
                data: {
                    email: testEmail,
                    password: 'hashedpassword',
                    name: 'Managed User',
                    role: 'USER',
                    storageQuota: BigInt(5368709120),
                },
            });

            const request = await prisma.storageRequest.create({
                data: {
                    userId: user.id,
                    currentQuota: user.storageQuota,
                    requestedQuota: BigInt(10737418240),
                    reason: 'Need more space',
                    status: 'PENDING',
                },
            });

            // Approve request
            const approved = await prisma.storageRequest.update({
                where: { id: request.id },
                data: {
                    status: 'APPROVED',
                    adminResponse: `Approved by admin ${adminUserId}`,
                },
            });

            expect(approved.status).toBe('APPROVED');
            expect(approved.adminResponse).toContain('Approved');
        });

        it('should reject storage request', async () => {
            const user = await prisma.user.create({
                data: {
                    email: testEmail,
                    password: 'hashedpassword',
                    name: 'Managed User',
                    role: 'USER',
                    storageQuota: BigInt(5368709120),
                },
            });

            const request = await prisma.storageRequest.create({
                data: {
                    userId: user.id,
                    currentQuota: user.storageQuota,
                    requestedQuota: BigInt(107374182400), // 100GB - too much
                    reason: 'Need space',
                    status: 'PENDING',
                },
            });

            const rejected = await prisma.storageRequest.update({
                where: { id: request.id },
                data: {
                    status: 'REJECTED',
                    adminResponse: 'Quota request too high',
                },
            });

            expect(rejected.status).toBe('REJECTED');
        });
    });
});

describe('Admin - System Settings', () => {
    afterAll(async () => {
        // Clean up test settings
        await prisma.settings.deleteMany({
            where: { key: { startsWith: 'test_' } },
        });
    });

    it('should create a setting', async () => {
        const setting = await prisma.settings.create({
            data: {
                key: 'test_setting_1',
                value: 'test_value',
            },
        });

        expect(setting.key).toBe('test_setting_1');
        expect(setting.value).toBe('test_value');
    });

    it('should update a setting', async () => {
        await prisma.settings.upsert({
            where: { key: 'test_setting_2' },
            update: { value: 'initial' },
            create: { key: 'test_setting_2', value: 'initial' },
        });

        const updated = await prisma.settings.update({
            where: { key: 'test_setting_2' },
            data: { value: 'updated_value' },
        });

        expect(updated.value).toBe('updated_value');
    });

    it('should get multiple settings', async () => {
        await prisma.settings.createMany({
            data: [
                { key: 'test_multi_1', value: 'value1' },
                { key: 'test_multi_2', value: 'value2' },
                { key: 'test_multi_3', value: 'value3' },
            ],
            skipDuplicates: true,
        });

        const settings = await prisma.settings.findMany({
            where: { key: { startsWith: 'test_multi_' } },
        });

        expect(settings.length).toBe(3);
    });
});

describe('Admin - Activity Logs', () => {
    let testUserId: string;
    const testEmail = 'activity-test@cloudbox.test';

    beforeAll(async () => {
        const user = await prisma.user.upsert({
            where: { email: testEmail },
            update: {},
            create: {
                email: testEmail,
                password: 'hashedpassword',
                name: 'Activity Test User',
                role: 'USER',
                storageQuota: BigInt(5368709120),
            },
        });
        testUserId = user.id;
    });

    afterAll(async () => {
        await prisma.activity.deleteMany({
            where: { userId: testUserId },
        });
        await prisma.user.delete({ where: { id: testUserId } }).catch(() => { });
    });

    it('should log user activity', async () => {
        const activity = await prisma.activity.create({
            data: {
                type: 'LOGIN',
                userId: testUserId,
                details: JSON.stringify({ ip: '192.168.1.1', userAgent: 'Test Agent' }),
            },
        });

        expect(activity.id).toBeDefined();
        expect(activity.type).toBe('LOGIN');
    });

    it('should query activity by type', async () => {
        // Create some activities
        await prisma.activity.createMany({
            data: [
                { type: 'UPLOAD', userId: testUserId, details: '{}' },
                { type: 'DOWNLOAD', userId: testUserId, details: '{}' },
                { type: 'UPLOAD', userId: testUserId, details: '{}' },
            ],
        });

        const uploads = await prisma.activity.findMany({
            where: { userId: testUserId, type: 'UPLOAD' },
        });

        expect(uploads.length).toBeGreaterThanOrEqual(2);
    });

    it('should query activity with date range', async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        await prisma.activity.create({
            data: {
                type: 'LOGIN',
                userId: testUserId,
                details: '{}',
            },
        });

        const recentActivity = await prisma.activity.findMany({
            where: {
                userId: testUserId,
                createdAt: { gte: yesterday },
            },
        });

        expect(recentActivity.length).toBeGreaterThan(0);
    });
});
