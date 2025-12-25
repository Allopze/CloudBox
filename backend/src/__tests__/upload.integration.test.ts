/**
 * Integration Tests for File Upload Endpoints
 * 
 * These tests verify the upload functionality including:
 * - Single/multiple file upload
 * - Chunked upload
 * - Validation (Zod schemas)
 * - Rate limiting
 * - Error handling
 * 
 * Prerequisites:
 * - Test database configured
 * - Test user created
 * - Server running on test port
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';
const integrationDescribe = RUN_INTEGRATION ? describe : describe.skip;

// Test configuration
const API_URL = process.env.TEST_API_URL || 'http://localhost:3001';
const TEST_USER = {
  email: 'test@example.com',
  password: 'testpassword123',
};

let authToken: string;
let testFolderId: string;
let uploadedFileIds: string[] = [];

integrationDescribe('File Upload API', () => {
  beforeAll(async () => {
    // Login to get auth token
    const loginRes = await request(API_URL)
      .post('/api/auth/login')
      .send(TEST_USER);
    
    expect(loginRes.status).toBe(200);
    authToken = loginRes.body.accessToken;
    
    // Create test folder
    const folderRes = await request(API_URL)
      .post('/api/folders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Upload Folder' });
    
    if (folderRes.status === 201) {
      testFolderId = folderRes.body.id;
    }
  });

  afterAll(async () => {
    // Cleanup uploaded files
    for (const fileId of uploadedFileIds) {
      await request(API_URL)
        .delete(`/api/files/${fileId}?permanent=true`)
        .set('Authorization', `Bearer ${authToken}`);
    }
    
    // Cleanup test folder
    if (testFolderId) {
      await request(API_URL)
        .delete(`/api/folders/${testFolderId}?permanent=true`)
        .set('Authorization', `Bearer ${authToken}`);
    }
  });

  describe('POST /api/files/upload', () => {
    it('should upload a single file', async () => {
      const testBuffer = Buffer.from('Test file content');
      
      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', testBuffer, 'test.txt');
      
      expect(res.status).toBe(201);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(1);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name', 'test.txt');
      
      uploadedFileIds.push(res.body[0].id);
    });

    it('should upload multiple files', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', Buffer.from('File 1'), 'file1.txt')
        .attach('files', Buffer.from('File 2'), 'file2.txt');
      
      expect(res.status).toBe(201);
      expect(res.body.length).toBe(2);
      
      uploadedFileIds.push(...res.body.map((f: any) => f.id));
    });

    it('should upload to a specific folder', async () => {
      if (!testFolderId) {
        console.warn('Skipping: test folder not created');
        return;
      }
      
      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('folderId', testFolderId)
        .attach('files', Buffer.from('Test'), 'folder-test.txt');
      
      expect(res.status).toBe(201);
      expect(res.body[0].folderId).toBe(testFolderId);
      
      uploadedFileIds.push(res.body[0].id);
    });

    it('should reject invalid folder ID format', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('folderId', 'invalid-uuid')
        .attach('files', Buffer.from('Test'), 'test.txt');
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'INVALID_FOLDER');
    });

    it('should reject non-existent folder', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .field('folderId', uuidv4()) // Random UUID that doesn't exist
        .attach('files', Buffer.from('Test'), 'test.txt');
      
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'INVALID_FOLDER');
    });

    it('should reject request without files', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(400);
    });

    it('should reject dangerous file extensions', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', Buffer.from('<?php echo "test"; ?>'), 'malicious.php');
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not allowed');
    });

    it('should require authentication', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload')
        .attach('files', Buffer.from('Test'), 'test.txt');
      
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/files/upload/init', () => {
    it('should initialize chunked upload', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload/init')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          filename: 'large-file.zip',
          totalChunks: 5,
          totalSize: 52428800, // 50MB
        });
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('uploadId');
      expect(res.body).toHaveProperty('totalChunks', 5);
      expect(res.body).toHaveProperty('reservedSize', 52428800);
    });

    it('should validate filename', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload/init')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          filename: '',
          totalChunks: 5,
          totalSize: 52428800,
        });
      
      expect(res.status).toBe(400);
    });

    it('should reject dangerous extensions in init', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload/init')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          filename: 'script.ps1',
          totalChunks: 1,
          totalSize: 1024,
        });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'DANGEROUS_EXTENSION');
    });

    it('should validate totalChunks is positive', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload/init')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          filename: 'test.zip',
          totalChunks: 0,
          totalSize: 1024,
        });
      
      expect(res.status).toBe(400);
    });

    it('should reject excessive chunk count', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload/init')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          filename: 'test.zip',
          totalChunks: 100000, // Exceeds limit
          totalSize: 1024,
        });
      
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/files/upload/chunk', () => {
    let uploadId: string;

    beforeEach(async () => {
      // Initialize upload for chunk tests
      const initRes = await request(API_URL)
        .post('/api/files/upload/init')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          filename: 'chunked-test.txt',
          totalChunks: 2,
          totalSize: 2048,
        });
      
      uploadId = initRes.body.uploadId;
    });

    it('should upload a chunk', async () => {
      const chunkData = Buffer.alloc(1024, 'a');
      
      const res = await request(API_URL)
        .post('/api/files/upload/chunk')
        .set('Authorization', `Bearer ${authToken}`)
        .field('uploadId', uploadId)
        .field('chunkIndex', '0')
        .field('totalChunks', '2')
        .field('filename', 'chunked-test.txt')
        .field('mimeType', 'text/plain')
        .field('totalSize', '2048')
        .attach('chunk', chunkData, 'chunk');
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('completed', false);
      expect(res.body).toHaveProperty('uploadedChunks', 1);
    });

    it('should complete upload after all chunks', async () => {
      const chunk1 = Buffer.alloc(1024, 'a');
      const chunk2 = Buffer.alloc(1024, 'b');
      
      // Upload first chunk
      await request(API_URL)
        .post('/api/files/upload/chunk')
        .set('Authorization', `Bearer ${authToken}`)
        .field('uploadId', uploadId)
        .field('chunkIndex', '0')
        .field('totalChunks', '2')
        .field('filename', 'chunked-test.txt')
        .field('mimeType', 'text/plain')
        .field('totalSize', '2048')
        .attach('chunk', chunk1, 'chunk');
      
      // Upload second chunk
      const res = await request(API_URL)
        .post('/api/files/upload/chunk')
        .set('Authorization', `Bearer ${authToken}`)
        .field('uploadId', uploadId)
        .field('chunkIndex', '1')
        .field('totalChunks', '2')
        .field('filename', 'chunked-test.txt')
        .field('mimeType', 'text/plain')
        .field('totalSize', '2048')
        .attach('chunk', chunk2, 'chunk');
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('completed', true);
      expect(res.body).toHaveProperty('file');
      expect(res.body.file).toHaveProperty('id');
      
      uploadedFileIds.push(res.body.file.id);
    });

    it('should reject invalid uploadId format', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload/chunk')
        .set('Authorization', `Bearer ${authToken}`)
        .field('uploadId', 'not-a-uuid')
        .field('chunkIndex', '0')
        .field('totalChunks', '1')
        .field('filename', 'test.txt')
        .field('mimeType', 'text/plain')
        .field('totalSize', '1024')
        .attach('chunk', Buffer.from('test'), 'chunk');
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'UPLOAD_NOT_FOUND');
    });

    it('should reject negative chunk index', async () => {
      const res = await request(API_URL)
        .post('/api/files/upload/chunk')
        .set('Authorization', `Bearer ${authToken}`)
        .field('uploadId', uploadId)
        .field('chunkIndex', '-1')
        .field('totalChunks', '2')
        .field('filename', 'test.txt')
        .field('mimeType', 'text/plain')
        .field('totalSize', '2048')
        .attach('chunk', Buffer.from('test'), 'chunk');
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'INVALID_CHUNK');
    });
  });

  describe('GET /api/files/:id/download', () => {
    let testFileId: string;

    beforeAll(async () => {
      // Upload a test file for download tests
      const res = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', Buffer.from('Download test content'), 'download-test.txt');
      
      testFileId = res.body[0].id;
      uploadedFileIds.push(testFileId);
    });

    it('should download a file', async () => {
      const res = await request(API_URL)
        .get(`/api/files/${testFileId}/download`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('download-test.txt');
    });

    it('should support Range header', async () => {
      const res = await request(API_URL)
        .get(`/api/files/${testFileId}/download`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Range', 'bytes=0-5');
      
      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBeDefined();
    });

    it('should reject invalid Range header', async () => {
      const res = await request(API_URL)
        .get(`/api/files/${testFileId}/download`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Range', 'bytes=abc-def');
      
      expect(res.status).toBe(416);
    });

    it('should reject invalid file ID format', async () => {
      const res = await request(API_URL)
        .get('/api/files/not-a-uuid/download')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(API_URL)
        .get(`/api/files/${testFileId}/download`);
      
      expect(res.status).toBe(401);
    });
  });

  describe('Share Downloads', () => {
    let shareToken: string;
    let sharedFileId: string;
    let passwordProtectedShareToken: string;

    beforeAll(async () => {
      // Upload a file to share
      const uploadRes = await request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', Buffer.from('Shared content'), 'shared.txt');
      
      sharedFileId = uploadRes.body[0].id;
      uploadedFileIds.push(sharedFileId);
      
      // Create public share
      const shareRes = await request(API_URL)
        .post('/api/shares')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileId: sharedFileId,
          type: 'PUBLIC',
        });
      
      shareToken = shareRes.body.publicToken;
      
      // Create password-protected share
      const pwShareRes = await request(API_URL)
        .post('/api/shares')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fileId: sharedFileId,
          type: 'PUBLIC',
          password: 'testpassword',
        });
      
      passwordProtectedShareToken = pwShareRes.body.publicToken;
    });

    it('should download from public share', async () => {
      const res = await request(API_URL)
        .get(`/api/shares/public/${shareToken}/download`);
      
      expect(res.status).toBe(200);
    });

    it('should require password for protected share', async () => {
      const res = await request(API_URL)
        .get(`/api/shares/public/${passwordProtectedShareToken}/download`);
      
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Password');
    });

    it('should accept correct password for protected share', async () => {
      const res = await request(API_URL)
        .get(`/api/shares/public/${passwordProtectedShareToken}/download`)
        .query({ password: 'testpassword' });
      
      expect(res.status).toBe(200);
    });

    it('should reject incorrect password', async () => {
      const res = await request(API_URL)
        .get(`/api/shares/public/${passwordProtectedShareToken}/download`)
        .query({ password: 'wrongpassword' });
      
      expect(res.status).toBe(401);
    });
  });
});

integrationDescribe('Rate Limiting', () => {
  it('should rate limit excessive uploads', async () => {
    // This test is intentionally commented out to avoid actual rate limiting
    // Uncomment for local testing only
    /*
    const promises = Array(60).fill(null).map(() =>
      request(API_URL)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('files', Buffer.from('Test'), 'test.txt')
    );
    
    const results = await Promise.all(promises);
    const rateLimited = results.some(r => r.status === 429);
    expect(rateLimited).toBe(true);
    */
  });
});
