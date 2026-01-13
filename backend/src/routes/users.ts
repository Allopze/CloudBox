import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { uploadAvatar } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchema, updateProfileSchema } from '../schemas/index.js';
import { getAvatarPath, deleteFile, fileExists, deleteDirectory, getStoragePath } from '../lib/storage.js';
import { processAvatar } from '../lib/thumbnail.js';
import * as cache from '../lib/cache.js';
import logger from '../lib/logger.js';

const router = Router();

// Get current user
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Try to get user from cache first
    const cachedUser = await cache.getUser(userId);
    if (cachedUser) {
      logger.debug('Cache hit for user info', { userId });
      res.json(cachedUser);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userResponse = {
      ...user,
      storageQuota: user.storageQuota.toString(),
      storageUsed: user.storageUsed.toString(),
      maxFileSize: user.maxFileSize.toString(),
    };

    // Cache the user info
    await cache.setUser(userId, userResponse);

    res.json(userResponse);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update profile
router.patch('/me', authenticate, validate(updateProfileSchema), async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body;
    const userId = req.user!.userId;

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const existingUser = await prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email: email.trim().toLowerCase(), emailVerified: false }),
      },
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
      },
    });

    // Invalidate user cache after update
    await cache.invalidateUser(userId);

    res.json({
      ...user,
      storageQuota: user.storageQuota.toString(),
      storageUsed: user.storageUsed.toString(),
      maxFileSize: user.maxFileSize.toString(),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});
// Change password
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) {
      res.status(400).json({ error: 'Cannot change password for OAuth accounts' });
      return;
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Upload avatar
router.post('/avatar', authenticate, uploadAvatar.single('avatar'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const userId = req.user!.userId;
    const avatarPath = getAvatarPath(userId);

    // Process and save avatar
    await processAvatar(req.file.path, avatarPath);

    // Delete temp file
    await deleteFile(req.file.path);

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: `/api/users/avatar/${userId}` },
    });

    res.json({ avatar: `/api/users/avatar/${userId}` });
  } catch (error) {
    console.error('Upload avatar error:', error);
    if (req.file) {
      await deleteFile(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Get avatar
router.get('/avatar/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const avatarPath = getAvatarPath(userId);

    if (await fileExists(avatarPath)) {
      res.sendFile(avatarPath);
    } else {
      res.status(404).json({ error: 'Avatar not found' });
    }
  } catch (error) {
    console.error('Get avatar error:', error);
    res.status(500).json({ error: 'Failed to get avatar' });
  }
});

// Delete avatar
router.delete('/avatar', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const avatarPath = getAvatarPath(userId);

    await deleteFile(avatarPath);

    await prisma.user.update({
      where: { id: userId },
      data: { avatar: null },
    });

    res.json({ message: 'Avatar deleted successfully' });
  } catch (error) {
    console.error('Delete avatar error:', error);
    res.status(500).json({ error: 'Failed to delete avatar' });
  }
});

// Delete account
router.delete('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify password if not OAuth user
    if (user.password) {
      if (!password) {
        res.status(400).json({ error: 'Password required' });
        return;
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        res.status(401).json({ error: 'Invalid password' });
        return;
      }
    }

    // Delete user files from storage
    const userFilesDir = getStoragePath('files', userId);
    await deleteDirectory(userFilesDir);

    // Delete avatar
    const avatarPath = getAvatarPath(userId);
    await deleteFile(avatarPath);

    // Delete user (cascade will handle related records)
    await prisma.user.delete({ where: { id: userId } });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ========== Storage Requests ==========

// Create storage request (for regular users)
router.post('/storage-request', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { requestedQuota, reason } = req.body;

    if (!requestedQuota) {
      res.status(400).json({ error: 'Requested quota is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if there's already a pending request
    const existingRequest = await prisma.storageRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });

    if (existingRequest) {
      res.status(400).json({ error: 'Ya tienes una solicitud pendiente' });
      return;
    }

    const request = await prisma.storageRequest.create({
      data: {
        userId,
        requestedQuota: BigInt(requestedQuota),
        currentQuota: user.storageQuota,
        reason: reason || null,
      },
    });

    res.status(201).json({
      id: request.id,
      requestedQuota: request.requestedQuota.toString(),
      currentQuota: request.currentQuota.toString(),
      reason: request.reason,
      status: request.status,
      createdAt: request.createdAt,
    });
  } catch (error) {
    console.error('Create storage request error:', error);
    res.status(500).json({ error: 'Failed to create storage request' });
  }
});

// Get user's storage requests
router.get('/storage-requests', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const requests = await prisma.storageRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests.map(r => ({
      ...r,
      requestedQuota: r.requestedQuota.toString(),
      currentQuota: r.currentQuota.toString(),
    })));
  } catch (error) {
    console.error('Get storage requests error:', error);
    res.status(500).json({ error: 'Failed to get storage requests' });
  }
});

// Update own storage quota (ADMIN only)
router.patch('/me/storage-quota', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { storageQuota } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Only admins can modify their own quota directly
    if (user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can modify storage quota directly' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { storageQuota: BigInt(storageQuota) },
      select: {
        id: true,
        storageQuota: true,
        storageUsed: true,
      },
    });

    res.json({
      ...updated,
      storageQuota: updated.storageQuota.toString(),
      storageUsed: updated.storageUsed.toString(),
    });
  } catch (error) {
    console.error('Update storage quota error:', error);
    res.status(500).json({ error: 'Failed to update storage quota' });
  }
});

export default router;
