import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { getStoragePath } from '../lib/storage.js';

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
    fileSize: 10 * 1024 * 1024, // 10MB per chunk
  },
});
