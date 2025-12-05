import { useCallback, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Progress from '../ui/Progress';
import { Upload, X, File, CheckCircle, XCircle, AlertTriangle, Zap } from 'lucide-react';
import { formatBytes, cn } from '../../lib/utils';
import { toast } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';
import {
  uploadFile as chunkedUploadFile,
  validateFiles,
  UPLOAD_CONFIG,
  formatSpeed,
  estimateRemainingTime,
  type UploadProgress,
} from '../../lib/chunkedUpload';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  folderId?: string | null;
}

interface FileUpload {
  id: string;
  file: File;
  progress: number;
  speed: number;
  status: 'pending' | 'validating' | 'uploading' | 'completed' | 'error';
  error?: string;
  errorCode?: string;
  chunksTotal?: number;
  chunksUploaded?: number;
}

export default function UploadModal({
  isOpen,
  onClose,
  onSuccess,
  folderId: propFolderId,
}: UploadModalProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Map<string, { error: string; errorCode?: string }>>(new Map());
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuthStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  // User quota info for validation
  const userQuota = useMemo(() => ({
    storageUsed: Number(user?.storageUsed || 0),
    storageQuota: Number(user?.storageQuota || 0),
    maxFileSize: Number(user?.maxFileSize || 100 * 1024 * 1024),
  }), [user]);

  const getCurrentFolderId = () => {
    if (propFolderId !== undefined) return propFolderId || null;
    const folderId = searchParams.get('folder');
    return folderId || null;
  };

  // Pre-validate files on drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Validate files before adding
    const validation = validateFiles(acceptedFiles, userQuota);
    
    // Set validation errors
    setValidationErrors(new Map(
      Array.from(validation.errors.entries()).map(([name, result]) => [
        name,
        { error: result.error || 'Invalid file', errorCode: result.errorCode }
      ])
    ));

    // Add files (including invalid ones, but mark them)
    const newFiles: FileUpload[] = acceptedFiles.map((file) => {
      const error = validation.errors.get(file.name);
      return {
        id: Math.random().toString(36).substring(7),
        file,
        progress: 0,
        speed: 0,
        status: error ? 'error' : 'pending',
        error: error?.error,
        errorCode: error?.errorCode,
      };
    });
    
    setFiles((prev) => [...prev, ...newFiles]);
  }, [userQuota]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Handle progress updates from chunked upload
  const handleProgress = useCallback((fileId: string, progress: UploadProgress) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              progress: progress.progress,
              speed: progress.speed,
              status: progress.status === 'cancelled' ? 'error' : progress.status,
              error: progress.error,
              errorCode: progress.errorCode,
              chunksTotal: progress.chunksTotal,
              chunksUploaded: progress.chunksUploaded,
            }
          : f
      )
    );
  }, []);

  // Upload files in parallel with concurrency limit
  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    abortControllerRef.current = new AbortController();
    
    const pendingFiles = files.filter((f) => f.status === 'pending');
    const folderId = getCurrentFolderId();

    // Parallel upload with concurrency control
    const executing: Promise<void>[] = [];
    const queue = [...pendingFiles];

    while (queue.length > 0 || executing.length > 0) {
      // Check if cancelled
      if (abortControllerRef.current?.signal.aborted) {
        break;
      }

      // Start new uploads up to concurrency limit
      while (executing.length < UPLOAD_CONFIG.MAX_CONCURRENT_FILES && queue.length > 0) {
        const fileUpload = queue.shift()!;
        
        const promise = chunkedUploadFile(
          fileUpload.file,
          folderId,
          (progress) => handleProgress(fileUpload.id, progress),
          abortControllerRef.current?.signal
        ).then(() => {
          executing.splice(executing.indexOf(promise), 1);
        }).catch(() => {
          executing.splice(executing.indexOf(promise), 1);
        });

        executing.push(promise);
      }

      // Wait for at least one to complete
      if (executing.length > 0) {
        await Promise.race(executing);
      }
    }

    setIsUploading(false);
    abortControllerRef.current = null;
    
    const hasErrors = files.some((f) => f.status === 'error');
    const completedCount = files.filter((f) => f.status === 'completed').length;
    
    if (completedCount > 0) {
      toast(t('modals.upload.allFilesUploaded'), 'success');
      onSuccess?.();
      refreshUser(); // Update storage info in sidebar
    } else if (hasErrors) {
      toast(t('modals.upload.someFilesFailed'), 'error');
    }
  };

  // Cancel upload
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsUploading(false);
  };

  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      setValidationErrors(new Map());
      onClose();
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const completedCount = files.filter((f) => f.status === 'completed').length;
  const uploadingCount = files.filter((f) => f.status === 'uploading').length;

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    const uploadingFiles = files.filter((f) => f.status === 'uploading' || f.status === 'completed');
    if (uploadingFiles.length === 0) return 0;
    const totalProgress = uploadingFiles.reduce((sum, f) => sum + f.progress, 0);
    return Math.round(totalProgress / uploadingFiles.length);
  }, [files]);

  // Calculate overall speed
  const overallSpeed = useMemo(() => {
    const uploadingFiles = files.filter((f) => f.status === 'uploading');
    return uploadingFiles.reduce((sum, f) => sum + f.speed, 0);
  }, [files]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('modals.upload.title')}
      size="lg"
    >
      {/* Validation warning for combined quota */}
      {validationErrors.has('_combined') && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {t('modals.upload.quotaWarning')}
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              {validationErrors.get('_combined')?.error}
            </p>
          </div>
        </div>
      )}

      {/* Upload speed indicator when uploading */}
      {isUploading && uploadingCount > 0 && (
        <div className="mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-medium text-primary-800 dark:text-primary-200">
                {t('modals.upload.uploading')} ({uploadingCount} {t('modals.upload.active')})
              </span>
            </div>
            <span className="text-sm text-primary-600 dark:text-primary-400">
              {formatSpeed(overallSpeed)}
            </span>
          </div>
          <Progress value={overallProgress} size="sm" />
          <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
            {overallProgress}% - {completedCount}/{files.length} {t('modals.upload.filesCompleted')}
          </p>
        </div>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
            : 'border-dark-300 dark:border-dark-600 hover:border-primary-500'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto text-dark-400 mb-4" />
        <p className="text-dark-600 dark:text-dark-400">
          {isDragActive
            ? t('modals.upload.dropHere')
            : t('modals.upload.dragOrClick')}
        </p>
        <p className="text-sm text-dark-500 mt-2">{t('modals.upload.maxSize')}</p>
        <p className="text-xs text-dark-400 mt-1">
          {t('modals.upload.parallelInfo', { 
            files: UPLOAD_CONFIG.MAX_CONCURRENT_FILES,
            chunks: UPLOAD_CONFIG.MAX_CONCURRENT_CHUNKS 
          })}
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-6 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-dark-700 dark:text-dark-300">
              {t('modals.upload.filesSelected', { count: files.length })}
            </p>
            {completedCount > 0 && (
              <p className="text-sm text-green-600">
                {t('modals.upload.completed', { count: completedCount })}
              </p>
            )}
          </div>
          <div className="space-y-2">
            {files.map((fileUpload) => (
              <div
                key={fileUpload.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg',
                  fileUpload.status === 'error' 
                    ? 'bg-red-50 dark:bg-red-900/20' 
                    : 'bg-dark-50 dark:bg-dark-700'
                )}
              >
                <File className="w-8 h-8 text-dark-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark-900 dark:text-white truncate">
                    {fileUpload.file.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-dark-500">
                    <span>{formatBytes(fileUpload.file.size)}</span>
                    {fileUpload.status === 'uploading' && fileUpload.speed > 0 && (
                      <>
                        <span>•</span>
                        <span>{formatSpeed(fileUpload.speed)}</span>
                      </>
                    )}
                    {fileUpload.chunksTotal && fileUpload.chunksTotal > 1 && (
                      <>
                        <span>•</span>
                        <span>
                          {t('modals.upload.chunks', { 
                            uploaded: fileUpload.chunksUploaded || 0, 
                            total: fileUpload.chunksTotal 
                          })}
                        </span>
                      </>
                    )}
                  </div>
                  {fileUpload.status === 'uploading' && (
                    <Progress value={fileUpload.progress} size="sm" className="mt-2" />
                  )}
                  {fileUpload.status === 'error' && (
                    <p className="text-xs text-red-600 mt-1">
                      {fileUpload.error}
                    </p>
                  )}
                </div>
                {fileUpload.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : fileUpload.status === 'error' ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : fileUpload.status === 'pending' ? (
                  <button
                    onClick={() => removeFile(fileUpload.id)}
                    className="p-1 text-dark-400 hover:text-dark-600 dark:hover:text-dark-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 mt-6">
        {isUploading ? (
          <Button variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
        ) : (
          <Button variant="ghost" onClick={handleClose}>
            {completedCount === files.length && files.length > 0 ? t('modals.upload.done') : t('common.cancel')}
          </Button>
        )}
        {pendingCount > 0 && !isUploading && (
          <Button onClick={handleUpload}>
            {t('modals.upload.uploadFiles', { count: pendingCount })}
          </Button>
        )}
      </div>
    </Modal>
  );
}
