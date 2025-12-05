/**
 * Chunked Upload System for CloudBox
 * 
 * Provides parallel chunk uploads for large files with:
 * - Configurable chunk size (default 10MB)
 * - Parallel chunk uploads (default 4 concurrent)
 * - Automatic retry with exponential backoff
 * - Progress tracking per chunk and overall
 * - Pre-validation before upload
 */

import { api, validateUploadFiles, UploadValidationResult } from './api';

// Configuration
export const UPLOAD_CONFIG = {
  DEFAULT_CHUNK_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_CONCURRENT_CHUNKS: 4,
  MAX_CONCURRENT_FILES: 3,
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY: 1000, // 1 second
  // Thresholds for chunked upload (files larger than this use chunking)
  CHUNKED_UPLOAD_THRESHOLD: 10 * 1024 * 1024, // 10MB
};

// Error codes matching backend
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
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

// Dangerous extensions (must match backend)
const DANGEROUS_EXTENSIONS = [
  '.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
  '.ps1', '.psm1', '.psd1', '.ps1xml', '.pssc', '.psrc',
  '.msh', '.msh1', '.msh2', '.mshxml', '.msh1xml', '.msh2xml',
  '.scf', '.lnk', '.inf', '.reg', '.hta', '.cpl', '.msc', '.jar',
  '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
  '.asp', '.aspx', '.cer', '.csr', '.jsp', '.jspx',
  '.sh', '.bash', '.zsh', '.csh', '.ksh',
  '.py', '.pyc', '.pyo', '.pyw', '.pyz', '.pyzw',
  '.pl', '.pm', '.pod', '.t', '.rb', '.rbw',
];

export interface UploadProgress {
  fileId: string;
  fileName: string;
  totalSize: number;
  uploadedSize: number;
  progress: number; // 0-100
  speed: number; // bytes per second
  status: 'pending' | 'validating' | 'uploading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  errorCode?: string;
  chunksTotal?: number;
  chunksUploaded?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

export interface UploadResult {
  success: boolean;
  file?: any;
  error?: string;
  errorCode?: string;
}

export interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  size: number;
  blob: Blob;
  uploaded: boolean;
  retries: number;
}

export type ProgressCallback = (progress: UploadProgress) => void;

/**
 * Validate a file before upload
 */
export function validateFile(
  file: File,
  userQuota: { storageUsed: number; storageQuota: number; maxFileSize: number }
): ValidationResult {
  const fileName = file.name.toLowerCase();
  const extension = fileName.substring(fileName.lastIndexOf('.'));

  // Check dangerous extensions
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `File type not allowed: ${extension}`,
      errorCode: UPLOAD_ERROR_CODES.DANGEROUS_EXTENSION,
    };
  }

  // Check file size against user's max
  if (file.size > userQuota.maxFileSize) {
    const maxSizeMB = Math.round(userQuota.maxFileSize / 1024 / 1024);
    return {
      valid: false,
      error: `File exceeds maximum size limit of ${maxSizeMB}MB`,
      errorCode: UPLOAD_ERROR_CODES.FILE_TOO_LARGE,
    };
  }

  // Check quota
  const remainingQuota = userQuota.storageQuota - userQuota.storageUsed;
  if (file.size > remainingQuota) {
    const remainingMB = Math.round(remainingQuota / 1024 / 1024);
    return {
      valid: false,
      error: `Not enough storage space. Available: ${remainingMB}MB`,
      errorCode: UPLOAD_ERROR_CODES.QUOTA_EXCEEDED,
    };
  }

  return { valid: true };
}

/**
 * Validate multiple files and check combined quota (client-side)
 */
export function validateFiles(
  files: File[],
  userQuota: { storageUsed: number; storageQuota: number; maxFileSize: number }
): { valid: boolean; errors: Map<string, ValidationResult>; totalSize: number } {
  const errors = new Map<string, ValidationResult>();
  let totalSize = 0;

  for (const file of files) {
    const result = validateFile(file, userQuota);
    if (!result.valid) {
      errors.set(file.name, result);
    }
    totalSize += file.size;
  }

  // Check combined quota
  const remainingQuota = userQuota.storageQuota - userQuota.storageUsed;
  if (totalSize > remainingQuota && errors.size === 0) {
    const totalMB = Math.round(totalSize / 1024 / 1024);
    const remainingMB = Math.round(remainingQuota / 1024 / 1024);
    errors.set('_combined', {
      valid: false,
      error: `Total upload size (${totalMB}MB) exceeds available space (${remainingMB}MB)`,
      errorCode: UPLOAD_ERROR_CODES.QUOTA_EXCEEDED,
    });
  }

  return {
    valid: errors.size === 0,
    errors,
    totalSize,
  };
}

/**
 * Validate files using server-side validation (includes latest quota info)
 */
export async function validateFilesServerSide(
  files: File[],
  folderId?: string | null
): Promise<UploadValidationResult> {
  const fileData = files.map(f => ({ name: f.name, size: f.size, type: f.type }));
  return validateUploadFiles(fileData, folderId);
}

/**
 * Split a file into chunks
 */
function createChunks(file: File, chunkSize: number = UPLOAD_CONFIG.DEFAULT_CHUNK_SIZE): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    chunks.push({
      index: i,
      start,
      end,
      size: end - start,
      blob: file.slice(start, end),
      uploaded: false,
      retries: 0,
    });
  }

  return chunks;
}

/**
 * Upload a single chunk with retry logic
 */
async function uploadChunk(
  chunk: ChunkInfo,
  uploadId: string,
  file: File,
  folderId: string | null,
  onProgress?: (chunkIndex: number, loaded: number) => void
): Promise<{ completed: boolean; file?: any }> {
  const formData = new FormData();
  formData.append('chunk', chunk.blob);
  formData.append('uploadId', uploadId);
  formData.append('chunkIndex', chunk.index.toString());
  formData.append('totalChunks', Math.ceil(file.size / UPLOAD_CONFIG.DEFAULT_CHUNK_SIZE).toString());
  formData.append('filename', file.name);
  formData.append('mimeType', file.type || 'application/octet-stream');
  formData.append('totalSize', file.size.toString());
  if (folderId) {
    formData.append('folderId', folderId);
  }

  const response = await api.post('/files/upload/chunk', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.loaded) {
        onProgress(chunk.index, progressEvent.loaded);
      }
    },
  });

  return response.data;
}

/**
 * Upload a chunk with exponential backoff retry
 */
async function uploadChunkWithRetry(
  chunk: ChunkInfo,
  uploadId: string,
  file: File,
  folderId: string | null,
  onProgress?: (chunkIndex: number, loaded: number) => void
): Promise<{ completed: boolean; file?: any }> {
  let lastError: Error | null = null;

  while (chunk.retries < UPLOAD_CONFIG.MAX_RETRIES) {
    try {
      return await uploadChunk(chunk, uploadId, file, folderId, onProgress);
    } catch (error: any) {
      lastError = error;
      chunk.retries++;

      // Don't retry on certain errors
      const errorCode = error.response?.data?.code;
      if (
        errorCode === UPLOAD_ERROR_CODES.QUOTA_EXCEEDED ||
        errorCode === UPLOAD_ERROR_CODES.DANGEROUS_EXTENSION ||
        errorCode === UPLOAD_ERROR_CODES.INVALID_FILE_TYPE ||
        error.response?.status === 401
      ) {
        throw error;
      }

      if (chunk.retries < UPLOAD_CONFIG.MAX_RETRIES) {
        // Exponential backoff
        const delay = UPLOAD_CONFIG.RETRY_BASE_DELAY * Math.pow(2, chunk.retries - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Upload failed after retries');
}

/**
 * Upload a large file using chunked upload
 */
export async function uploadFileChunked(
  file: File,
  folderId: string | null,
  onProgress: ProgressCallback,
  abortSignal?: AbortSignal
): Promise<UploadResult> {
  const fileId = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();
  let uploadedBytes = 0;
  const chunkProgress = new Map<number, number>();

  // Initial progress
  onProgress({
    fileId,
    fileName: file.name,
    totalSize: file.size,
    uploadedSize: 0,
    progress: 0,
    speed: 0,
    status: 'validating',
  });

  try {
    // Check if aborted
    if (abortSignal?.aborted) {
      throw new Error('Upload cancelled');
    }

    // Initialize chunked upload
    const initResponse = await api.post('/files/upload/init', {
      filename: file.name,
      totalChunks: Math.ceil(file.size / UPLOAD_CONFIG.DEFAULT_CHUNK_SIZE),
      totalSize: file.size,
      folderId,
      mimeType: file.type || 'application/octet-stream',
    });

    const { uploadId, totalChunks } = initResponse.data;

    // Create chunks
    const chunks = createChunks(file);

    onProgress({
      fileId,
      fileName: file.name,
      totalSize: file.size,
      uploadedSize: 0,
      progress: 0,
      speed: 0,
      status: 'uploading',
      chunksTotal: totalChunks,
      chunksUploaded: 0,
    });

    // Progress callback for chunks
    const updateProgress = (chunkIndex: number, loaded: number) => {
      chunkProgress.set(chunkIndex, loaded);
      
      // Calculate total uploaded
      let total = 0;
      for (const [idx, bytes] of chunkProgress) {
        if (chunks[idx].uploaded) {
          total += chunks[idx].size;
        } else {
          total += bytes;
        }
      }
      uploadedBytes = total;

      const elapsed = (Date.now() - startTime) / 1000;
      const speed = elapsed > 0 ? uploadedBytes / elapsed : 0;
      const progress = Math.round((uploadedBytes / file.size) * 100);
      const chunksUploaded = chunks.filter(c => c.uploaded).length;

      onProgress({
        fileId,
        fileName: file.name,
        totalSize: file.size,
        uploadedSize: uploadedBytes,
        progress,
        speed,
        status: 'uploading',
        chunksTotal: totalChunks,
        chunksUploaded,
      });
    };

    // Upload chunks in parallel with concurrency limit
    const pendingChunks = [...chunks];
    const executing: Promise<void>[] = [];
    let result: { completed: boolean; file?: any } = { completed: false };

    while (pendingChunks.length > 0 || executing.length > 0) {
      // Check if aborted
      if (abortSignal?.aborted) {
        throw new Error('Upload cancelled');
      }

      // Start new uploads up to concurrency limit
      while (executing.length < UPLOAD_CONFIG.MAX_CONCURRENT_CHUNKS && pendingChunks.length > 0) {
        const chunk = pendingChunks.shift()!;
        
        const promise = uploadChunkWithRetry(chunk, uploadId, file, folderId, updateProgress)
          .then((res) => {
            chunk.uploaded = true;
            chunkProgress.set(chunk.index, chunk.size);
            if (res.completed) {
              result = res;
            }
            executing.splice(executing.indexOf(promise), 1);
          })
          .catch((error) => {
            executing.splice(executing.indexOf(promise), 1);
            throw error;
          });

        executing.push(promise);
      }

      // Wait for at least one to complete
      if (executing.length > 0) {
        await Promise.race(executing);
      }
    }

    // Final progress
    const elapsed = (Date.now() - startTime) / 1000;
    onProgress({
      fileId,
      fileName: file.name,
      totalSize: file.size,
      uploadedSize: file.size,
      progress: 100,
      speed: elapsed > 0 ? file.size / elapsed : 0,
      status: 'completed',
      chunksTotal: totalChunks,
      chunksUploaded: totalChunks,
    });

    return {
      success: true,
      file: result.file,
    };
  } catch (error: any) {
    const errorCode = error.response?.data?.code || UPLOAD_ERROR_CODES.NETWORK_ERROR;
    const errorMessage = error.response?.data?.error || error.message || 'Upload failed';

    onProgress({
      fileId,
      fileName: file.name,
      totalSize: file.size,
      uploadedSize: uploadedBytes,
      progress: Math.round((uploadedBytes / file.size) * 100),
      speed: 0,
      status: error.message === 'Upload cancelled' ? 'cancelled' : 'error',
      error: errorMessage,
      errorCode,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  }
}

/**
 * Upload a small file directly (no chunking)
 */
export async function uploadFileDirect(
  file: File,
  folderId: string | null,
  onProgress: ProgressCallback,
  abortSignal?: AbortSignal
): Promise<UploadResult> {
  const fileId = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();

  onProgress({
    fileId,
    fileName: file.name,
    totalSize: file.size,
    uploadedSize: 0,
    progress: 0,
    speed: 0,
    status: 'uploading',
  });

  try {
    if (abortSignal?.aborted) {
      throw new Error('Upload cancelled');
    }

    const formData = new FormData();
    formData.append('files', file);
    if (folderId) {
      formData.append('folderId', folderId);
    }

    const response = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: abortSignal,
      onUploadProgress: (progressEvent) => {
        const loaded = progressEvent.loaded || 0;
        const total = progressEvent.total || file.size;
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? loaded / elapsed : 0;
        const progress = Math.round((loaded / total) * 100);

        onProgress({
          fileId,
          fileName: file.name,
          totalSize: file.size,
          uploadedSize: loaded,
          progress,
          speed,
          status: 'uploading',
        });
      },
    });

    const elapsed = (Date.now() - startTime) / 1000;
    onProgress({
      fileId,
      fileName: file.name,
      totalSize: file.size,
      uploadedSize: file.size,
      progress: 100,
      speed: elapsed > 0 ? file.size / elapsed : 0,
      status: 'completed',
    });

    return {
      success: true,
      file: response.data[0],
    };
  } catch (error: any) {
    const errorCode = error.response?.data?.code || UPLOAD_ERROR_CODES.NETWORK_ERROR;
    const errorMessage = error.response?.data?.error || error.message || 'Upload failed';

    onProgress({
      fileId,
      fileName: file.name,
      totalSize: file.size,
      uploadedSize: 0,
      progress: 0,
      speed: 0,
      status: error.message === 'Upload cancelled' ? 'cancelled' : 'error',
      error: errorMessage,
      errorCode,
    });

    return {
      success: false,
      error: errorMessage,
      errorCode,
    };
  }
}

/**
 * Smart upload - chooses chunked or direct based on file size
 */
export async function uploadFile(
  file: File,
  folderId: string | null,
  onProgress: ProgressCallback,
  abortSignal?: AbortSignal
): Promise<UploadResult> {
  if (file.size > UPLOAD_CONFIG.CHUNKED_UPLOAD_THRESHOLD) {
    return uploadFileChunked(file, folderId, onProgress, abortSignal);
  } else {
    return uploadFileDirect(file, folderId, onProgress, abortSignal);
  }
}

/**
 * Upload multiple files with concurrency control
 */
export async function uploadFiles(
  files: File[],
  folderId: string | null,
  onProgress: (fileIndex: number, progress: UploadProgress) => void,
  onFileComplete: (fileIndex: number, result: UploadResult) => void,
  abortSignal?: AbortSignal
): Promise<UploadResult[]> {
  const results: UploadResult[] = new Array(files.length).fill(null);
  const pending = files.map((file, index) => ({ file, index }));
  const executing: Promise<void>[] = [];

  while (pending.length > 0 || executing.length > 0) {
    if (abortSignal?.aborted) {
      // Mark remaining as cancelled
      for (const { index } of pending) {
        results[index] = { success: false, error: 'Upload cancelled', errorCode: 'CANCELLED' };
      }
      break;
    }

    // Start new uploads up to concurrency limit
    while (executing.length < UPLOAD_CONFIG.MAX_CONCURRENT_FILES && pending.length > 0) {
      const { file, index } = pending.shift()!;

      const promise = uploadFile(
        file,
        folderId,
        (progress) => onProgress(index, progress),
        abortSignal
      )
        .then((result) => {
          results[index] = result;
          onFileComplete(index, result);
          executing.splice(executing.indexOf(promise), 1);
        })
        .catch((error) => {
          const result: UploadResult = {
            success: false,
            error: error.message || 'Upload failed',
          };
          results[index] = result;
          onFileComplete(index, result);
          executing.splice(executing.indexOf(promise), 1);
        });

      executing.push(promise);
    }

    // Wait for at least one to complete
    if (executing.length > 0) {
      await Promise.race(executing);
    }
  }

  return results;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format speed to human readable string
 */
export function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}

/**
 * Estimate remaining time
 */
export function estimateRemainingTime(
  uploadedBytes: number,
  totalBytes: number,
  speed: number
): string {
  if (speed <= 0) return 'Calculating...';

  const remainingBytes = totalBytes - uploadedBytes;
  const remainingSeconds = remainingBytes / speed;

  if (remainingSeconds < 60) {
    return `${Math.round(remainingSeconds)}s remaining`;
  } else if (remainingSeconds < 3600) {
    return `${Math.round(remainingSeconds / 60)}m remaining`;
  } else {
    return `${Math.round(remainingSeconds / 3600)}h remaining`;
  }
}
