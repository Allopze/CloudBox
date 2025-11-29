import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { uploadAvatar } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchema, updateProfileSchema } from '../schemas/index.js';
import { getAvatarPath, deleteFile, fileExists } from '../lib/storage.js';
import { processAvatar } from '../lib/thumbnail.js';
import { deleteDirectory, getStoragePath } from '../lib/storage.js';

const router = Router();

// Get current user
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        emailVerified: true,
        storageQuota: true,
        storageUsed: true,
        createdAt: true,
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
    });
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
      const existingUser = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
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
        ...(email && { email, emailVerified: false }),
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
      },
    });

    res.json({
      ...user,
      storageQuota: user.storageQuota.toString(),
      storageUsed: user.storageUsed.toString(),
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

export default router;
