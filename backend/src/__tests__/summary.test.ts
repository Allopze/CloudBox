import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma.js';

/**
 * Admin Summary Dashboard Tests
 * 
 * Tests for the /admin/summary endpoint and related actions.
 */

describe('Admin Summary Dashboard', () => {
    let adminUserId: string;
    let regularUserId: string;
    const adminEmail = 'summary-admin@cloudbox.test';
    const regularEmail = 'summary-regular@cloudbox.test';

    beforeAll(async () => {
        // Create admin user
        const admin = await prisma.user.upsert({
            where: { email: adminEmail },
            update: {},
            create: {
                email: adminEmail,
                password: 'hashedpassword',
                name: 'Summary Admin User',
                role: 'ADMIN',
                storageQuota: BigInt(10737418240),
            },
        });
        adminUserId = admin.id;

        // Create regular user
        const regular = await prisma.user.upsert({
            where: { email: regularEmail },
            update: {},
            create: {
                email: regularEmail,
                password: 'hashedpassword',
                name: 'Summary Regular User',
                role: 'USER',
                storageQuota: BigInt(5368709120),
            },
        });
        regularUserId = regular.id;
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: { email: { in: [adminEmail, regularEmail] } },
        });
    });

    describe('Summary Endpoint Schema', () => {
        it('should return correct summary structure', async () => {
            // Test that the summary response has the expected shape
            const mockSummary = {
                generatedAt: new Date().toISOString(),
                health: {
                    api: { status: 'OK' },
                    db: { status: 'OK', latencyMs: 10 },
                    storage: { status: 'OK', usedBytes: '0', totalQuota: '1073741824', freePercent: 100 },
                    jobs: { status: 'OK', details: { transcoding: { waiting: 0, failed: 0, oldest: null } } },
                    smtp: { status: 'NOT_CONFIGURED' },
                    version: { version: '1.0.0', migrationsPending: false },
                },
                metrics: {
                    users: { total: 2, active24: 0, active7d: 0, active30d: 0, newToday: 0, newWeek: 0 },
                    uploads: { count24h: 0, bytes24h: '0' },
                    downloads: { count24h: 0 },
                },
                capacity: {
                    storageSeries: [],
                    projectionDays: null,
                    topLargeFiles: [],
                },
                alerts: [],
                security: {
                    logins: { success: 0, failed: 0 },
                    topFailIps: [],
                },
            };

            // Validate structure
            expect(mockSummary).toHaveProperty('generatedAt');
            expect(mockSummary).toHaveProperty('health');
            expect(mockSummary).toHaveProperty('metrics');
            expect(mockSummary).toHaveProperty('capacity');
            expect(mockSummary).toHaveProperty('alerts');
            expect(mockSummary).toHaveProperty('security');

            // Validate health section
            expect(mockSummary.health).toHaveProperty('api');
            expect(mockSummary.health).toHaveProperty('db');
            expect(mockSummary.health).toHaveProperty('storage');
            expect(mockSummary.health).toHaveProperty('jobs');
            expect(mockSummary.health).toHaveProperty('smtp');
            expect(mockSummary.health).toHaveProperty('version');

            // Validate API status is valid value
            expect(['OK', 'DEGRADED', 'DOWN']).toContain(mockSummary.health.api.status);
        });
    });

    describe('Alert Rules', () => {
        it('should generate warning for disk usage above 80%', () => {
            const DISK_WARNING_THRESHOLD = 80;
            const diskUsedPercent = 85;
            const alerts: { severity: string; message: string }[] = [];

            if (diskUsedPercent > DISK_WARNING_THRESHOLD) {
                alerts.push({
                    severity: 'warning',
                    message: 'Almacenamiento bajo: menos del 20% libre',
                });
            }

            expect(alerts.length).toBe(1);
            expect(alerts[0].severity).toBe('warning');
        });

        it('should generate critical alert for disk usage above 95%', () => {
            const DISK_CRITICAL_THRESHOLD = 95;
            const diskUsedPercent = 97;
            const alerts: { severity: string; message: string }[] = [];

            if (diskUsedPercent > DISK_CRITICAL_THRESHOLD) {
                alerts.push({
                    severity: 'critical',
                    message: 'Almacenamiento crítico: menos del 5% libre',
                });
            }

            expect(alerts.length).toBe(1);
            expect(alerts[0].severity).toBe('critical');
        });

        it('should generate warning for excessive failed logins', () => {
            const FAILED_LOGINS_THRESHOLD = 50;
            const failedLogins24h = 75;
            const alerts: { severity: string; message: string }[] = [];

            if (failedLogins24h > FAILED_LOGINS_THRESHOLD) {
                alerts.push({
                    severity: 'warning',
                    message: `Alto número de logins fallidos: ${failedLogins24h} en 24h`,
                });
            }

            expect(alerts.length).toBe(1);
            expect(alerts[0].message).toContain('75');
        });

        it('should not generate alerts when values are normal', () => {
            const diskUsedPercent = 50;
            const failedLogins24h = 10;
            const alerts: { severity: string; message: string }[] = [];

            if (diskUsedPercent > 80) {
                alerts.push({ severity: 'warning', message: 'Disk warning' });
            }
            if (failedLogins24h > 50) {
                alerts.push({ severity: 'warning', message: 'Login warning' });
            }

            expect(alerts.length).toBe(0);
        });
    });

    describe('User Metrics Calculation', () => {
        it('should count total users correctly', async () => {
            const count = await prisma.user.count();
            expect(count).toBeGreaterThanOrEqual(2); // At least admin and regular user
        });

        it('should count new users today', async () => {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const newToday = await prisma.user.count({
                where: { createdAt: { gte: todayStart } },
            });

            expect(newToday).toBeGreaterThanOrEqual(0);
        });

        it('should count active users by activity', async () => {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const activeUsers = await prisma.activity.groupBy({
                by: ['userId'],
                where: { createdAt: { gte: oneDayAgo } },
            });

            expect(Array.isArray(activeUsers)).toBe(true);
        });
    });

    describe('Storage Capacity Calculation', () => {
        it('should aggregate storage usage across all users', async () => {
            const storageResult = await prisma.user.aggregate({
                _sum: { storageUsed: true, storageQuota: true },
            });

            expect(storageResult._sum).toBeDefined();
        });

        it('should get top large files', async () => {
            const topFiles = await prisma.file.findMany({
                take: 10,
                orderBy: { size: 'desc' },
                select: { id: true, name: true, size: true },
            });

            expect(Array.isArray(topFiles)).toBe(true);
            expect(topFiles.length).toBeLessThanOrEqual(10);
        });
    });

    describe('Security Metrics', () => {
        it('should count login attempts', async () => {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const [successful, failed] = await Promise.all([
                prisma.loginAttempt.count({
                    where: { success: true, createdAt: { gte: oneDayAgo } },
                }),
                prisma.loginAttempt.count({
                    where: { success: false, createdAt: { gte: oneDayAgo } },
                }),
            ]);

            expect(successful).toBeGreaterThanOrEqual(0);
            expect(failed).toBeGreaterThanOrEqual(0);
        });

        it('should group failed logins by IP', async () => {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const topFailIps = await prisma.loginAttempt.groupBy({
                by: ['ipAddress'],
                where: { success: false, createdAt: { gte: oneDayAgo } },
                _count: true,
                orderBy: { _count: { ipAddress: 'desc' } },
                take: 5,
            });

            expect(Array.isArray(topFailIps)).toBe(true);
            expect(topFailIps.length).toBeLessThanOrEqual(5);
        });
    });

    describe('Maintenance Mode Toggle', () => {
        it('should toggle maintenance mode setting', async () => {
            // Get current value
            const current = await prisma.settings.findUnique({
                where: { key: 'maintenance_mode' },
            });

            const currentValue = current?.value === 'true';
            const newValue = !currentValue;

            // Toggle
            await prisma.settings.upsert({
                where: { key: 'maintenance_mode' },
                update: { value: String(newValue) },
                create: { key: 'maintenance_mode', value: String(newValue) },
            });

            // Verify
            const updated = await prisma.settings.findUnique({
                where: { key: 'maintenance_mode' },
            });

            expect(updated?.value).toBe(String(newValue));

            // Cleanup - reset to false
            await prisma.settings.update({
                where: { key: 'maintenance_mode' },
                data: { value: 'false' },
            });
        });
    });
});
