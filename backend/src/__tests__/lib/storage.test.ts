import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import {
    isValidUUID,
    getStoragePath,
    getChunkPath,
    fileExists,
    deleteFile,
    initStorage,
} from '../../lib/storage.js';

describe('Storage Utilities', () => {
    describe('isValidUUID', () => {
        it('should return true for valid UUIDs', () => {
            expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
            expect(isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
            expect(isValidUUID('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')).toBe(true);
        });

        it('should return false for invalid UUIDs', () => {
            expect(isValidUUID('')).toBe(false);
            expect(isValidUUID('not-a-uuid')).toBe(false);
            expect(isValidUUID('123e4567-e89b-12d3-a456')).toBe(false);
            expect(isValidUUID('123e4567e89b12d3a456426614174000')).toBe(false);
            expect(isValidUUID('../../../etc/passwd')).toBe(false);
            expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000/')).toBe(false);
        });

        it('should handle edge cases', () => {
            expect(isValidUUID(null as any)).toBe(false);
            expect(isValidUUID(undefined as any)).toBe(false);
            expect(isValidUUID(123 as any)).toBe(false);
        });
    });

    describe('getChunkPath', () => {
        it('should return correct path for valid uploadId', () => {
            const uploadId = '123e4567-e89b-12d3-a456-426614174000';
            const chunkPath = getChunkPath(uploadId, 0);

            expect(chunkPath).toContain('chunks');
            expect(chunkPath).toContain(uploadId);
            expect(chunkPath).toContain('chunk_0');
        });

        it('should throw error for invalid uploadId (path traversal prevention)', () => {
            expect(() => getChunkPath('../../../etc', 0)).toThrow('Invalid upload ID');
            expect(() => getChunkPath('not-a-uuid', 0)).toThrow('Invalid upload ID');
            expect(() => getChunkPath('', 0)).toThrow('Invalid upload ID');
        });

        it('should handle different chunk indices', () => {
            const uploadId = '123e4567-e89b-12d3-a456-426614174000';

            const chunk0 = getChunkPath(uploadId, 0);
            const chunk5 = getChunkPath(uploadId, 5);
            const chunk999 = getChunkPath(uploadId, 999);

            expect(chunk0).toContain('chunk_0');
            expect(chunk5).toContain('chunk_5');
            expect(chunk999).toContain('chunk_999');
        });
    });

    describe('getStoragePath', () => {
        it('should return correct paths for different storage types', () => {
            const filesPath = getStoragePath('files');
            const thumbnailsPath = getStoragePath('thumbnails');
            const avatarsPath = getStoragePath('avatars');

            expect(filesPath).toContain('files');
            expect(thumbnailsPath).toContain('thumbnails');
            expect(avatarsPath).toContain('avatars');
        });

        it('should handle subpaths correctly', () => {
            const userFilePath = getStoragePath('files', 'user123', 'document.pdf');

            expect(userFilePath).toContain('files');
            expect(userFilePath).toContain('user123');
            expect(userFilePath).toContain('document.pdf');
        });

        it('should return absolute paths', () => {
            const storagePath = getStoragePath('files');
            expect(path.isAbsolute(storagePath)).toBe(true);
        });
    });

    describe('fileExists and deleteFile', () => {
        const testDir = path.join(process.cwd(), 'test-temp');
        const testFile = path.join(testDir, 'test-file.txt');

        beforeAll(async () => {
            await fs.mkdir(testDir, { recursive: true });
        });

        afterAll(async () => {
            await fs.rm(testDir, { recursive: true, force: true });
        });

        it('should return false for non-existent file', async () => {
            const exists = await fileExists(path.join(testDir, 'nonexistent.txt'));
            expect(exists).toBe(false);
        });

        it('should return true for existing file', async () => {
            await fs.writeFile(testFile, 'test content');
            const exists = await fileExists(testFile);
            expect(exists).toBe(true);
        });

        it('should delete existing file without error', async () => {
            await fs.writeFile(testFile, 'test content');
            await expect(deleteFile(testFile)).resolves.not.toThrow();
            const exists = await fileExists(testFile);
            expect(exists).toBe(false);
        });

        it('should handle deletion of non-existent file gracefully', async () => {
            await expect(deleteFile(path.join(testDir, 'nonexistent.txt'))).resolves.not.toThrow();
        });
    });
});
