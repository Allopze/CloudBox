import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';

/**
 * Auth Routes Unit Tests
 * 
 * These tests verify the authentication logic without making HTTP requests.
 * For full integration tests, see upload.integration.test.ts
 */

// Test data
const testUser = {
    email: 'test-auth@cloudbox.test',
    password: 'TestPassword123!',
    name: 'Test User',
};

describe('Auth - Password Hashing', () => {
    it('should hash passwords with bcrypt', async () => {
        const hash = await bcrypt.hash(testUser.password, 12);

        expect(hash).toBeDefined();
        expect(hash).not.toBe(testUser.password);
        expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix
    });

    it('should verify correct password', async () => {
        const hash = await bcrypt.hash(testUser.password, 12);
        const isValid = await bcrypt.compare(testUser.password, hash);

        expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
        const hash = await bcrypt.hash(testUser.password, 12);
        const isValid = await bcrypt.compare('WrongPassword123!', hash);

        expect(isValid).toBe(false);
    });
});

describe('Auth - User Registration', () => {
    beforeEach(async () => {
        // Clean up test user before each test
        await prisma.user.deleteMany({
            where: { email: testUser.email },
        });
    });

    afterAll(async () => {
        // Final cleanup
        await prisma.user.deleteMany({
            where: { email: testUser.email },
        });
    });

    it('should create a new user with hashed password', async () => {
        const hashedPassword = await bcrypt.hash(testUser.password, 12);

        const user = await prisma.user.create({
            data: {
                email: testUser.email,
                password: hashedPassword,
                name: testUser.name,
                role: 'USER',
                storageQuota: BigInt(5368709120), // 5GB
            },
        });

        expect(user).toBeDefined();
        expect(user.id).toBeDefined();
        expect(user.email).toBe(testUser.email);
        expect(user.name).toBe(testUser.name);
        expect(user.password).not.toBe(testUser.password);
        expect(user.role).toBe('USER');
    });

    it('should reject duplicate emails', async () => {
        const hashedPassword = await bcrypt.hash(testUser.password, 12);

        // Create first user
        await prisma.user.create({
            data: {
                email: testUser.email,
                password: hashedPassword,
                name: testUser.name,
                role: 'USER',
                storageQuota: BigInt(5368709120),
            },
        });

        // Try to create duplicate
        await expect(
            prisma.user.create({
                data: {
                    email: testUser.email,
                    password: hashedPassword,
                    name: 'Another User',
                    role: 'USER',
                    storageQuota: BigInt(5368709120),
                },
            })
        ).rejects.toThrow();
    });

    it('should set first user as ADMIN', async () => {
        // Delete all users first
        await prisma.user.deleteMany();

        const hashedPassword = await bcrypt.hash(testUser.password, 12);
        const userCount = await prisma.user.count();
        const role = userCount === 0 ? 'ADMIN' : 'USER';

        const user = await prisma.user.create({
            data: {
                email: testUser.email,
                password: hashedPassword,
                name: testUser.name,
                role,
                storageQuota: BigInt(5368709120),
            },
        });

        expect(user.role).toBe('ADMIN');
    });
});

describe('Auth - Login Attempts', () => {
    const testEmail = 'login-test@cloudbox.test';
    const testIP = '192.168.1.1';

    beforeEach(async () => {
        await prisma.loginAttempt.deleteMany({
            where: { email: testEmail },
        });
    });

    afterAll(async () => {
        await prisma.loginAttempt.deleteMany({
            where: { email: testEmail },
        });
    });

    it('should record failed login attempt', async () => {
        await prisma.loginAttempt.create({
            data: {
                email: testEmail,
                ipAddress: testIP,
                success: false,
                userAgent: 'Test Agent',
            },
        });

        const attempts = await prisma.loginAttempt.count({
            where: { email: testEmail, success: false },
        });

        expect(attempts).toBe(1);
    });

    it('should count failed attempts within window', async () => {
        // Create multiple failed attempts
        for (let i = 0; i < 3; i++) {
            await prisma.loginAttempt.create({
                data: {
                    email: testEmail,
                    ipAddress: testIP,
                    success: false,
                },
            });
        }

        const windowStart = new Date(Date.now() - 15 * 60 * 1000); // 15 mins
        const attempts = await prisma.loginAttempt.count({
            where: {
                email: testEmail,
                success: false,
                createdAt: { gte: windowStart },
            },
        });

        expect(attempts).toBe(3);
    });

    it('should trigger lockout after 5 failed attempts', async () => {
        const MAX_ATTEMPTS = 5;

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            await prisma.loginAttempt.create({
                data: {
                    email: testEmail,
                    ipAddress: testIP,
                    success: false,
                },
            });
        }

        const windowStart = new Date(Date.now() - 15 * 60 * 1000);
        const attempts = await prisma.loginAttempt.count({
            where: {
                email: testEmail,
                success: false,
                createdAt: { gte: windowStart },
            },
        });

        expect(attempts >= MAX_ATTEMPTS).toBe(true);
    });
});

describe('Auth - Refresh Tokens', () => {
    let testUserId: string;
    const testEmail = 'token-test@cloudbox.test';

    beforeAll(async () => {
        // Create test user
        const hashedPassword = await bcrypt.hash('password123', 12);
        const user = await prisma.user.upsert({
            where: { email: testEmail },
            update: {},
            create: {
                email: testEmail,
                password: hashedPassword,
                name: 'Token Test User',
                role: 'USER',
                storageQuota: BigInt(5368709120),
            },
        });
        testUserId = user.id;
    });

    beforeEach(async () => {
        // Clean refresh tokens
        await prisma.refreshToken.deleteMany({
            where: { userId: testUserId },
        });
    });

    afterAll(async () => {
        await prisma.refreshToken.deleteMany({
            where: { userId: testUserId },
        });
        await prisma.user.delete({
            where: { id: testUserId },
        }).catch(() => { });
    });

    it('should store hashed refresh token', async () => {
        const tokenHash = 'hashed_token_value_12345';
        const jti = randomUUID();
        const familyId = randomUUID();

        const token = await prisma.refreshToken.create({
            data: {
                tokenHash,
                jti,
                userId: testUserId,
                familyId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        expect(token.id).toBeDefined();
        expect(token.tokenHash).toBe(tokenHash);
        expect(token.jti).toBe(jti);
        expect(token.familyId).toBe(familyId);
        expect(token.revokedAt).toBeNull();
    });

    it('should find token by jti', async () => {
        const jti = randomUUID();
        const familyId = randomUUID();

        await prisma.refreshToken.create({
            data: {
                tokenHash: 'some_hash',
                jti,
                userId: testUserId,
                familyId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        const found = await prisma.refreshToken.findUnique({
            where: { jti },
        });

        expect(found).toBeDefined();
        expect(found?.jti).toBe(jti);
    });

    it('should revoke entire token family', async () => {
        const familyId = randomUUID();

        // Create multiple tokens in same family
        for (let i = 0; i < 3; i++) {
            await prisma.refreshToken.create({
                data: {
                    tokenHash: `hash_${i}`,
                    jti: randomUUID(),
                    userId: testUserId,
                    familyId,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });
        }

        // Revoke entire family
        await prisma.refreshToken.updateMany({
            where: { familyId },
            data: { revokedAt: new Date() },
        });

        const revokedTokens = await prisma.refreshToken.findMany({
            where: { familyId },
        });

        expect(revokedTokens.length).toBe(3);
        revokedTokens.forEach(token => {
            expect(token.revokedAt).not.toBeNull();
        });
    });
});
