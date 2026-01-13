import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * WOPI Token Service Unit Tests
 */
describe('WOPI Token Service', () => {
    // Mock the config
    vi.mock('../../config/index.js', () => ({
        config: {
            wopi: {
                tokenSecret: 'test-wopi-secret-for-testing-only',
                tokenTtlSeconds: 900,
            },
        },
    }));

    let tokenModule: typeof import('../lib/wopi/token.js');

    beforeAll(async () => {
        tokenModule = await import('../lib/wopi/token.js');
    });

    describe('generateWopiToken', () => {
        it('should generate a valid JWT token', () => {
            const result = tokenModule.generateWopiToken({
                fileId: 'test-file-id',
                userId: 'test-user-id',
                userEmail: 'test@example.com',
                userName: 'Test User',
                scope: 'view',
            });

            expect(result.token).toBeDefined();
            expect(typeof result.token).toBe('string');
            expect(result.token.split('.')).toHaveLength(3); // JWT has 3 parts
            expect(result.ttl).toBe(900);
        });

        it('should use custom TTL when provided', () => {
            const result = tokenModule.generateWopiToken({
                fileId: 'test-file-id',
                userId: 'test-user-id',
                userEmail: 'test@example.com',
                userName: 'Test User',
                scope: 'edit',
                ttlSeconds: 600,
            });

            expect(result.ttl).toBe(600);
        });

        it('should generate different tokens for different inputs', () => {
            const token1 = tokenModule.generateWopiToken({
                fileId: 'file-1',
                userId: 'user-1',
                userEmail: 'user1@example.com',
                userName: 'User 1',
                scope: 'view',
            });

            const token2 = tokenModule.generateWopiToken({
                fileId: 'file-2',
                userId: 'user-2',
                userEmail: 'user2@example.com',
                userName: 'User 2',
                scope: 'view',
            });

            expect(token1.token).not.toBe(token2.token);
        });
    });

    describe('verifyWopiToken', () => {
        it('should verify a valid token', () => {
            const { token } = tokenModule.generateWopiToken({
                fileId: 'test-file-id',
                userId: 'test-user-id',
                userEmail: 'test@example.com',
                userName: 'Test User',
                scope: 'edit',
            });

            const payload = tokenModule.verifyWopiToken(token);

            expect(payload.fileId).toBe('test-file-id');
            expect(payload.userId).toBe('test-user-id');
            expect(payload.userEmail).toBe('test@example.com');
            expect(payload.userName).toBe('Test User');
            expect(payload.scope).toBe('edit');
        });

        it('should reject an invalid token', () => {
            expect(() => {
                tokenModule.verifyWopiToken('invalid-token');
            }).toThrow('Invalid WOPI token');
        });

        it('should reject a tampered token', () => {
            const { token } = tokenModule.generateWopiToken({
                fileId: 'test-file-id',
                userId: 'test-user-id',
                userEmail: 'test@example.com',
                userName: 'Test User',
                scope: 'view',
            });

            // Tamper with the token
            const parts = token.split('.');
            parts[1] = 'tampered-payload';
            const tamperedToken = parts.join('.');

            expect(() => {
                tokenModule.verifyWopiToken(tamperedToken);
            }).toThrow('Invalid WOPI token');
        });
    });

    describe('hasRequiredScope', () => {
        it('should allow view scope for view request', () => {
            const { token } = tokenModule.generateWopiToken({
                fileId: 'test-file-id',
                userId: 'test-user-id',
                userEmail: 'test@example.com',
                userName: 'Test User',
                scope: 'view',
            });

            const payload = tokenModule.verifyWopiToken(token);
            expect(tokenModule.hasRequiredScope(payload, 'view')).toBe(true);
        });

        it('should allow edit scope for view request', () => {
            const { token } = tokenModule.generateWopiToken({
                fileId: 'test-file-id',
                userId: 'test-user-id',
                userEmail: 'test@example.com',
                userName: 'Test User',
                scope: 'edit',
            });

            const payload = tokenModule.verifyWopiToken(token);
            expect(tokenModule.hasRequiredScope(payload, 'view')).toBe(true);
        });

        it('should deny view scope for edit request', () => {
            const { token } = tokenModule.generateWopiToken({
                fileId: 'test-file-id',
                userId: 'test-user-id',
                userEmail: 'test@example.com',
                userName: 'Test User',
                scope: 'view',
            });

            const payload = tokenModule.verifyWopiToken(token);
            expect(tokenModule.hasRequiredScope(payload, 'edit')).toBe(false);
        });

        it('should allow edit scope for edit request', () => {
            const { token } = tokenModule.generateWopiToken({
                fileId: 'test-file-id',
                userId: 'test-user-id',
                userEmail: 'test@example.com',
                userName: 'Test User',
                scope: 'edit',
            });

            const payload = tokenModule.verifyWopiToken(token);
            expect(tokenModule.hasRequiredScope(payload, 'edit')).toBe(true);
        });
    });

    describe('extractTokenFromRequest', () => {
        it('should extract token from query parameter', () => {
            const req = {
                query: { access_token: 'test-token-from-query' },
                headers: {},
            };

            const token = tokenModule.extractTokenFromRequest(req);
            expect(token).toBe('test-token-from-query');
        });

        it('should extract token from Authorization header', () => {
            const req = {
                query: {},
                headers: { authorization: 'Bearer test-token-from-header' },
            };

            const token = tokenModule.extractTokenFromRequest(req);
            expect(token).toBe('test-token-from-header');
        });

        it('should prefer query parameter over header', () => {
            const req = {
                query: { access_token: 'query-token' },
                headers: { authorization: 'Bearer header-token' },
            };

            const token = tokenModule.extractTokenFromRequest(req);
            expect(token).toBe('query-token');
        });

        it('should return null when no token provided', () => {
            const req = {
                query: {},
                headers: {},
            };

            const token = tokenModule.extractTokenFromRequest(req);
            expect(token).toBeNull();
        });
    });
});
