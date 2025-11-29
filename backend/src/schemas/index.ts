import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const googleAuthSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Google token is required'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

export const verifyEmailSchema = z.object({
  params: z.object({
    token: z.string().min(1, 'Verification token is required'),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    email: z.string().email('Invalid email address').optional(),
  }),
});

export const createFolderSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Folder name is required').max(255),
    parentId: z.string().uuid().optional().nullable(),
    color: z.string().optional(),
    category: z.string().optional(),
  }),
});

export const updateFolderSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    color: z.string().optional(),
    category: z.string().optional(),
  }),
});

export const moveFolderSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    parentId: z.string().uuid().nullable(),
  }),
});

export const renameFileSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1, 'File name is required').max(255),
  }),
});

export const moveFileSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    folderId: z.string().uuid().nullable(),
  }),
});

export const createShareSchema = z.object({
  body: z.object({
    fileId: z.string().uuid().optional(),
    folderId: z.string().uuid().optional(),
    type: z.enum(['PRIVATE', 'PUBLIC']),
    password: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
    downloadLimit: z.number().int().positive().optional(),
  }),
});

export const addCollaboratorSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    email: z.string().email(),
    permission: z.enum(['VIEWER', 'EDITOR']),
  }),
});

export const createAlbumSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Album name is required').max(255),
    color: z.string().optional(),
  }),
});

export const updateAlbumSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    color: z.string().optional().nullable(),
  }),
});

export const albumFilesSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    fileIds: z.array(z.string().uuid()),
  }),
});

export const compressionSchema = z.object({
  body: z.object({
    paths: z.array(z.string()),
    format: z.enum(['zip', '7z', 'tar']).default('zip'),
    outputName: z.string().optional(),
  }),
});

export const decompressSchema = z.object({
  body: z.object({
    fileId: z.string().uuid(),
    targetFolderId: z.string().uuid().optional(),
  }),
});

export const adminUserSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    role: z.enum(['ADMIN', 'USER']).optional(),
    storageQuota: z.union([z.string(), z.number()]).optional(),
    maxFileSize: z.union([z.string(), z.number()]).optional(),
  }),
});

export const smtpConfigSchema = z.object({
  body: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    secure: z.boolean(),
    user: z.string(),
    pass: z.string(),
    from: z.string(),
  }),
});

export const emailTemplateSchema = z.object({
  params: z.object({
    name: z.string(),
  }),
  body: z.object({
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
});

export const publicLinkPasswordSchema = z.object({
  body: z.object({
    password: z.string().min(1),
  }),
});
