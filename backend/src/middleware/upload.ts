import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { getStoragePath } from '../lib/storage.js';

// Helper to decode filename properly from various encodings
export function decodeFilename(filename: string): string {
  try {
    // First, try to decode URI-encoded characters (e.g., %C3%B3 for ó)
    if (filename.includes('%')) {
      try {
        const decoded = decodeURIComponent(filename);
        // If successfully decoded and contains non-ASCII, return it
        if (/[^\x00-\x7F]/.test(decoded)) {
          return decoded;
        }
      } catch {
        // Continue to other methods
      }
    }

    // Check if already valid UTF-8
    if (/[^\x00-\x7F]/.test(filename)) {
      // Test if it looks like valid UTF-8 by checking for common patterns
      const hasValidUtf8 = /[\u00C0-\u00FF]/.test(filename);
      if (hasValidUtf8) {
        return filename;
      }
    }

    // Try to convert from Latin-1 interpreted bytes back to UTF-8
    const decoded = Buffer.from(filename, 'latin1').toString('utf8');

    // Verify the decoded string doesn't contain replacement characters
    if (!decoded.includes('\uFFFD') && /[^\x00-\x7F]/.test(decoded)) {
      return decoded;
    }

    return filename;
  } catch {
    return filename;
  }
}

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getStoragePath('temp'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getStoragePath('temp'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${uuidv4()}${ext}`);
  },
});

const brandingStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getStoragePath('temp'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `branding_${uuidv4()}${ext}`);
  },
});

const imageFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

export const uploadFile = multer({
  storage: fileStorage,
  limits: {
    fileSize: config.storage.maxFileSize,
    fields: 200, // Allow many path fields for folder uploads
    fieldSize: 10 * 1024 * 1024, // 10MB for path strings
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: imageFilter,
});

export const uploadBranding = multer({
  storage: brandingStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: imageFilter,
});

export const uploadChunk = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, getStoragePath('chunks'));
    },
    filename: (req, file, cb) => {
      const { uploadId, chunkIndex } = req.body;
      cb(null, `${uploadId}_${chunkIndex}`);
    },
  }),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB per chunk
  },
});
