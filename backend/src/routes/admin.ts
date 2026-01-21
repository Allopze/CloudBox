import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { uploadBranding } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { adminUserSchema, smtpConfigSchema, smtpSettingsSchema, smtpTestSchema, emailTemplateSchema, paginationSchema, PAGINATION_LIMITS, PaginationQuery, blockedExtensionsSchema } from '../schemas/index.js';
import { resetTransporter, testSmtpConnection, sendEmail, EmailError } from '../lib/email.js';
import { getBrandingPath, deleteFile, fileExists, copyFile, getStoragePath } from '../lib/storage.js';
import { encryptSecret } from '../lib/encryption.js';
import { thumbnailQueue } from '../lib/thumbnailQueue.js';
import { invalidateMaintenanceCache } from '../middleware/maintenance.js';
import sharp from 'sharp';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';
import crypto from 'crypto';
import { getBlockedExtensions, normalizeExtensionsInput, setBlockedExtensionsCache } from '../lib/security.js';

const router = Router();

type CreatedTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
};

// Security: Rate limiter for public endpoints (branding, assets)
const publicEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ========== Users Management ==========

// List all users
router.get('/users', authenticate, requireAdmin, validate(paginationSchema), async (req: Request, res: Response) => {
  try {
    // Pagination is now validated and parsed by schema
    const { page, limit, search } = req.query as unknown as PaginationQuery;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
          emailVerified: true,
          storageQuota: true,
          storageUsed: true,
          maxFileSize: true,
          createdAt: true,
          _count: { select: { files: true, folders: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map((u: any) => ({
        ...u,
        storageQuota: u.storageQuota.toString(),
        storageUsed: u.storageUsed.toString(),
        maxFileSize: u.maxFileSize.toString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Get single user
router.get('/users/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        emailVerified: true,
        storageQuota: true,
        storageUsed: true,
        maxFileSize: true,
        createdAt: true,
        _count: { select: { files: true, folders: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      ...user,
      storageQuota: user.storageQuota.toString(),
      storageUsed: user.storageUsed.toString(),
      maxFileSize: user.maxFileSize.toString(),
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update user
router.patch('/users/:id', authenticate, requireAdmin, validate(adminUserSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, storageQuota, maxFileSize } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (normalizedEmail && normalizedEmail !== user.email) {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      });
      if (existing) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }
    }

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 12);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(normalizedEmail && { email: normalizedEmail }),
        ...(hashedPassword && { password: hashedPassword }),
        ...(role && { role }),
        ...(storageQuota && { storageQuota: BigInt(storageQuota) }),
        ...(maxFileSize && { maxFileSize: BigInt(maxFileSize) }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storageQuota: true,
        storageUsed: true,
        maxFileSize: true,
      },
    });

    // Invalidate user cache so sidebar updates with new quota
    const cache = await import('../lib/cache.js');
    await cache.invalidateUser(id);

    res.json({
      ...updated,
      storageQuota: updated.storageQuota.toString(),
      storageUsed: updated.storageUsed.toString(),
      maxFileSize: updated.maxFileSize.toString(),
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Create user
// Issue #23: Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/users', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, storageQuota, maxFileSize } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    if (existing) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name,
        role: role || 'USER',
        emailVerified: true,
        storageQuota: storageQuota ? BigInt(storageQuota) : config.storage.defaultQuota,
        maxFileSize: maxFileSize ? BigInt(maxFileSize) : BigInt(config.storage.maxFileSize),
      },
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storageQuota: user.storageQuota.toString(),
      storageUsed: user.storageUsed.toString(),
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Delete user
router.delete('/users/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user!.userId;

    if (id === adminId) {
      res.status(400).json({ error: 'Cannot delete your own account from admin panel' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Delete user files from storage
    const { deleteDirectory, getStoragePath, getAvatarPath } = await import('../lib/storage.js');
    const userFilesDir = getStoragePath('files', id);
    await deleteDirectory(userFilesDir);

    const avatarPath = getAvatarPath(id);
    await deleteFile(avatarPath);

    await prisma.user.delete({ where: { id } });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ========== Storage Requests Management ==========

// Get all storage requests
router.get('/storage-requests', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const requests = await prisma.storageRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            storageUsed: true,
            storageQuota: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests.map(r => ({
      ...r,
      requestedQuota: r.requestedQuota.toString(),
      currentQuota: r.currentQuota.toString(),
      user: {
        ...r.user,
        storageUsed: r.user.storageUsed.toString(),
        storageQuota: r.user.storageQuota.toString(),
      },
    })));
  } catch (error) {
    console.error('Get storage requests error:', error);
    res.status(500).json({ error: 'Failed to get storage requests' });
  }
});

// Get pending storage requests count
router.get('/storage-requests/count', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const count = await prisma.storageRequest.count({
      where: { status: 'PENDING' },
    });

    res.json({ count });
  } catch (error) {
    console.error('Get storage requests count error:', error);
    res.status(500).json({ error: 'Failed to get storage requests count' });
  }
});

// Approve storage request
router.post('/storage-requests/:id/approve', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adminResponse } = req.body;

    const request = await prisma.storageRequest.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (request.status !== 'PENDING') {
      res.status(400).json({ error: 'Request is not pending' });
      return;
    }

    // Update user's storage quota
    await prisma.user.update({
      where: { id: request.userId },
      data: { storageQuota: request.requestedQuota },
    });

    // Update request status
    const updated = await prisma.storageRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        adminResponse: adminResponse || null,
      },
    });

    res.json({
      ...updated,
      requestedQuota: updated.requestedQuota.toString(),
      currentQuota: updated.currentQuota.toString(),
    });
  } catch (error) {
    console.error('Approve storage request error:', error);
    res.status(500).json({ error: 'Failed to approve storage request' });
  }
});

// Reject storage request
router.post('/storage-requests/:id/reject', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adminResponse } = req.body;

    const request = await prisma.storageRequest.findUnique({ where: { id } });

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (request.status !== 'PENDING') {
      res.status(400).json({ error: 'Request is not pending' });
      return;
    }

    const updated = await prisma.storageRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminResponse: adminResponse || null,
      },
    });

    res.json({
      ...updated,
      requestedQuota: updated.requestedQuota.toString(),
      currentQuota: updated.currentQuota.toString(),
    });
  } catch (error) {
    console.error('Reject storage request error:', error);
    res.status(500).json({ error: 'Failed to reject storage request' });
  }
});

// ========== Branding ==========

// Upload logo
router.post('/branding/:type', authenticate, requireAdmin, uploadBranding.single('file'), async (req: Request, res: Response) => {
  try {
    const { type } = req.params as { type: 'logo-light' | 'logo-dark' | 'favicon' };

    if (!['logo-light', 'logo-dark', 'favicon'].includes(type)) {
      res.status(400).json({ error: 'Invalid branding type' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const outputPath = getBrandingPath(type);
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const mimeType = req.file.mimetype;

    // Check if file is SVG or unsupported format - copy directly
    const isSvg = fileExt === '.svg' || mimeType === 'image/svg+xml';
    const sharpSupportedFormats = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tiff'];
    const isSharpSupported = sharpSupportedFormats.includes(fileExt);

    if (isSvg) {
      // For SVG, copy directly with .svg extension
      const svgOutputPath = outputPath.replace(/\.(png|ico)$/, '.svg');
      await fs.copyFile(req.file.path, svgOutputPath);
      await deleteFile(req.file.path);
      res.json({ path: `/api/admin/branding/${type}` });
      return;
    }

    if (!isSharpSupported) {
      // For other unsupported formats, try to copy as-is
      await fs.copyFile(req.file.path, outputPath);
      await deleteFile(req.file.path);
      res.json({ path: `/api/admin/branding/${type}` });
      return;
    }

    // Process supported formats with Sharp
    if (type === 'favicon') {
      await sharp(req.file.path)
        .resize(32, 32)
        .toFormat('png')
        .toFile(outputPath.replace('.ico', '.png'));
    } else {
      await sharp(req.file.path)
        .resize(800, 200, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toFile(outputPath);
    }

    await deleteFile(req.file.path);

    res.json({ path: `/api/admin/branding/${type}` });
  } catch (error) {
    console.error('Upload branding error:', error);
    if (req.file) {
      await deleteFile(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload branding' });
  }
});

// Get branding
router.get('/branding/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params as { type: 'logo-light' | 'logo-dark' | 'favicon' };

    if (!['logo-light', 'logo-dark', 'favicon'].includes(type)) {
      res.status(400).json({ error: 'Invalid branding type' });
      return;
    }

    const filePath = getBrandingPath(type);
    const pngPath = type === 'favicon' ? filePath.replace('.ico', '.png') : filePath;
    const svgPath = filePath.replace(/\.(png|ico)$/, '.svg');

    // Check for SVG first, then PNG
    if (await fileExists(svgPath)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.sendFile(svgPath);
    } else if (await fileExists(pngPath)) {
      res.sendFile(pngPath);
    } else {
      res.status(404).json({ error: 'Branding not found' });
    }
  } catch (error) {
    console.error('Get branding error:', error);
    res.status(500).json({ error: 'Failed to get branding' });
  }
});

// Delete branding
router.delete('/branding/:type', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { type } = req.params as { type: 'logo-light' | 'logo-dark' | 'favicon' };

    if (!['logo-light', 'logo-dark', 'favicon'].includes(type)) {
      res.status(400).json({ error: 'Invalid branding type' });
      return;
    }

    const filePath = getBrandingPath(type);
    const pngPath = type === 'favicon' ? filePath.replace('.ico', '.png') : filePath;
    const svgPath = filePath.replace(/\.(png|ico)$/, '.svg');

    // Delete both PNG and SVG versions if they exist
    await deleteFile(pngPath);
    await deleteFile(svgPath);

    res.json({ message: 'Branding deleted successfully' });
  } catch (error) {
    console.error('Delete branding error:', error);
    res.status(500).json({ error: 'Failed to delete branding' });
  }
});

// ========== SMTP Configuration ==========

// Get SMTP config
router.get('/smtp', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_from'] },
      },
    });

    const config: Record<string, string> = {};
    settings.forEach((s: { key: string; value: string }) => {
      config[s.key.replace('smtp_', '')] = s.value;
    });

    res.json(config);
  } catch (error) {
    console.error('Get SMTP config error:', error);
    res.status(500).json({ error: 'Failed to get SMTP config' });
  }
});

// Save SMTP config
router.post('/smtp', authenticate, requireAdmin, validate(smtpConfigSchema), async (req: Request, res: Response) => {
  try {
    const { host, port, secure, user, pass, from } = req.body;

    const settings = [
      { key: 'smtp_host', value: host },
      { key: 'smtp_port', value: String(port) },
      { key: 'smtp_secure', value: String(secure) },
      { key: 'smtp_user', value: user },
      { key: 'smtp_from', value: from },
    ];

    if (typeof pass === 'string' && pass.length > 0) {
      // Security: Encrypt SMTP password before storing in database
      settings.push({ key: 'smtp_pass', value: encryptSecret(pass) });
    }

    for (const setting of settings) {
      await prisma.settings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: setting,
      });
    }

    resetTransporter();

    res.json({ message: 'SMTP config saved successfully' });
  } catch (error) {
    console.error('Save SMTP config error:', error);
    res.status(500).json({ error: 'Failed to save SMTP config' });
  }
});

// Test SMTP connection
router.post('/smtp/test', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const connected = await testSmtpConnection();
    res.json({ connected });
  } catch (error) {
    console.error('Test SMTP error:', error);
    res.status(500).json({ error: 'Failed to test SMTP connection' });
  }
});

// Send test email
router.post('/smtp/send-test', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    await sendEmail(email, 'CloudBox Test Email', '<h1>Test Email</h1><p>This is a test email from CloudBox.</p>');

    res.json({ message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// ========== Upload Limits Configuration ==========

// Get upload limits
router.get('/settings/limits', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['upload_max_file_size', 'upload_chunk_size', 'upload_concurrent_chunks'] },
      },
    });

    const limits: Record<string, string> = {};
    settings.forEach((s: { key: string; value: string }) => {
      limits[s.key.replace('upload_', '')] = s.value;
    });

    // Return defaults if not set
    res.json({
      maxFileSize: limits['max_file_size'] || String(config.storage.maxFileSize),
      chunkSize: limits['chunk_size'] || String(20 * 1024 * 1024), // 20MB default
      concurrentChunks: limits['concurrent_chunks'] || '4',
    });
  } catch (error) {
    console.error('Get upload limits error:', error);
    res.status(500).json({ error: 'Failed to get upload limits' });
  }
});

// Save upload limits
router.put('/settings/limits', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { maxFileSize, chunkSize, concurrentChunks } = req.body;

    // Validate values
    const maxFileSizeNum = parseInt(maxFileSize);
    const chunkSizeNum = parseInt(chunkSize);
    const concurrentChunksNum = parseInt(concurrentChunks);

    if (isNaN(maxFileSizeNum) || maxFileSizeNum < 1024 * 1024) { // Min 1MB
      res.status(400).json({ error: 'Max file size must be at least 1MB' });
      return;
    }

    const maxChunkSize = config.limits.maxChunkSize;
    if (isNaN(chunkSizeNum) || chunkSizeNum < 1024 * 1024 || chunkSizeNum > maxChunkSize) {
      res.status(400).json({ error: `Chunk size must be between 1MB and ${Math.floor(maxChunkSize / 1024 / 1024)}MB` });
      return;
    }

    if (isNaN(concurrentChunksNum) || concurrentChunksNum < 1 || concurrentChunksNum > 10) {
      res.status(400).json({ error: 'Concurrent chunks must be between 1 and 10' });
      return;
    }

    const settings = [
      { key: 'upload_max_file_size', value: String(maxFileSizeNum) },
      { key: 'upload_chunk_size', value: String(chunkSizeNum) },
      { key: 'upload_concurrent_chunks', value: String(concurrentChunksNum) },
    ];

    for (const setting of settings) {
      await prisma.settings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: setting,
      });
    }

    res.json({
      message: 'Upload limits saved successfully',
      maxFileSize: String(maxFileSizeNum),
      chunkSize: String(chunkSizeNum),
      concurrentChunks: String(concurrentChunksNum),
    });
  } catch (error) {
    console.error('Save upload limits error:', error);
    res.status(500).json({ error: 'Failed to save upload limits' });
  }
});

// ========== Blocked Extensions Configuration ==========

router.get('/settings/blocked-extensions', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'blocked_extensions' },
    });

    const extensions = Array.from(await getBlockedExtensions());

    res.json({
      extensions,
      isDefault: !setting,
    });
  } catch (error) {
    console.error('Get blocked extensions error:', error);
    res.status(500).json({ error: 'Failed to get blocked extensions' });
  }
});

router.put('/settings/blocked-extensions', authenticate, requireAdmin, validate(blockedExtensionsSchema), async (req: Request, res: Response) => {
  try {
    const { extensions } = req.body as { extensions: string[] };
    const { normalized, invalid } = normalizeExtensionsInput(extensions);

    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid extensions: ${invalid.join(', ')}` });
      return;
    }

    await prisma.settings.upsert({
      where: { key: 'blocked_extensions' },
      update: { value: JSON.stringify(normalized) },
      create: { key: 'blocked_extensions', value: JSON.stringify(normalized) },
    });

    setBlockedExtensionsCache(normalized);

    res.json({
      message: 'Blocked extensions saved successfully',
      extensions: normalized,
    });
  } catch (error) {
    console.error('Save blocked extensions error:', error);
    res.status(500).json({ error: 'Failed to save blocked extensions' });
  }
});

// ========== CORS Configuration ==========

// Get allowed origins
router.get('/settings/cors', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'allowed_origins' },
    });

    res.json({
      allowedOrigins: setting?.value || '',
    });
  } catch (error) {
    console.error('Get CORS settings error:', error);
    res.status(500).json({ error: 'Failed to get CORS settings' });
  }
});

// Save allowed origins
router.put('/settings/cors', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { allowedOrigins } = req.body;

    // Validate: should be empty string or valid URLs separated by newlines/commas
    if (typeof allowedOrigins !== 'string') {
      res.status(400).json({ error: 'allowedOrigins must be a string' });
      return;
    }

    // Parse and validate each origin
    const origins = allowedOrigins
      .split(/[,\n]/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    for (const origin of origins) {
      try {
        new URL(origin);
      } catch {
        res.status(400).json({ error: `Invalid URL: ${origin}` });
        return;
      }
    }

    await prisma.settings.upsert({
      where: { key: 'allowed_origins' },
      update: { value: origins.join(',') },
      create: { key: 'allowed_origins', value: origins.join(',') },
    });

    // Invalidate cache
    const { invalidateAllowedOriginsCache } = await import('../lib/cors.js');
    await invalidateAllowedOriginsCache();

    res.json({ message: 'CORS settings saved successfully' });
  } catch (error) {
    console.error('Save CORS settings error:', error);
    res.status(500).json({ error: 'Failed to save CORS settings' });
  }
});

// ========== WOPI Configuration ==========

// WOPI settings keys
const WOPI_SETTING_KEYS = [
  'wopi_enabled',
  'wopi_edit_enabled',
  'wopi_public_url',
  'wopi_discovery_url',
  'wopi_allowed_iframe_origins',
  'wopi_token_ttl_seconds',
  'wopi_lock_ttl_seconds',
  'wopi_lock_provider',
  'wopi_max_file_size',
];

// Get WOPI settings
router.get('/settings/wopi', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findMany({
      where: { key: { in: WOPI_SETTING_KEYS } },
    });

    const settingsMap: Record<string, string> = {};
    settings.forEach((s: { key: string; value: string }) => {
      settingsMap[s.key] = s.value;
    });

    res.json({
      enabled: settingsMap['wopi_enabled'] === 'true',
      editEnabled: settingsMap['wopi_edit_enabled'] === 'true',
      publicUrl: settingsMap['wopi_public_url'] || config.wopi.publicUrl,
      discoveryUrl: settingsMap['wopi_discovery_url'] || '',
      allowedIframeOrigins: settingsMap['wopi_allowed_iframe_origins'] || '',
      tokenTtlSeconds: parseInt(settingsMap['wopi_token_ttl_seconds'] || '900'),
      lockTtlSeconds: parseInt(settingsMap['wopi_lock_ttl_seconds'] || '1800'),
      lockProvider: settingsMap['wopi_lock_provider'] || 'db',
      maxFileSize: parseInt(settingsMap['wopi_max_file_size'] || '104857600'),
    });
  } catch (error) {
    console.error('Get WOPI settings error:', error);
    res.status(500).json({ error: 'Failed to get WOPI settings' });
  }
});

// Save WOPI settings
router.put('/settings/wopi', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      enabled,
      editEnabled,
      publicUrl,
      discoveryUrl,
      allowedIframeOrigins,
      tokenTtlSeconds,
      lockTtlSeconds,
      lockProvider,
      maxFileSize,
    } = req.body;

    // Validate
    if (publicUrl && typeof publicUrl === 'string' && publicUrl.trim()) {
      try {
        new URL(publicUrl);
      } catch {
        res.status(400).json({ error: 'Invalid public URL format' });
        return;
      }
    }

    if (discoveryUrl && typeof discoveryUrl === 'string' && discoveryUrl.trim()) {
      try {
        new URL(discoveryUrl);
      } catch {
        res.status(400).json({ error: 'Invalid discovery URL format' });
        return;
      }
    }

    if (lockProvider && !['db', 'redis'].includes(lockProvider)) {
      res.status(400).json({ error: 'Lock provider must be "db" or "redis"' });
      return;
    }

    const settings = [
      { key: 'wopi_enabled', value: String(enabled === true) },
      { key: 'wopi_edit_enabled', value: String(editEnabled === true) },
      { key: 'wopi_public_url', value: publicUrl || '' },
      { key: 'wopi_discovery_url', value: discoveryUrl || '' },
      { key: 'wopi_allowed_iframe_origins', value: allowedIframeOrigins || '' },
      { key: 'wopi_token_ttl_seconds', value: String(parseInt(tokenTtlSeconds) || 900) },
      { key: 'wopi_lock_ttl_seconds', value: String(parseInt(lockTtlSeconds) || 1800) },
      { key: 'wopi_lock_provider', value: lockProvider || 'db' },
      { key: 'wopi_max_file_size', value: String(parseInt(maxFileSize) || 104857600) },
    ];

    for (const setting of settings) {
      await prisma.settings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: setting,
      });
    }

    res.json({ message: 'WOPI settings saved successfully' });
  } catch (error) {
    console.error('Save WOPI settings error:', error);
    res.status(500).json({ error: 'Failed to save WOPI settings' });
  }
});

// Test WOPI discovery connection
router.post('/settings/wopi/test-discovery', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { discoveryUrl } = req.body;

    if (!discoveryUrl) {
      res.status(400).json({ error: 'Discovery URL is required' });
      return;
    }

    // Validate URL
    let url: URL;
    try {
      url = new URL(discoveryUrl);
    } catch {
      res.status(400).json({ error: 'Invalid discovery URL format' });
      return;
    }

    // Fetch discovery XML
    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/xml, text/xml' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      res.status(400).json({ error: `Discovery endpoint returned ${response.status}` });
      return;
    }

    const xml = await response.text();

    // Parse to find supported extensions
    const extensionMatches = xml.matchAll(/ext="([^"]+)"/g);
    const extensions = new Set<string>();
    for (const match of extensionMatches) {
      extensions.add(match[1].toLowerCase());
    }

    res.json({
      success: true,
      extensions: Array.from(extensions).sort(),
    });
  } catch (error: any) {
    console.error('Test WOPI discovery error:', error);
    if (error.name === 'TimeoutError') {
      res.status(400).json({ error: 'Discovery request timed out' });
    } else {
      res.status(400).json({ error: error.message || 'Failed to connect to discovery endpoint' });
    }
  }
});


// ========== Email Templates ==========

// List templates
router.get('/email-templates', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { name: 'asc' },
    });

    res.json(templates);
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Get template
router.get('/email-templates/:name', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    const template = await prisma.emailTemplate.findUnique({
      where: { name },
    });

    if (!template) {
      // Return default template
      const defaults: Record<string, { subject: string; body: string }> = {
        welcome: {
          subject: 'Welcome to CloudBox, {{name}}!',
          body: '<h1>Welcome, {{name}}!</h1><p>Please verify your email: <a href="{{verifyUrl}}">Verify</a></p>',
        },
        reset_password: {
          subject: 'Reset Your CloudBox Password',
          body: '<h1>Password Reset</h1><p>Hi {{name}}, reset your password: <a href="{{resetUrl}}">Reset</a></p>',
        },
        test: {
          subject: 'CloudBox Test Email',
          body: '<h1>Test Email</h1><p>This is a test email from CloudBox. If you received this message, your SMTP configuration is working correctly.</p><p>Sent to: {{email}}</p>',
        },
      };

      if (defaults[name]) {
        res.json({ name, ...defaults[name], isDefault: true });
      } else {
        res.status(404).json({ error: 'Template not found' });
      }
      return;
    }

    res.json(template);
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// Update template
router.put('/email-templates/:name', authenticate, requireAdmin, validate(emailTemplateSchema), async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { subject, body } = req.body;

    const template = await prisma.emailTemplate.upsert({
      where: { name },
      update: { subject, body },
      create: { name, subject, body },
    });

    res.json(template);
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Reset template to default
router.delete('/email-templates/:name', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    await prisma.emailTemplate.delete({
      where: { name },
    }).catch(() => { });

    res.json({ message: 'Template reset to default' });
  } catch (error) {
    console.error('Reset template error:', error);
    res.status(500).json({ error: 'Failed to reset template' });
  }
});

// Send test template
router.post('/email-templates/:name/test', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { email, to, subject: draftSubject, body: draftBody } = req.body;
    const recipient = email || to;

    if (!recipient) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const template = await prisma.emailTemplate.findUnique({
      where: { name },
      include: { variables: true },
    });

    let subject = typeof draftSubject === 'string' ? draftSubject : 'Test Email';
    let body = typeof draftBody === 'string' ? draftBody : '<p>Test email content</p>';

    if (template) {
      if (typeof draftSubject !== 'string') {
        subject = template.subject;
      }
      if (typeof draftBody !== 'string') {
        body = template.body;
      }

      // Replace system variables with test values
      const systemTestValues: Record<string, string> = {
        name: 'Usuario de Prueba',
        verifyUrl: '#',
        resetUrl: '#',
        email: recipient,
        appName: 'CloudBox',
        appUrl: config.frontendUrl,
        date: new Date().toLocaleDateString('es-ES'),
      };

      // Replace custom variables with their default values
      for (const variable of template.variables) {
        const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
        const value = systemTestValues[variable.name] || variable.defaultValue;
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }

      // Replace any remaining system variables
      for (const [key, value] of Object.entries(systemTestValues)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }
    }

    await sendEmail(recipient, subject, body);

    res.json({ message: 'Test email sent' });
  } catch (error) {
    console.error('Send test template error:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// ========== Email Template Variables ==========

// Get variables for a template
router.get('/email-templates/:name/variables', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    const template = await prisma.emailTemplate.findUnique({
      where: { name },
      include: { variables: true },
    });

    // System variables that are always available
    const systemVariables = [
      { name: 'name', description: 'Nombre del usuario', isSystem: true, defaultValue: '' },
      { name: 'email', description: 'Email del usuario', isSystem: true, defaultValue: '' },
      { name: 'appName', description: 'Nombre de la aplicación', isSystem: true, defaultValue: 'CloudBox' },
      { name: 'appUrl', description: 'URL de la aplicación', isSystem: true, defaultValue: config.frontendUrl },
      { name: 'date', description: 'Fecha actual', isSystem: true, defaultValue: '' },
    ];

    // Template-specific system variables
    if (name === 'welcome') {
      systemVariables.push({ name: 'verifyUrl', description: 'URL de verificación de email', isSystem: true, defaultValue: '' });
    } else if (name === 'reset_password') {
      systemVariables.push({ name: 'resetUrl', description: 'URL de restablecimiento de contraseña', isSystem: true, defaultValue: '' });
    }

    const customVariables = template?.variables.filter(v => !v.isSystem) || [];

    res.json({
      system: systemVariables,
      custom: customVariables,
    });
  } catch (error) {
    console.error('Get template variables error:', error);
    res.status(500).json({ error: 'Failed to get template variables' });
  }
});

// Add custom variable to template
router.post('/email-templates/:name/variables', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name: templateName } = req.params;
    const { name, defaultValue, description } = req.body;

    if (!name || !defaultValue) {
      res.status(400).json({ error: 'Variable name and default value are required' });
      return;
    }

    // Validate variable name (alphanumeric and underscore only)
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      res.status(400).json({ error: 'Variable name must start with a letter and contain only letters, numbers, and underscores' });
      return;
    }

    // System variable names that cannot be used
    const reservedNames = ['name', 'email', 'verifyUrl', 'resetUrl', 'appName', 'appUrl', 'date'];
    if (reservedNames.includes(name)) {
      res.status(400).json({ error: 'This variable name is reserved for system use' });
      return;
    }

    // Get or create template
    let template = await prisma.emailTemplate.findUnique({ where: { name: templateName } });

    if (!template) {
      // Create template with default values
      const defaults: Record<string, { subject: string; body: string }> = {
        welcome: {
          subject: 'Welcome to CloudBox, {{name}}!',
          body: '<h1>Welcome, {{name}}!</h1><p>Please verify your email: <a href="{{verifyUrl}}">Verify</a></p>',
        },
        reset_password: {
          subject: 'Reset Your CloudBox Password',
          body: '<h1>Password Reset</h1><p>Hi {{name}}, reset your password: <a href="{{resetUrl}}">Reset</a></p>',
        },
      };

      const defaultTemplate = defaults[templateName];
      if (!defaultTemplate) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      template = await prisma.emailTemplate.create({
        data: {
          name: templateName,
          subject: defaultTemplate.subject,
          body: defaultTemplate.body,
        },
      });
    }

    const variable = await prisma.emailTemplateVariable.create({
      data: {
        templateId: template.id,
        name,
        defaultValue,
        description: description || '',
        isSystem: false,
      },
    });

    res.json(variable);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      res.status(400).json({ error: 'Variable already exists for this template' });
      return;
    }
    console.error('Add template variable error:', error);
    res.status(500).json({ error: 'Failed to add template variable' });
  }
});

// Update custom variable
router.put('/email-templates/:name/variables/:variableId', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { variableId } = req.params;
    const { defaultValue, description } = req.body;

    const variable = await prisma.emailTemplateVariable.findUnique({ where: { id: variableId } });

    if (!variable) {
      res.status(404).json({ error: 'Variable not found' });
      return;
    }

    if (variable.isSystem) {
      res.status(400).json({ error: 'Cannot modify system variables' });
      return;
    }

    const updated = await prisma.emailTemplateVariable.update({
      where: { id: variableId },
      data: {
        defaultValue: defaultValue !== undefined ? defaultValue : variable.defaultValue,
        description: description !== undefined ? description : variable.description,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update template variable error:', error);
    res.status(500).json({ error: 'Failed to update template variable' });
  }
});

// Delete custom variable
router.delete('/email-templates/:name/variables/:variableId', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { variableId } = req.params;

    const variable = await prisma.emailTemplateVariable.findUnique({ where: { id: variableId } });

    if (!variable) {
      res.status(404).json({ error: 'Variable not found' });
      return;
    }

    if (variable.isSystem) {
      res.status(400).json({ error: 'Cannot delete system variables' });
      return;
    }

    await prisma.emailTemplateVariable.delete({ where: { id: variableId } });

    res.json({ message: 'Variable deleted' });
  } catch (error) {
    console.error('Delete template variable error:', error);
    res.status(500).json({ error: 'Failed to delete template variable' });
  }
});

// Initialize default templates
router.post('/email-templates/initialize', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const defaultTemplates = [
      {
        name: 'welcome',
        subject: 'Welcome to CloudBox, {{name}}!',
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">Welcome to CloudBox!</h1>
            <p>Hi {{name}},</p>
            <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="{{verifyUrl}}" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Verify Email</a>
            </div>
            <p>If you didn't create this account, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">Best regards,<br>The CloudBox Team</p>
          </div>
        `,
        variables: [
          { name: 'name', defaultValue: 'User', description: 'User display name', isSystem: true },
          { name: 'verifyUrl', defaultValue: '#', description: 'Verification link', isSystem: true }
        ]
      },
      {
        name: 'reset-password',
        subject: 'Reset Your CloudBox Password',
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">Password Reset Request</h1>
            <p>Hi {{name}},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="{{resetUrl}}" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
            </div>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">Best regards,<br>The CloudBox Team</p>
          </div>
        `,
        variables: [
          { name: 'name', defaultValue: 'User', description: 'User display name', isSystem: true },
          { name: 'resetUrl', defaultValue: '#', description: 'Password reset link', isSystem: true }
        ]
      },
      {
        name: 'verify-email',
        subject: 'Verify your email address',
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">Email Verification</h1>
            <p>Hi {{name}},</p>
            <p>Please click the button below to verify your email address:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="{{verifyUrl}}" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Verify Email</a>
            </div>
            <p>Best regards,<br>The CloudBox Team</p>
          </div>
        `,
        variables: [
          { name: 'name', defaultValue: 'User', description: 'User display name', isSystem: true },
          { name: 'verifyUrl', defaultValue: '#', description: 'Verification link', isSystem: true }
        ]
      }
    ];

    const created: CreatedTemplate[] = [];
    for (const tpl of defaultTemplates) {
      const existing = await prisma.emailTemplate.findUnique({ where: { name: tpl.name } });
      if (!existing) {
        const newTpl = await prisma.emailTemplate.create({
          data: {
            name: tpl.name,
            subject: tpl.subject,
            body: tpl.body,
            isDefault: true,
            variables: {
              create: tpl.variables
            }
          }
        });
        created.push(newTpl);
      }
    }

    res.json({ message: `Initialized ${created.length} templates`, created });
  } catch (error) {
    console.error('Initialize templates error:', error);
    res.status(500).json({ error: 'Failed to initialize templates' });
  }
});

// ========== Dashboard Stats ==========

// Get admin stats
router.get('/stats', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalUsers, totalFiles, totalStorageResult, activeUsersCount] = await Promise.all([
      prisma.user.count(),
      prisma.file.count(),
      prisma.user.aggregate({
        _sum: { storageUsed: true },
      }),
      prisma.activity.groupBy({
        by: ['userId'],
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
      }),
    ]);

    res.json({
      totalUsers,
      totalFiles,
      totalStorage: totalStorageResult._sum.storageUsed?.toString() || '0',
      activeUsers: activeUsersCount.length,
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ error: 'Failed to get admin stats' });
  }
});

// ========== Admin Summary Dashboard ==========

import * as cache from '../lib/cache.js';
import { adminLogger } from '../lib/logger.js';
// Note: testSmtpConnection and sendEmail already imported at top of file

// Alert thresholds (can be configured via env)
const ALERT_THRESHOLDS = {
  diskUsageWarning: parseFloat(process.env.ALERT_DISK_WARNING || '80'), // 80%
  diskUsageCritical: parseFloat(process.env.ALERT_DISK_CRITICAL || '95'), // 95%
  failedLoginsWarning: parseInt(process.env.ALERT_FAILED_LOGINS || '50', 10), // 50 in 24h
  jobsStuckMinutes: parseInt(process.env.ALERT_JOBS_STUCK_MINUTES || '60', 10), // 60 min
};

// Get comprehensive admin summary
router.get('/summary', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  adminLogger.info({ requestId, endpoint: '/admin/summary' }, 'Summary dashboard request');

  try {
    // Check cache first
    const cached = await cache.getAdminSummary();
    if (cached) {
      adminLogger.debug({ requestId }, 'Returning cached summary');
      res.json(cached);
      return;
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ===== Health Checks =====
    // DB health with latency measurement
    const dbStart = Date.now();
    let dbStatus = 'OK';
    let dbLatency = 0;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
      if (dbLatency > 500) dbStatus = 'DEGRADED';
    } catch {
      dbStatus = 'DOWN';
    }

    // Storage stats
    const storageResult = await prisma.user.aggregate({
      _sum: { storageUsed: true, storageQuota: true },
    });
    const usedBytes = storageResult._sum.storageUsed || BigInt(0);
    const totalQuota = storageResult._sum.storageQuota || BigInt(1);
    const freePercent = 100 - Number((usedBytes * BigInt(100)) / totalQuota);
    let storageStatus = 'OK';
    if (freePercent < 100 - ALERT_THRESHOLDS.diskUsageCritical) storageStatus = 'CRITICAL';
    else if (freePercent < 100 - ALERT_THRESHOLDS.diskUsageWarning) storageStatus = 'ALERT';

    // SMTP status
    let smtpStatus = 'NOT_CONFIGURED';
    try {
      const smtpResult = await testSmtpConnection();
      if (smtpResult.connected) {
        smtpStatus = 'CONFIGURED';
      } else if (smtpResult.message.toLowerCase().includes('not configured')) {
        smtpStatus = 'NOT_CONFIGURED';
      } else {
        smtpStatus = 'FAILED';
      }
    } catch (error) {
      if (error instanceof EmailError && error.code === 'SMTP_NOT_CONFIGURED') {
        smtpStatus = 'NOT_CONFIGURED';
      } else {
        smtpStatus = 'FAILED';
      }
    }

    // Jobs status (check TranscodingJob table if exists)
    let jobsStatus = 'OK';
    let jobsDetails = { transcoding: { waiting: 0, failed: 0, oldest: null as string | null } };
    try {
      const [waiting, failed, oldest] = await Promise.all([
        prisma.transcodingJob.count({ where: { status: 'PENDING' } }),
        prisma.transcodingJob.count({ where: { status: 'FAILED' } }),
        prisma.transcodingJob.findFirst({
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ]);
      jobsDetails.transcoding = { waiting, failed, oldest: oldest?.createdAt?.toISOString() || null };
      if (oldest) {
        const ageMinutes = (now.getTime() - oldest.createdAt.getTime()) / 60000;
        if (ageMinutes > ALERT_THRESHOLDS.jobsStuckMinutes) jobsStatus = 'STUCK';
      }
      if (failed > 5) jobsStatus = 'ALERT';
    } catch {
      // TranscodingJob table might not have data
    }

    // Version info
    const version = process.env.npm_package_version || '1.0.0';
    const commit = process.env.GIT_COMMIT || undefined;

    const health = {
      api: { status: 'OK' },
      db: { status: dbStatus, latencyMs: dbLatency },
      storage: { status: storageStatus, usedBytes: usedBytes.toString(), totalQuota: totalQuota.toString(), freePercent },
      jobs: { status: jobsStatus, details: jobsDetails },
      smtp: { status: smtpStatus },
      version: { version, commit, migrationsPending: false },
    };

    // ===== Metrics =====
    const [
      totalUsers,
      active24h,
      active7d,
      active30d,
      newToday,
      newWeek,
      uploads24h,
      downloads24h,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.activity.groupBy({ by: ['userId'], where: { createdAt: { gte: oneDayAgo } } }).then(r => r.length),
      prisma.activity.groupBy({ by: ['userId'], where: { createdAt: { gte: sevenDaysAgo } } }).then(r => r.length),
      prisma.activity.groupBy({ by: ['userId'], where: { createdAt: { gte: thirtyDaysAgo } } }).then(r => r.length),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.activity.count({ where: { type: 'UPLOAD', createdAt: { gte: oneDayAgo } } }),
      prisma.activity.count({ where: { type: 'DOWNLOAD', createdAt: { gte: oneDayAgo } } }),
    ]);

    // Bytes uploaded in 24h (sum from files created)
    const uploadedBytesResult = await prisma.file.aggregate({
      _sum: { size: true },
      where: { createdAt: { gte: oneDayAgo } },
    });
    const bytes24h = uploadedBytesResult._sum.size || BigInt(0);

    const metrics = {
      users: { total: totalUsers, active24: active24h, active7d, active30d, newToday, newWeek },
      uploads: { count24h: uploads24h, bytes24h: bytes24h.toString() },
      downloads: { count24h: downloads24h },
    };

    // ===== Capacity =====
    // Storage series: last 7 days of storage usage (approximated by file creation dates)
    const storageSeries: { date: string; bytes: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dayFiles = await prisma.file.aggregate({
        _sum: { size: true },
        where: { createdAt: { lte: dayEnd } },
      });
      storageSeries.push({
        date: dayStart.toISOString().split('T')[0],
        bytes: Number(dayFiles._sum.size || 0),
      });
    }

    // Projection: days until storage is full (linear extrapolation)
    let projectionDays: number | null = null;
    if (storageSeries.length >= 2) {
      const first = storageSeries[0].bytes;
      const last = storageSeries[storageSeries.length - 1].bytes;
      const dailyGrowth = (last - first) / (storageSeries.length - 1);
      if (dailyGrowth > 0) {
        const remaining = Number(totalQuota) - last;
        projectionDays = Math.floor(remaining / dailyGrowth);
      }
    }

    // Top 10 large files
    const topLargeFiles = await prisma.file.findMany({
      take: 10,
      orderBy: { size: 'desc' },
      select: {
        id: true,
        name: true,
        size: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });

    const capacity = {
      storageSeries,
      projectionDays,
      topLargeFiles: topLargeFiles.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size.toString(),
        createdAt: f.createdAt.toISOString(),
        owner: f.user,
      })),
    };

    // ===== Alerts =====
    const alerts: { severity: 'warning' | 'critical'; message: string; timestamp: string; action?: string }[] = [];

    if (storageStatus === 'CRITICAL') {
      alerts.push({ severity: 'critical', message: 'Almacenamiento crítico: menos del 5% libre', timestamp: now.toISOString() });
    } else if (storageStatus === 'ALERT') {
      alerts.push({ severity: 'warning', message: 'Almacenamiento bajo: menos del 20% libre', timestamp: now.toISOString() });
    }

    if (dbStatus === 'DOWN') {
      alerts.push({ severity: 'critical', message: 'Base de datos no responde', timestamp: now.toISOString() });
    } else if (dbStatus === 'DEGRADED') {
      alerts.push({ severity: 'warning', message: 'Base de datos lenta (>500ms)', timestamp: now.toISOString() });
    }

    if (jobsStatus === 'STUCK') {
      alerts.push({ severity: 'warning', message: 'Hay jobs de transcodificación atascados', timestamp: now.toISOString(), action: 'retry-jobs' });
    }

    if (smtpStatus === 'FAILED') {
      alerts.push({ severity: 'warning', message: 'SMTP no funciona correctamente', timestamp: now.toISOString(), action: 'test-smtp' });
    }

    // Check for excessive failed logins
    const failedLogins24h = await prisma.loginAttempt.count({
      where: { success: false, createdAt: { gte: oneDayAgo } },
    });
    if (failedLogins24h > ALERT_THRESHOLDS.failedLoginsWarning) {
      alerts.push({ severity: 'warning', message: `Alto número de logins fallidos: ${failedLogins24h} en 24h`, timestamp: now.toISOString() });
    }

    // ===== Security =====
    const [successLogins, failedLoginsTotal, topFailIps] = await Promise.all([
      prisma.loginAttempt.count({ where: { success: true, createdAt: { gte: oneDayAgo } } }),
      prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: oneDayAgo } } }),
      prisma.loginAttempt.groupBy({
        by: ['ipAddress'],
        where: { success: false, createdAt: { gte: oneDayAgo } },
        _count: true,
        orderBy: { _count: { ipAddress: 'desc' } },
        take: 5,
      }),
    ]);

    const security = {
      logins: { success: successLogins, failed: failedLoginsTotal },
      topFailIps: topFailIps.map(ip => ({ ip: ip.ipAddress, count: ip._count })),
    };

    // ===== Build summary response =====
    const summary = {
      generatedAt: now.toISOString(),
      health,
      metrics,
      capacity,
      alerts,
      security,
    };

    // Cache the result
    await cache.setAdminSummary(summary);
    adminLogger.info({ requestId }, 'Summary generated successfully');

    res.json(summary);
  } catch (error) {
    adminLogger.error({ requestId, error }, 'Get admin summary error');
    console.error('Get admin summary error:', error);
    res.status(500).json({ error: 'Failed to get admin summary' });
  }
});

// Export summary as JSON
router.get('/summary/export', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  adminLogger.info({ requestId }, 'Summary export request');

  try {
    // Get fresh data (don't use cache for export)
    const cached = await cache.getAdminSummary();
    if (!cached) {
      res.status(202).json({ message: 'Summary not ready, try again shortly' });
      return;
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      ...cached,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=cloudbox-summary-${new Date().toISOString().split('T')[0]}.json`);
    res.json(exportData);
  } catch (error) {
    adminLogger.error({ requestId, error }, 'Export summary error');
    res.status(500).json({ error: 'Failed to export summary' });
  }
});

// ===== Summary Actions =====

// Test SMTP connection and send test email
router.post('/summary/actions/test-smtp', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  const { email } = req.body;
  adminLogger.info({ requestId, action: 'test-smtp', email }, 'Test SMTP action');

  try {
    if (!email) {
      res.status(400).json({ error: 'Email address required' });
      return;
    }

    const result = await testSmtpConnection();
    if (!result.connected) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }

    // Send a test email
    await sendEmail(
      email,
      'CloudBox - Test Email',
      '<h1>Test Email</h1><p>This is a test email from CloudBox. Your SMTP configuration is working correctly.</p>'
    );

    adminLogger.info({ requestId, email }, 'Test email sent successfully');
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error: any) {
    adminLogger.error({ requestId, error }, 'Test SMTP failed');
    res.status(500).json({ success: false, message: error?.message || 'Failed to send test email' });
  }
});

// Retry failed jobs (placeholder - depends on queue implementation)
router.post('/summary/actions/retry-jobs', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  adminLogger.info({ requestId, action: 'retry-jobs' }, 'Retry jobs action');

  try {
    // Reset failed transcoding jobs to pending
    const updated = await prisma.transcodingJob.updateMany({
      where: { status: 'FAILED' },
      data: { status: 'PENDING', error: null },
    });

    adminLogger.info({ requestId, count: updated.count }, 'Jobs reset to pending');
    res.json({ success: true, message: `${updated.count} jobs reset to pending` });
  } catch (error) {
    adminLogger.error({ requestId, error }, 'Retry jobs failed');
    res.status(500).json({ success: false, message: 'Failed to retry jobs' });
  }
});

// Reindex - Update file search metadata
router.post('/summary/actions/reindex', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  adminLogger.info({ requestId, action: 'reindex' }, 'Reindex action started');

  try {
    // Get all files and update their search-related metadata
    const files = await prisma.file.findMany({
      select: { id: true, name: true, mimeType: true, size: true },
    });

    let updated = 0;
    for (const file of files) {
      // Extract extension and category
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const category = getCategoryFromMime(file.mimeType);

      // Update file metadata (useful for search optimization)
      await prisma.file.update({
        where: { id: file.id },
        data: {
          updatedAt: new Date(), // Touch the timestamp to trigger any search index updates
        },
      });
      updated++;
    }

    adminLogger.info({ requestId, count: updated }, 'Reindex completed');
    res.json({ success: true, message: `${updated} files reindexed`, count: updated });
  } catch (error) {
    adminLogger.error({ requestId, error }, 'Reindex failed');
    res.status(500).json({ success: false, message: 'Failed to reindex files' });
  }
});

// Helper function to get category from mime type
function getCategoryFromMime(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('sheet') || mimeType.includes('presentation')) return 'document';
  return 'other';
}

// Regenerate thumbnails - Queue thumbnail regeneration for image/video files
router.post('/summary/actions/regenerate-thumbnails', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  adminLogger.info({ requestId, action: 'regenerate-thumbnails' }, 'Regenerate thumbnails action started');

  try {
    const officeMimeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
    ];

    const files = await prisma.file.findMany({
      where: {
        isTrash: false,
        OR: [
          { mimeType: { startsWith: 'image/' } },
          { mimeType: { startsWith: 'video/' } },
          { mimeType: { equals: 'application/pdf' } },
          { mimeType: { in: officeMimeTypes } },
        ],
      },
      select: { id: true, mimeType: true, path: true, userId: true },
    });

    let imagesQueued = 0;
    let videosQueued = 0;
    let documentsQueued = 0;

    for (const file of files) {
      if (file.mimeType.startsWith('video/')) {
        const existingJob = await prisma.transcodingJob.findFirst({
          where: { fileId: file.id, status: { in: ['PENDING', 'PROCESSING'] } },
        });

        if (!existingJob) {
          await prisma.transcodingJob.create({
            data: {
              fileId: file.id,
              status: 'PENDING',
            },
          });
          videosQueued++;
        }
        continue;
      }

      const added = thumbnailQueue.add({
        fileId: file.id,
        filePath: file.path,
        mimeType: file.mimeType,
        userId: file.userId || undefined,
      });

      if (added) {
        if (file.mimeType.startsWith('image/')) {
          imagesQueued++;
        } else {
          documentsQueued++;
        }
      }
    }

    adminLogger.info({ requestId, imagesQueued, videosQueued, documentsQueued }, 'Thumbnail regeneration completed');
    res.json({
      success: true,
      message: `${imagesQueued} image thumbnails queued, ${videosQueued} video jobs queued, ${documentsQueued} document thumbnails queued`,
      images: imagesQueued,
      videos: videosQueued,
      documents: documentsQueued,
    });
  } catch (error) {
    adminLogger.error({ requestId, error }, 'Regenerate thumbnails failed');
    res.status(500).json({ success: false, message: 'Failed to regenerate thumbnails' });
  }
});

// Toggle maintenance mode
router.post('/summary/actions/toggle-maintenance', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  adminLogger.info({ requestId, action: 'toggle-maintenance' }, 'Toggle maintenance action');

  try {
    const currentSetting = await prisma.settings.findUnique({ where: { key: 'maintenance_mode' } });
    const currentValue = currentSetting?.value === 'true';
    const newValue = !currentValue;

    await prisma.settings.upsert({
      where: { key: 'maintenance_mode' },
      update: { value: String(newValue) },
      create: { key: 'maintenance_mode', value: String(newValue) },
    });

    adminLogger.info({ requestId, maintenance: newValue }, 'Maintenance mode toggled');
    invalidateMaintenanceCache();
    res.json({ success: true, maintenance: newValue, message: newValue ? 'Modo mantenimiento activado' : 'Modo mantenimiento desactivado' });
  } catch (error) {
    adminLogger.error({ requestId, error }, 'Toggle maintenance failed');
    res.status(500).json({ success: false, message: 'Failed to toggle maintenance mode' });
  }
});

// ========== Server Info ==========

// Get server info
router.get('/server-info', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const [totalUsers, totalFiles, totalFolders] = await Promise.all([
      prisma.user.count(),
      prisma.file.count(),
      prisma.folder.count(),
    ]);

    const totalStorage = await prisma.user.aggregate({
      _sum: { storageUsed: true },
    });

    res.json({
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
      },
      uptime: os.uptime(),
      nodeVersion: process.version,
      port: config.port,
      frontendUrl: config.frontendUrl,
      stats: {
        users: totalUsers,
        files: totalFiles,
        folders: totalFolders,
        totalStorage: totalStorage._sum.storageUsed?.toString() || '0',
      },
    });
  } catch (error) {
    console.error('Get server info error:', error);
    res.status(500).json({ error: 'Failed to get server info' });
  }
});

// Healthcheck
router.get('/health', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
  }
});

// ========== Settings API ==========

// Get branding settings (Public)
router.get('/settings/branding', publicEndpointLimiter, async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['branding_primary_color', 'branding_logo_url', 'branding_logo_light_url', 'branding_logo_dark_url', 'branding_favicon_url', 'branding_custom_css', 'site_name'] },
      },
    });

    const result: Record<string, string> = {
      primaryColor: '#FF3B3B',
      logoUrl: '',
      logoLightUrl: '',
      logoDarkUrl: '',
      faviconUrl: '',
      customCss: '',
      siteName: 'CloudBox',
    };

    settings.forEach((s: { key: string; value: string }) => {
      const keyMap: Record<string, string> = {
        'branding_primary_color': 'primaryColor',
        'branding_logo_url': 'logoUrl',
        'branding_logo_light_url': 'logoLightUrl',
        'branding_logo_dark_url': 'logoDarkUrl',
        'branding_favicon_url': 'faviconUrl',
        'branding_custom_css': 'customCss',
        'site_name': 'siteName',
      };
      const mappedKey = keyMap[s.key];
      if (mappedKey) {
        result[mappedKey] = s.value;
      }
    });

    // Check if branding files exist and set URLs accordingly
    // Issue #19: Use file modification timestamp instead of Date.now()
    const brandingTypes = ['logo-light', 'logo-dark', 'favicon'] as const;

    for (const type of brandingTypes) {
      const filePath = getBrandingPath(type);
      const pngPath = type === 'favicon' ? filePath.replace('.ico', '.png') : filePath;
      const svgPath = filePath.replace(/\.(png|ico)$/, '.svg');

      let existingPath: string | null = null;
      if (await fileExists(svgPath)) {
        existingPath = svgPath;
      } else if (await fileExists(pngPath)) {
        existingPath = pngPath;
      }

      if (existingPath) {
        // Get file modification time for cache-busting
        const stats = await fs.stat(existingPath);
        const timestamp = stats.mtimeMs;
        const url = `/api/admin/branding/${type}?t=${timestamp}`;
        if (type === 'logo-light') result.logoLightUrl = url;
        else if (type === 'logo-dark') result.logoDarkUrl = url;
        else if (type === 'favicon') result.faviconUrl = url;
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Get branding settings error:', error);
    res.status(500).json({ error: 'Failed to get branding settings' });
  }
});

// Save branding settings
router.put('/settings/branding', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { primaryColor, logoUrl, logoLightUrl, logoDarkUrl, faviconUrl, customCss, siteName } = req.body;

    const settings = [
      { key: 'branding_primary_color', value: primaryColor || '#FF3B3B' },
      { key: 'branding_logo_url', value: logoUrl || '' },
      { key: 'branding_logo_light_url', value: logoLightUrl || '' },
      { key: 'branding_logo_dark_url', value: logoDarkUrl || '' },
      { key: 'branding_favicon_url', value: faviconUrl || '' },
      { key: 'branding_custom_css', value: customCss || '' },
      { key: 'site_name', value: siteName || 'CloudBox' },
    ];

    for (const setting of settings) {
      await prisma.settings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: setting,
      });
    }

    res.json({ message: 'Branding settings saved successfully' });
  } catch (error) {
    console.error('Save branding settings error:', error);
    res.status(500).json({ error: 'Failed to save branding settings' });
  }
});

// Get system settings
router.get('/settings/system', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['site_name', 'site_description', 'allow_registration', 'default_storage_quota', 'max_file_size', 'allowed_file_types'] },
      },
    });

    const result: Record<string, any> = {
      siteName: 'CloudBox',
      siteDescription: 'Your files, everywhere',
      allowRegistration: true,
      defaultStorageQuota: '10737418240',
      maxFileSize: '1073741824',
      allowedFileTypes: '*',
    };

    settings.forEach((s: { key: string; value: string }) => {
      const keyMap: Record<string, string> = {
        'site_name': 'siteName',
        'site_description': 'siteDescription',
        'allow_registration': 'allowRegistration',
        'default_storage_quota': 'defaultStorageQuota',
        'max_file_size': 'maxFileSize',
        'allowed_file_types': 'allowedFileTypes',
      };
      const mappedKey = keyMap[s.key];
      if (mappedKey) {
        if (mappedKey === 'allowRegistration') {
          result[mappedKey] = s.value === 'true';
        } else {
          result[mappedKey] = s.value;
        }
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({ error: 'Failed to get system settings' });
  }
});

// Save system settings
router.put('/settings/system', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { siteName, siteDescription, allowRegistration, defaultStorageQuota, maxFileSize, allowedFileTypes } = req.body;

    const settings = [
      { key: 'site_name', value: siteName || 'CloudBox' },
      { key: 'site_description', value: siteDescription || '' },
      { key: 'allow_registration', value: String(allowRegistration ?? true) },
      { key: 'default_storage_quota', value: String(defaultStorageQuota || '10737418240') },
      { key: 'max_file_size', value: String(maxFileSize || '1073741824') },
      { key: 'allowed_file_types', value: allowedFileTypes || '*' },
    ];

    for (const setting of settings) {
      await prisma.settings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: setting,
      });
    }

    res.json({ message: 'System settings saved successfully' });
  } catch (error) {
    console.error('Save system settings error:', error);
    res.status(500).json({ error: 'Failed to save system settings' });
  }
});

// Get SMTP settings (aliased endpoint)
router.get('/settings/smtp', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_from_name', 'smtp_from_email'] },
      },
    });

    const result: Record<string, any> = {
      host: '',
      port: 587,
      secure: false,
      user: '',
      password: '',
      fromName: 'CloudBox',
      fromEmail: '',
    };

    settings.forEach((s: { key: string; value: string }) => {
      const keyMap: Record<string, string> = {
        'smtp_host': 'host',
        'smtp_port': 'port',
        'smtp_secure': 'secure',
        'smtp_user': 'user',
        'smtp_from_name': 'fromName',
        'smtp_from_email': 'fromEmail',
      };
      const mappedKey = keyMap[s.key];
      if (mappedKey) {
        if (mappedKey === 'port') {
          result[mappedKey] = parseInt(s.value) || 587;
        } else if (mappedKey === 'secure') {
          result[mappedKey] = s.value === 'true';
        } else {
          result[mappedKey] = s.value;
        }
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Get SMTP settings error:', error);
    res.status(500).json({ error: 'Failed to get SMTP settings' });
  }
});

// Save SMTP settings (aliased endpoint)
router.put('/settings/smtp', authenticate, requireAdmin, validate(smtpSettingsSchema), async (req: Request, res: Response) => {
  try {
    const { host, port, secure, user, password, fromName, fromEmail } = req.body;

    // Build consolidated smtp_from for backward compatibility
    const consolidatedFrom = fromEmail
      ? `"${(fromName || 'CloudBox').replace(/"/g, '\\"')}" <${fromEmail}>`
      : '';

    const settings = [
      { key: 'smtp_host', value: host || '' },
      { key: 'smtp_port', value: String(port || 587) },
      { key: 'smtp_secure', value: String(secure || false) },
      { key: 'smtp_user', value: user || '' },
      { key: 'smtp_from_name', value: fromName || 'CloudBox' },
      { key: 'smtp_from_email', value: fromEmail || '' },
      { key: 'smtp_from', value: consolidatedFrom }, // Backward compatibility
    ];

    if (password) {
      // Security: Encrypt SMTP password before storing in database
      settings.push({ key: 'smtp_pass', value: encryptSecret(password) });
    }

    for (const setting of settings) {
      await prisma.settings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: setting,
      });
    }

    resetTransporter();

    res.json({ message: 'SMTP settings saved successfully' });
  } catch (error) {
    console.error('Save SMTP settings error:', error);
    res.status(500).json({ error: 'Failed to save SMTP settings' });
  }
});

// Test SMTP (aliased endpoint) - email is now REQUIRED
router.post('/settings/smtp/test', authenticate, requireAdmin, validate(smtpTestSchema), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Load test template from DB or use default
    const template = await prisma.emailTemplate.findUnique({
      where: { name: 'test' },
      include: { variables: true },
    });

    let subject = 'CloudBox Test Email';
    let body = '<h1>Test Email</h1><p>This is a test email from CloudBox. If you received this message, your SMTP configuration is working correctly.</p><p>Sent to: {{email}}</p>';

    if (template) {
      subject = template.subject;
      body = template.body;
    }

    // Replace variables
    const variables: Record<string, string> = {
      email,
      name: 'Admin',
      appName: 'CloudBox',
      appUrl: config.frontendUrl,
      date: new Date().toLocaleDateString('es-ES'),
    };

    // Replace custom variables if they exist
    if (template?.variables) {
      for (const variable of template.variables) {
        const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
        const value = variables[variable.name] || variable.defaultValue;
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }
    }

    // Replace system variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    }

    const result = await sendEmail(email, subject, body);

    res.json({
      message: 'Test email sent successfully',
      details: {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
        durationMs: result.durationMs,
      }
    });
  } catch (error: any) {
    console.error('Test SMTP error:', error);

    if (error instanceof EmailError) {
      res.status(400).json({
        error: error.message,
        code: error.code
      });
      return;
    }

    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// ========== Legal Pages ==========

type LegalLocale = 'es' | 'en';

const normalizeLegalLocale = (value: unknown): LegalLocale => {
  if (typeof value !== 'string') return 'es';
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('es')) return 'es';
  return 'en';
};

const getLegalLocale = (req: Request): LegalLocale => {
  const queryLocale = req.query.locale;
  if (Array.isArray(queryLocale) && queryLocale.length > 0) {
    return normalizeLegalLocale(queryLocale[0]);
  }
  if (typeof queryLocale === 'string') {
    return normalizeLegalLocale(queryLocale);
  }
  const acceptLanguage = req.headers['accept-language'];
  if (typeof acceptLanguage === 'string') {
    const [first] = acceptLanguage.split(',');
    return normalizeLegalLocale(first);
  }
  return 'es';
};

// Default content for legal pages
const defaultLegalContent: Record<string, { title: string; content: string }> = {
  privacy: {
    title: 'Política de Privacidad',
    content: `
      <h2>1. Información que Recopilamos</h2>
      <p>Recopilamos información que nos proporcionas directamente, como tu nombre, dirección de correo electrónico y cualquier archivo que subas a nuestro servicio.</p>
      
      <h2>2. Uso de la Información</h2>
      <p>Utilizamos la información recopilada para:</p>
      <ul>
        <li>Proporcionar, mantener y mejorar nuestros servicios</li>
        <li>Enviarte notificaciones técnicas y actualizaciones</li>
        <li>Responder a tus comentarios y preguntas</li>
        <li>Proteger contra actividades fraudulentas o ilegales</li>
      </ul>
      
      <h2>3. Almacenamiento de Datos</h2>
      <p>Tus archivos se almacenan de forma segura en nuestros servidores. Implementamos medidas de seguridad técnicas y organizativas para proteger tus datos.</p>
      
      <h2>4. Compartir Información</h2>
      <p>No vendemos ni compartimos tu información personal con terceros, excepto cuando sea necesario para proporcionar nuestros servicios o cuando lo exija la ley.</p>
      
      <h2>5. Tus Derechos</h2>
      <p>Tienes derecho a acceder, corregir o eliminar tu información personal. Puedes hacerlo desde la configuración de tu cuenta o contactándonos directamente.</p>
      
      <h2>6. Cookies</h2>
      <p>Utilizamos cookies esenciales para el funcionamiento del servicio. No utilizamos cookies de seguimiento de terceros.</p>
      
      <h2>7. Cambios a esta Política</h2>
      <p>Podemos actualizar esta política ocasionalmente. Te notificaremos sobre cualquier cambio importante.</p>
      
      <h2>8. Contacto</h2>
      <p>Si tienes preguntas sobre esta política de privacidad, contáctanos a través del correo electrónico de soporte.</p>
    `,
  },
  terms: {
    title: 'Términos de Servicio',
    content: `
      <h2>1. Aceptación de los Términos</h2>
      <p>Al acceder y utilizar este servicio, aceptas estar sujeto a estos términos de servicio. Si no estás de acuerdo con alguna parte de estos términos, no podrás acceder al servicio.</p>
      
      <h2>2. Descripción del Servicio</h2>
      <p>CloudBox es un servicio de almacenamiento en la nube que permite a los usuarios subir, almacenar, organizar y compartir archivos.</p>
      
      <h2>3. Cuentas de Usuario</h2>
      <p>Para utilizar ciertas funciones del servicio, debes crear una cuenta. Eres responsable de:</p>
      <ul>
        <li>Mantener la confidencialidad de tu contraseña</li>
        <li>Todas las actividades que ocurran bajo tu cuenta</li>
        <li>Notificarnos inmediatamente sobre cualquier uso no autorizado</li>
      </ul>
      
      <h2>4. Uso Aceptable</h2>
      <p>Te comprometes a no utilizar el servicio para:</p>
      <ul>
        <li>Subir contenido ilegal, ofensivo o que infrinja derechos de terceros</li>
        <li>Distribuir malware o software dañino</li>
        <li>Intentar acceder a cuentas de otros usuarios</li>
        <li>Sobrecargar o interferir con el funcionamiento del servicio</li>
      </ul>
      
      <h2>5. Contenido del Usuario</h2>
      <p>Conservas todos los derechos sobre el contenido que subes. Al subir contenido, nos otorgas una licencia limitada para almacenar y mostrar ese contenido según sea necesario para proporcionar el servicio.</p>
      
      <h2>6. Limitación de Responsabilidad</h2>
      <p>El servicio se proporciona "tal cual" sin garantías de ningún tipo. No seremos responsables por la pérdida de datos o cualquier daño indirecto derivado del uso del servicio.</p>
      
      <h2>7. Terminación</h2>
      <p>Podemos suspender o terminar tu acceso al servicio en cualquier momento por violación de estos términos. Puedes eliminar tu cuenta en cualquier momento desde la configuración.</p>
      
      <h2>8. Modificaciones</h2>
      <p>Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor inmediatamente después de su publicación.</p>
      
      <h2>9. Ley Aplicable</h2>
      <p>Estos términos se regirán e interpretarán de acuerdo con las leyes aplicables en tu jurisdicción.</p>
      
      <h2>10. Contacto</h2>
      <p>Para cualquier pregunta sobre estos términos, contáctanos a través del correo electrónico de soporte.</p>
    `,
  },
};

const defaultLegalContentByLocale: Record<string, Record<LegalLocale, { title: string; content: string }>> = {
  privacy: {
    es: defaultLegalContent.privacy,
    en: {
      title: 'Privacy Policy',
      content: `
      <h2>1. Information We Collect</h2>
      <p>We collect information you provide directly, such as your name, email address, and any files you upload to our service.</p>
      
      <h2>2. How We Use Information</h2>
      <p>We use collected information to:</p>
      <ul>
        <li>Provide, maintain, and improve our services</li>
        <li>Send technical notices and updates</li>
        <li>Respond to your comments and questions</li>
        <li>Protect against fraudulent or illegal activity</li>
      </ul>
      
      <h2>3. Data Storage</h2>
      <p>Your files are stored securely on our servers. We implement technical and organizational safeguards to protect your data.</p>
      
      <h2>4. Sharing Information</h2>
      <p>We do not sell or share your personal information with third parties, except as necessary to provide our services or when required by law.</p>
      
      <h2>5. Your Rights</h2>
      <p>You have the right to access, correct, or delete your personal information. You can do so from your account settings or by contacting us directly.</p>
      
      <h2>6. Cookies</h2>
      <p>We use essential cookies for the service to operate. We do not use third-party tracking cookies.</p>
      
      <h2>7. Changes to this Policy</h2>
      <p>We may update this policy occasionally. We will notify you about any material changes.</p>
      
      <h2>8. Contact</h2>
      <p>If you have questions about this privacy policy, contact us via our support email.</p>
    `,
    },
  },
  terms: {
    es: defaultLegalContent.terms,
    en: {
      title: 'Terms of Service',
      content: `
      <h2>1. Acceptance of Terms</h2>
      <p>By accessing and using this service, you agree to be bound by these terms of service. If you do not agree with any part, you may not access the service.</p>
      
      <h2>2. Service Description</h2>
      <p>CloudBox is a cloud storage service that allows users to upload, store, organize, and share files.</p>
      
      <h2>3. User Accounts</h2>
      <p>To use certain features, you must create an account. You are responsible for:</p>
      <ul>
        <li>Keeping your password confidential</li>
        <li>All activity that occurs under your account</li>
        <li>Notifying us immediately about any unauthorized use</li>
      </ul>
      
      <h2>4. Acceptable Use</h2>
      <p>You agree not to use the service to:</p>
      <ul>
        <li>Upload illegal or infringing content</li>
        <li>Distribute malware or harmful software</li>
        <li>Attempt to access other users' accounts</li>
        <li>Overload or interfere with service operations</li>
      </ul>
      
      <h2>5. User Content</h2>
      <p>You retain all rights to the content you upload. By uploading content, you grant us a limited license to store and display that content as necessary to provide the service.</p>
      
      <h2>6. Limitation of Liability</h2>
      <p>The service is provided "as is" without warranties of any kind. We are not liable for data loss or any indirect damages arising from use of the service.</p>
      
      <h2>7. Termination</h2>
      <p>We may suspend or terminate your access at any time for violations of these terms. You can delete your account at any time from settings.</p>
      
      <h2>8. Modifications</h2>
      <p>We reserve the right to modify these terms at any time. Changes take effect immediately upon publication.</p>
      
      <h2>9. Governing Law</h2>
      <p>These terms are governed by and construed in accordance with applicable laws in your jurisdiction.</p>
      
      <h2>10. Contact</h2>
      <p>For any questions about these terms, contact us via our support email.</p>
    `,
    },
  },
};

const getDefaultLegalContent = (slug: string, locale: LegalLocale) => {
  const bySlug = defaultLegalContentByLocale[slug];
  if (!bySlug) {
    return { title: '', content: '' };
  }
  return bySlug[locale] ?? bySlug.en;
};

// Get legal page (Public)
router.get('/legal/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    if (!['privacy', 'terms'].includes(slug)) {
      res.status(400).json({ error: 'Invalid page slug' });
      return;
    }

    const locale = getLegalLocale(req);
    const page = await prisma.legalPage.findUnique({
      where: { slug_locale: { slug, locale } },
    });

    if (page && page.isActive) {
      res.json(page);
    } else {
      // Return default content
      const defaultContent = getDefaultLegalContent(slug, locale);
      res.json({
        slug,
        locale,
        title: defaultContent.title,
        content: defaultContent.content,
        isActive: true,
        isDefault: true,
      });
    }
  } catch (error) {
    console.error('Get legal page error:', error);
    res.status(500).json({ error: 'Failed to get legal page' });
  }
});

// Get all legal pages (Admin)
router.get('/legal', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const locale = getLegalLocale(req);
    const pages = await prisma.legalPage.findMany({
      where: { locale },
      orderBy: { slug: 'asc' },
    });

    // Merge with defaults
    const result = ['privacy', 'terms'].map(slug => {
      const existing = pages.find(p => p.slug === slug);
      if (existing) {
        return existing;
      }
      const defaultContent = getDefaultLegalContent(slug, locale);
      return {
        slug,
        locale,
        title: defaultContent.title,
        content: defaultContent.content,
        isActive: true,
        isDefault: true,
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Get legal pages error:', error);
    res.status(500).json({ error: 'Failed to get legal pages' });
  }
});

// Update legal page (Admin)
router.put('/legal/:slug', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { title, content, isActive } = req.body;
    const locale = normalizeLegalLocale(req.body?.locale ?? req.query.locale);

    if (!['privacy', 'terms'].includes(slug)) {
      res.status(400).json({ error: 'Invalid page slug' });
      return;
    }

    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required' });
      return;
    }

    const page = await prisma.legalPage.upsert({
      where: { slug_locale: { slug, locale } },
      update: {
        title,
        content,
        isActive: isActive ?? true,
      },
      create: {
        slug,
        locale,
        title,
        content,
        isActive: isActive ?? true,
      },
    });

    res.json(page);
  } catch (error) {
    console.error('Update legal page error:', error);
    res.status(500).json({ error: 'Failed to update legal page' });
  }
});

// Reset legal page to default (Admin)
router.delete('/legal/:slug', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const locale = getLegalLocale(req);

    if (!['privacy', 'terms'].includes(slug)) {
      res.status(400).json({ error: 'Invalid page slug' });
      return;
    }

    await prisma.legalPage.deleteMany({
      where: { slug, locale },
    });

    const defaultContent = getDefaultLegalContent(slug, locale);
    res.json({
      message: 'Legal page reset to default',
      ...defaultContent,
      slug,
      locale,
      isActive: true,
      isDefault: true,
    });
  } catch (error) {
    console.error('Reset legal page error:', error);
    res.status(500).json({ error: 'Failed to reset legal page' });
  }
});

// ========== Queue Management ==========

// Get detailed queue statistics
router.get('/queues/stats', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getDetailedQueueStats } = await import('../lib/transcodingQueue.js');
    const stats = await getDetailedQueueStats();
    res.json(stats);
  } catch (error) {
    console.error('Get queue stats error:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// Retry all failed jobs
router.post('/queues/retry-failed', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { retryAllFailedJobs } = await import('../lib/transcodingQueue.js');
    const count = await retryAllFailedJobs();
    res.json({ success: true, message: `Retried ${count} failed jobs`, count });
  } catch (error) {
    console.error('Retry failed jobs error:', error);
    res.status(500).json({ error: 'Failed to retry jobs' });
  }
});

// Clear stalled jobs
router.post('/queues/clear-stalled', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { clearStalledJobs } = await import('../lib/transcodingQueue.js');
    const count = await clearStalledJobs();
    res.json({ success: true, message: `Cleared ${count} stalled jobs`, count });
  } catch (error) {
    console.error('Clear stalled jobs error:', error);
    res.status(500).json({ error: 'Failed to clear stalled jobs' });
  }
});

// Cleanup failed jobs (remove without retry)
router.post('/queues/cleanup', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { cleanupAllFailedJobs, cleanupOldJobs } = await import('../lib/transcodingQueue.js');
    const [failedCount, oldCount] = await Promise.all([
      cleanupAllFailedJobs(),
      cleanupOldJobs(7),
    ]);
    res.json({
      success: true,
      message: `Cleaned up ${failedCount} failed jobs and ${oldCount} old jobs`,
      failedCount,
      oldCount,
    });
  } catch (error) {
    console.error('Cleanup jobs error:', error);
    res.status(500).json({ error: 'Failed to cleanup jobs' });
  }
});

// Cancel all pending jobs
router.post('/queues/cancel-pending', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await prisma.transcodingJob.updateMany({
      where: { status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    res.json({
      success: true,
      message: `Cancelled ${result.count} pending jobs`,
      count: result.count,
    });
  } catch (error) {
    console.error('Cancel pending jobs error:', error);
    res.status(500).json({ error: 'Failed to cancel pending jobs' });
  }
});

export default router;
