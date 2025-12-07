import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { uploadBranding } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { adminUserSchema, smtpConfigSchema, emailTemplateSchema, paginationSchema, PAGINATION_LIMITS, PaginationQuery } from '../schemas/index.js';
import { resetTransporter, testSmtpConnection, sendEmail } from '../lib/email.js';
import { getBrandingPath, deleteFile, fileExists } from '../lib/storage.js';
import { encryptSecret } from '../lib/encryption.js';
import sharp from 'sharp';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';

const router = Router();

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

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (email && email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
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
        ...(email && { email }),
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

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
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

    // Security: Encrypt SMTP password before storing in database
    const encryptedPass = pass ? encryptSecret(pass) : '';

    const settings = [
      { key: 'smtp_host', value: host },
      { key: 'smtp_port', value: String(port) },
      { key: 'smtp_secure', value: String(secure) },
      { key: 'smtp_user', value: user },
      { key: 'smtp_pass', value: encryptedPass },
      { key: 'smtp_from', value: from },
    ];

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

    if (isNaN(chunkSizeNum) || chunkSizeNum < 1024 * 1024 || chunkSizeNum > 100 * 1024 * 1024) { // 1MB - 100MB
      res.status(400).json({ error: 'Chunk size must be between 1MB and 100MB' });
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
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const template = await prisma.emailTemplate.findUnique({
      where: { name },
      include: { variables: true },
    });

    let subject = 'Test Email';
    let body = '<p>Test email content</p>';

    if (template) {
      subject = template.subject;
      body = template.body;

      // Replace system variables with test values
      const systemTestValues: Record<string, string> = {
        name: 'Usuario de Prueba',
        verifyUrl: '#',
        resetUrl: '#',
        email: email,
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

    await sendEmail(email, subject, body);

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
router.get('/health', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
  }
});

// ========== Settings API ==========

// Get branding settings (Public)
router.get('/settings/branding', async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['branding_primary_color', 'branding_logo_url', 'branding_logo_light_url', 'branding_logo_dark_url', 'branding_favicon_url'] },
      },
    });

    const result: Record<string, string> = {
      primaryColor: '#FF3B3B',
      logoUrl: '',
      logoLightUrl: '',
      logoDarkUrl: '',
      faviconUrl: '',
    };

    settings.forEach((s: { key: string; value: string }) => {
      const keyMap: Record<string, string> = {
        'branding_primary_color': 'primaryColor',
        'branding_logo_url': 'logoUrl',
        'branding_logo_light_url': 'logoLightUrl',
        'branding_logo_dark_url': 'logoDarkUrl',
        'branding_favicon_url': 'faviconUrl',
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
    const { primaryColor, logoUrl, logoLightUrl, logoDarkUrl, faviconUrl } = req.body;

    const settings = [
      { key: 'branding_primary_color', value: primaryColor || '#FF3B3B' },
      { key: 'branding_logo_url', value: logoUrl || '' },
      { key: 'branding_logo_light_url', value: logoLightUrl || '' },
      { key: 'branding_logo_dark_url', value: logoDarkUrl || '' },
      { key: 'branding_favicon_url', value: faviconUrl || '' },
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
router.put('/settings/smtp', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { host, port, secure, user, password, fromName, fromEmail } = req.body;

    const settings = [
      { key: 'smtp_host', value: host || '' },
      { key: 'smtp_port', value: String(port || 587) },
      { key: 'smtp_secure', value: String(secure || false) },
      { key: 'smtp_user', value: user || '' },
      { key: 'smtp_from_name', value: fromName || 'CloudBox' },
      { key: 'smtp_from_email', value: fromEmail || '' },
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

// Test SMTP (aliased endpoint)
router.post('/settings/smtp/test', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const testEmail = email || req.user?.email;

    if (!testEmail) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    await sendEmail(testEmail, 'CloudBox Test Email', '<h1>Test Email</h1><p>This is a test email from CloudBox.</p>');
    res.json({ message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Test SMTP error:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// ========== Legal Pages ==========

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

// Get legal page (Public)
router.get('/legal/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    if (!['privacy', 'terms'].includes(slug)) {
      res.status(400).json({ error: 'Invalid page slug' });
      return;
    }

    const page = await prisma.legalPage.findUnique({
      where: { slug },
    });

    if (page && page.isActive) {
      res.json(page);
    } else {
      // Return default content
      const defaultContent = defaultLegalContent[slug];
      res.json({
        slug,
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
    const pages = await prisma.legalPage.findMany({
      orderBy: { slug: 'asc' },
    });

    // Merge with defaults
    const result = ['privacy', 'terms'].map(slug => {
      const existing = pages.find(p => p.slug === slug);
      if (existing) {
        return existing;
      }
      return {
        slug,
        title: defaultLegalContent[slug].title,
        content: defaultLegalContent[slug].content,
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

    if (!['privacy', 'terms'].includes(slug)) {
      res.status(400).json({ error: 'Invalid page slug' });
      return;
    }

    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required' });
      return;
    }

    const page = await prisma.legalPage.upsert({
      where: { slug },
      update: {
        title,
        content,
        isActive: isActive ?? true,
      },
      create: {
        slug,
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

    if (!['privacy', 'terms'].includes(slug)) {
      res.status(400).json({ error: 'Invalid page slug' });
      return;
    }

    await prisma.legalPage.delete({
      where: { slug },
    }).catch(() => { });

    res.json({
      message: 'Legal page reset to default',
      ...defaultLegalContent[slug],
      slug,
      isActive: true,
      isDefault: true,
    });
  } catch (error) {
    console.error('Reset legal page error:', error);
    res.status(500).json({ error: 'Failed to reset legal page' });
  }
});

export default router;
