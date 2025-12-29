import { z } from 'zod';
import { config } from '../config/index.js';

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
    icon: z.string().max(50).optional().nullable(),
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
    icon: z.string().max(50).optional().nullable(),
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

// ============================================================
// Pagination Schema - Validation for paginated endpoints
// ============================================================

export const PAGINATION_LIMITS = {
  MIN_PAGE: 1,
  MAX_PAGE: 10000,
  MIN_LIMIT: 1,
  MAX_LIMIT: 100, // Maximum items per page to prevent DoS
  DEFAULT_LIMIT: 20,
} as const;

export const paginationSchema = z.object({
  query: z.object({
    page: z.string()
      .optional()
      .default('1')
      .transform(val => parseInt(val, 10))
      .refine(val => !isNaN(val) && val >= PAGINATION_LIMITS.MIN_PAGE && val <= PAGINATION_LIMITS.MAX_PAGE, {
        message: `Page must be between ${PAGINATION_LIMITS.MIN_PAGE} and ${PAGINATION_LIMITS.MAX_PAGE}`,
      }),
    limit: z.string()
      .optional()
      .default(String(PAGINATION_LIMITS.DEFAULT_LIMIT))
      .transform(val => parseInt(val, 10))
      .refine(val => !isNaN(val) && val >= PAGINATION_LIMITS.MIN_LIMIT && val <= PAGINATION_LIMITS.MAX_LIMIT, {
        message: `Limit must be between ${PAGINATION_LIMITS.MIN_LIMIT} and ${PAGINATION_LIMITS.MAX_LIMIT}`,
      }),
    search: z.string().max(255).optional(),
  }),
});

// Type export for pagination
export type PaginationQuery = {
  page: number;
  limit: number;
  search?: string;
};

export const smtpConfigSchema = z.object({
  body: z.object({
    host: z.string().min(1, 'SMTP host is required'),
    port: z.coerce.number().int().positive().default(587),
    secure: z.coerce.boolean().default(false),
    user: z.string().optional().default(''),
    pass: z.string().optional(),
    from: z.string().optional().default(''),
  }),
});

// Schema for PUT /settings/smtp (UI settings endpoint)
export const smtpSettingsSchema = z.object({
  body: z.object({
    host: z.string().min(1, 'SMTP host is required'),
    port: z.coerce.number().int().positive().default(587),
    secure: z.coerce.boolean().default(false),
    user: z.string().min(1, 'SMTP user is required'),
    password: z.string().optional(),
    fromName: z.string().max(100).default('CloudBox'),
    fromEmail: z.string().email('Invalid sender email address').optional().or(z.literal('')),
  }),
});

// Schema for POST /settings/smtp/test
export const smtpTestSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid recipient email address'),
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

// ============================================================
// Landing Page Settings - Validation
// ============================================================

const safeHrefSchema = z.string()
  .trim()
  .max(2048)
  .refine((value) => {
    const lower = value.toLowerCase();
    if (!value) return false;
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
      return false;
    }
    return (
      value.startsWith('/') ||
      value.startsWith('#') ||
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('mailto:')
    );
  }, 'Invalid link');

const optionalSafeHrefSchema = z.union([safeHrefSchema, z.literal('')]).optional();

const landingIconSchema = z.string().trim().min(1).max(64);

const landingCardSchema = z.object({
  id: z.string().trim().min(1).max(64),
  icon: landingIconSchema,
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(800),
}).passthrough();

const landingStepSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(800),
}).passthrough();

const landingLinkSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  href: safeHrefSchema,
}).passthrough();

const landingFeatureItemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  icon: landingIconSchema,
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(800),
}).passthrough();

const landingFeatureGroupSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(800).optional(),
  items: z.array(landingFeatureItemSchema).min(1).max(20),
}).passthrough();

const landingComparisonRowSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  cloud: z.string().trim().min(1).max(240),
  selfHosted: z.string().trim().min(1).max(240),
}).passthrough();

const landingFaqItemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(1200),
}).passthrough();

export const landingConfigSchema = z.object({
  version: z.literal(1),
  links: z.object({
    cloudUrl: safeHrefSchema,
    appUrl: safeHrefSchema,
    githubUrl: safeHrefSchema,
    docsUrl: optionalSafeHrefSchema,
    supportUrl: optionalSafeHrefSchema,
  }).passthrough(),
  assets: z.object({
    heroImageUrl: optionalSafeHrefSchema,
    featureImageUrl: optionalSafeHrefSchema,
  }).passthrough().optional(),
  sections: z.object({
    hero: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(140),
      subtitle: z.string().trim().min(1).max(800),
      primaryCta: z.object({
        label: z.string().trim().min(1).max(60),
        href: safeHrefSchema,
      }).passthrough(),
      secondaryCta: z.object({
        label: z.string().trim().min(1).max(60),
        href: safeHrefSchema,
      }).passthrough(),
    }).passthrough(),
    benefits: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(140),
      items: z.array(landingCardSchema).min(3).max(12),
    }).passthrough(),
    howItWorks: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(140),
      cloud: z.object({
        title: z.string().trim().min(1).max(140),
        steps: z.array(landingStepSchema).min(3).max(8),
      }).passthrough(),
      selfHosted: z.object({
        title: z.string().trim().min(1).max(140),
        steps: z.array(landingStepSchema).min(3).max(10),
      }).passthrough(),
    }).passthrough(),
    features: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(140),
      groups: z.array(landingFeatureGroupSchema).min(2).max(12),
    }).passthrough(),
    comparison: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(140),
      cloud: z.object({
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(400),
        bullets: z.array(z.string().trim().min(1).max(140)).min(2).max(10),
      }).passthrough(),
      selfHosted: z.object({
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(400),
        bullets: z.array(z.string().trim().min(1).max(140)).min(2).max(10),
      }).passthrough(),
      rows: z.array(landingComparisonRowSchema).min(3).max(12),
    }).passthrough(),
    security: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(140),
      body: z.string().trim().min(1).max(1200),
      points: z.array(z.string().trim().min(1).max(200)).min(2).max(10),
    }).passthrough(),
    github: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(140),
      body: z.string().trim().min(1).max(1200),
      ctaLabel: z.string().trim().min(1).max(80),
      requirements: z.array(z.string().trim().min(1).max(200)).min(2).max(10),
    }).passthrough(),
    useCases: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(140),
      items: z.array(landingCardSchema).min(2).max(12),
    }).passthrough(),
    faq: z.object({
      enabled: z.boolean(),
      title: z.string().trim().min(1).max(140),
      items: z.array(landingFaqItemSchema).min(3).max(24),
    }).passthrough(),
    footer: z.object({
      enabled: z.boolean(),
      tagline: z.string().trim().min(1).max(200),
      groups: z.array(z.object({
        id: z.string().trim().min(1).max(64),
        title: z.string().trim().min(1).max(80),
        links: z.array(landingLinkSchema).min(1).max(12),
      }).passthrough()).min(2).max(6),
      finePrint: z.string().trim().min(1).max(240).optional(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export const landingSettingsSchema = z.object({
  body: landingConfigSchema,
});

// ============================================================
// Upload Schemas - Validation for file upload endpoints
// ============================================================

// Common constants for upload validation
export const UPLOAD_LIMITS = {
  MAX_FILES_PER_REQUEST: config.limits.maxFilesPerRequest,
  MAX_FILES_FOLDER_UPLOAD: config.limits.maxFilesFolderUpload,
  MAX_TOTAL_CHUNKS: config.limits.maxTotalChunks,
  MAX_CHUNK_SIZE: config.limits.maxChunkSize, // Hard cap enforced by server
  MAX_FILENAME_LENGTH: 255,
  ALLOWED_MIME_PATTERNS: [
    'image/*', 'video/*', 'audio/*', 'text/*',
    'application/pdf', 'application/zip', 'application/json',
    'application/msword', 'application/vnd.openxmlformats-officedocument.*',
    'application/vnd.ms-*', 'application/x-*', 'application/octet-stream',
  ],
} as const;

// Schema for single/multiple file upload body params
export const uploadFilesSchema = z.object({
  body: z.object({
    folderId: z.string().uuid().nullable().optional(),
  }),
});

// Schema for upload with folder structure
export const uploadWithFoldersSchema = z.object({
  body: z.object({
    folderId: z.string().uuid().nullable().optional(),
    paths: z.union([
      z.string(),
      z.array(z.string().max(1024)),
    ]).optional(),
  }),
});

// Schema for chunked upload initialization
export const uploadInitSchema = z.object({
  body: z.object({
    filename: z.string()
      .min(1, 'Filename is required')
      .max(UPLOAD_LIMITS.MAX_FILENAME_LENGTH, `Filename must not exceed ${UPLOAD_LIMITS.MAX_FILENAME_LENGTH} characters`),
    relativePath: z.string().max(1024).optional(),
    totalChunks: z.number()
      .int('Total chunks must be an integer')
      .positive('Total chunks must be positive')
      .max(UPLOAD_LIMITS.MAX_TOTAL_CHUNKS, `Cannot exceed ${UPLOAD_LIMITS.MAX_TOTAL_CHUNKS} chunks`),
    totalSize: z.number()
      .int('Total size must be an integer')
      .positive('Total size must be positive'),
    folderId: z.string().uuid().nullable().optional(),
    mimeType: z.string().optional(),
  }),
});

// Schema for chunk upload
export const uploadChunkSchema = z.object({
  body: z.object({
    uploadId: z.string().uuid('Upload ID must be a valid UUID'),
    chunkIndex: z.union([z.number(), z.string()])
      .transform(val => typeof val === 'string' ? parseInt(val, 10) : val)
      .refine(val => !isNaN(val) && val >= 0, 'Chunk index must be a non-negative number'),
    totalChunks: z.union([z.number(), z.string()])
      .transform(val => typeof val === 'string' ? parseInt(val, 10) : val)
      .refine(val => !isNaN(val) && val > 0, 'Total chunks must be a positive number'),
    filename: z.string()
      .min(1, 'Filename is required')
      .max(UPLOAD_LIMITS.MAX_FILENAME_LENGTH),
    mimeType: z.string().min(1, 'MIME type is required'),
    totalSize: z.union([z.number(), z.string()])
      .transform(val => typeof val === 'string' ? parseInt(val, 10) : val)
      .refine(val => !isNaN(val) && val > 0, 'Total size must be a positive number'),
    folderId: z.string().uuid().nullable().optional(),
  }),
});

// Schema for file ID parameter validation
export const fileIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('File ID must be a valid UUID'),
  }),
});

// Schema for download/stream with optional access parameters
export const fileAccessSchema = z.object({
  params: z.object({
    id: z.string().uuid('File ID must be a valid UUID'),
  }),
  query: z.object({
    password: z.string().optional(),
    transcode: z.enum(['true', 'false']).optional(),
    sheet: z.string().optional(),
  }).optional(),
});

// Schema for Range header validation
export const rangeHeaderSchema = z.string()
  .regex(/^bytes=\d+-\d*$/, 'Invalid Range header format')
  .optional();

// Helper to validate Range header values
export function parseRangeHeader(range: string, fileSize: number): { start: number; end: number } | null {
  const match = range.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

  // Validate range values
  if (isNaN(start) || start < 0 || start >= fileSize) return null;
  if (isNaN(end) || end < start || end >= fileSize) return null;

  return { start, end };
}

// Error codes for upload operations
export const UPLOAD_ERROR_CODES = {
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  DANGEROUS_EXTENSION: 'DANGEROUS_EXTENSION',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_FOLDER: 'INVALID_FOLDER',
  INVALID_CHUNK: 'INVALID_CHUNK',
  CHUNK_MISMATCH: 'CHUNK_MISMATCH',
  UPLOAD_NOT_FOUND: 'UPLOAD_NOT_FOUND',
  MAX_FILES_EXCEEDED: 'MAX_FILES_EXCEEDED',
} as const;

// ============================================================
// Two-Factor Authentication (2FA) Schemas
// ============================================================

export const verify2FASchema = z.object({
  body: z.object({
    code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must contain only digits'),
    tempToken: z.string().optional(),  // For login flow
  }),
});

export const disable2FASchema = z.object({
  body: z.object({
    password: z.string().min(1, 'Password is required'),
    code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must contain only digits'),
  }),
});

export const recovery2FASchema = z.object({
  body: z.object({
    tempToken: z.string().min(1, 'Temporary token is required'),
    recoveryCode: z.string().min(8, 'Recovery code is required').max(20),
  }),
});

export const login2FASchema = z.object({
  body: z.object({
    tempToken: z.string().min(1, 'Temporary token is required'),
    code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must contain only digits'),
  }),
});

