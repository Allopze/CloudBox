import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * WOPI Lock Manager Unit Tests
 * 
 * Tests the database-backed lock manager functionality.
 * Redis tests would require a running Redis instance.
 */

// Mock prisma
const mockPrisma = {
    wopiLock: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
    },
};

vi.mock('../lib/prisma.js', () => ({
    default: mockPrisma,
}));

// Mock config
vi.mock('../config/index.js', () => ({
    config: {
        wopi: {
            lockProvider: 'db',
            lockTtlSeconds: 1800,
        },
    },
}));

// Mock logger
vi.mock('../lib/logger.js', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('WOPI Lock Manager', () => {
    let lockManager: typeof import('../lib/wopi/lockManager.js');

    beforeEach(async () => {
        vi.clearAllMocks();
        lockManager = await import('../lib/wopi/lockManager.js');
    });

    describe('acquireLock', () => {
        it('should acquire lock when no existing lock', async () => {
            mockPrisma.wopiLock.findUnique.mockResolvedValue(null);
            mockPrisma.wopiLock.create.mockResolvedValue({
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'lock-id-1',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            });

            const result = await lockManager.acquireLock('file-1', 'lock-id-1', 'user-1');

            expect(result.success).toBe(true);
            expect(result.lockId).toBe('lock-id-1');
            expect(mockPrisma.wopiLock.create).toHaveBeenCalled();
        });

        it('should refresh lock when same lockId provided', async () => {
            const existingLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'lock-id-1',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(existingLock);
            mockPrisma.wopiLock.update.mockResolvedValue(existingLock);

            const result = await lockManager.acquireLock('file-1', 'lock-id-1', 'user-1');

            expect(result.success).toBe(true);
            expect(result.lockId).toBe('lock-id-1');
            expect(mockPrisma.wopiLock.update).toHaveBeenCalled();
        });

        it('should reject when different lock exists', async () => {
            const existingLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'existing-lock-id',
                userId: 'other-user',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(existingLock);

            const result = await lockManager.acquireLock('file-1', 'new-lock-id', 'user-1');

            expect(result.success).toBe(false);
            expect(result.existingLockId).toBe('existing-lock-id');
            expect(result.reason).toBe('Lock conflict');
        });

        it('should overwrite expired lock', async () => {
            const expiredLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'expired-lock-id',
                userId: 'other-user',
                expiresAt: new Date(Date.now() - 1000), // Expired
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(expiredLock);
            mockPrisma.wopiLock.update.mockResolvedValue({
                ...expiredLock,
                lockId: 'new-lock-id',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
            });

            const result = await lockManager.acquireLock('file-1', 'new-lock-id', 'user-1');

            expect(result.success).toBe(true);
            expect(result.lockId).toBe('new-lock-id');
        });
    });

    describe('releaseLock', () => {
        it('should release lock when lockId matches', async () => {
            const existingLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'lock-id-1',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(existingLock);
            mockPrisma.wopiLock.delete.mockResolvedValue(existingLock);

            const result = await lockManager.releaseLock('file-1', 'lock-id-1');

            expect(result.success).toBe(true);
            expect(mockPrisma.wopiLock.delete).toHaveBeenCalled();
        });

        it('should reject when lockId does not match', async () => {
            const existingLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'different-lock-id',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(existingLock);

            const result = await lockManager.releaseLock('file-1', 'wrong-lock-id');

            expect(result.success).toBe(false);
            expect(result.existingLockId).toBe('different-lock-id');
            expect(mockPrisma.wopiLock.delete).not.toHaveBeenCalled();
        });

        it('should succeed when no lock exists', async () => {
            mockPrisma.wopiLock.findUnique.mockResolvedValue(null);

            const result = await lockManager.releaseLock('file-1', 'any-lock-id');

            expect(result.success).toBe(true);
        });
    });

    describe('getLock', () => {
        it('should return lock info when lock exists', async () => {
            const existingLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'lock-id-1',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(existingLock);

            const result = await lockManager.getLock('file-1');

            expect(result).not.toBeNull();
            expect(result?.lockId).toBe('lock-id-1');
            expect(result?.userId).toBe('user-1');
        });

        it('should return null when no lock exists', async () => {
            mockPrisma.wopiLock.findUnique.mockResolvedValue(null);

            const result = await lockManager.getLock('file-1');

            expect(result).toBeNull();
        });

        it('should clean up and return null for expired lock', async () => {
            const expiredLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'lock-id-1',
                userId: 'user-1',
                expiresAt: new Date(Date.now() - 1000), // Expired
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(expiredLock);
            mockPrisma.wopiLock.delete.mockResolvedValue(expiredLock);

            const result = await lockManager.getLock('file-1');

            expect(result).toBeNull();
            expect(mockPrisma.wopiLock.delete).toHaveBeenCalled();
        });
    });

    describe('refreshLock', () => {
        it('should refresh lock when lockId matches', async () => {
            const existingLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'lock-id-1',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(existingLock);
            mockPrisma.wopiLock.update.mockResolvedValue(existingLock);

            const result = await lockManager.refreshLock('file-1', 'lock-id-1');

            expect(result.success).toBe(true);
            expect(mockPrisma.wopiLock.update).toHaveBeenCalled();
        });

        it('should reject when lock not found', async () => {
            mockPrisma.wopiLock.findUnique.mockResolvedValue(null);

            const result = await lockManager.refreshLock('file-1', 'lock-id-1');

            expect(result.success).toBe(false);
            expect(result.reason).toBe('Lock not found');
        });

        it('should reject when lockId does not match', async () => {
            const existingLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'different-lock-id',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(existingLock);

            const result = await lockManager.refreshLock('file-1', 'wrong-lock-id');

            expect(result.success).toBe(false);
            expect(result.existingLockId).toBe('different-lock-id');
        });
    });

    describe('validateLock', () => {
        it('should return valid when no lock exists', async () => {
            mockPrisma.wopiLock.findUnique.mockResolvedValue(null);

            const result = await lockManager.validateLock('file-1', 'any-lock-id');

            expect(result.valid).toBe(true);
        });

        it('should return valid when lockId matches', async () => {
            const existingLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'lock-id-1',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(existingLock);

            const result = await lockManager.validateLock('file-1', 'lock-id-1');

            expect(result.valid).toBe(true);
        });

        it('should return invalid when lockId does not match', async () => {
            const existingLock = {
                id: 'lock-1',
                fileId: 'file-1',
                lockId: 'different-lock-id',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 1800000),
                createdAt: new Date(),
            };

            mockPrisma.wopiLock.findUnique.mockResolvedValue(existingLock);

            const result = await lockManager.validateLock('file-1', 'wrong-lock-id');

            expect(result.valid).toBe(false);
            expect(result.existingLockId).toBe('different-lock-id');
        });
    });

    describe('cleanupExpiredLocks', () => {
        it('should delete expired locks and return count', async () => {
            mockPrisma.wopiLock.deleteMany.mockResolvedValue({ count: 5 });

            const count = await lockManager.cleanupExpiredLocks();

            expect(count).toBe(5);
            expect(mockPrisma.wopiLock.deleteMany).toHaveBeenCalledWith({
                where: { expiresAt: { lt: expect.any(Date) } },
            });
        });
    });
});
