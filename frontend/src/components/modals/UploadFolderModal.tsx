import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useDropzone, FileWithPath } from 'react-dropzone';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Progress from '../ui/Progress';
import { Upload, FolderOpen, X, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { formatBytes, cn } from '../../lib/utils';
import { uploadFile, UPLOAD_CONFIG, ensureConfigLoaded } from '../../lib/chunkedUpload';
import { toast } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';

interface UploadFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  folderId?: string | null;
}

interface FolderUploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  relativePath: string;
}

export default function UploadFolderModal({
  isOpen,
  onClose,
  onSuccess,
  folderId: propFolderId,
}: UploadFolderModalProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FolderUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuthStore();

  const getCurrentFolderId = () => {
    if (propFolderId !== undefined) return propFolderId || undefined;
    const currentFolder = searchParams.get('folder');
    return currentFolder || undefined;
  };


  const onDrop = useCallback((acceptedFiles: FileWithPath[]) => {
    const newFiles = acceptedFiles.map((file) => {
      // react-dropzone FileWithPath has 'path' property for drag & drop
      // webkitRelativePath is for input element selection
      const relativePath = file.path || (file as any).webkitRelativePath || file.name;
      // Remove leading slash if present (from drag & drop)
      const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

      return {
        id: Math.random().toString(36).substring(2),
        file,
        progress: 0,
        status: 'pending' as const,
        relativePath: cleanPath,
      };
    });
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    useFsAccessApi: false, // Needed for folder drag & drop to work properly
  });

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    await ensureConfigLoaded();
    const pendingFiles = files.filter((file) => file.status === 'pending');
    const baseFolderId = getCurrentFolderId() || null;

    const DIRECT_UPLOAD_LIMIT = 50 * 1024 * 1024;
    const MAX_FILES_PER_BATCH = 20;
    const MAX_PARALLEL_UPLOADS = Math.max(1, Math.min(UPLOAD_CONFIG.MAX_CONCURRENT_FILES, 6));

    const directItems = pendingFiles.filter((item) => item.file.size <= DIRECT_UPLOAD_LIMIT);
    const chunkedItems = pendingFiles.filter((item) => item.file.size > DIRECT_UPLOAD_LIMIT);

    const batches: FolderUploadItem[][] = [];
    for (let i = 0; i < directItems.length; i += MAX_FILES_PER_BATCH) {
      batches.push(directItems.slice(i, i + MAX_FILES_PER_BATCH));
    }

    let hadErrors = false;

    const uploadBatch = async (batch: FolderUploadItem[]) => {
      const batchIds = new Set(batch.map((item) => item.id));
      const batchTotal = batch.reduce((sum, item) => sum + item.file.size, 0);

      setFiles((prev) =>
        prev.map((file) =>
          batchIds.has(file.id)
            ? { ...file, status: 'uploading', progress: 0, error: undefined }
            : file
        )
      );

      const formData = new FormData();
      for (const item of batch) {
        formData.append('files', item.file);
        formData.append('paths', item.relativePath);
      }
      if (baseFolderId) {
        formData.append('folderId', baseFolderId);
      }

      try {
        await api.post('/files/upload-with-folders', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const loaded = Math.min(progressEvent.loaded || 0, batchTotal);
            const progress = batchTotal > 0 ? Math.round((loaded * 100) / batchTotal) : 0;
            setFiles((prev) =>
              prev.map((file) =>
                batchIds.has(file.id)
                  ? { ...file, status: 'uploading', progress }
                  : file
              )
            );
          },
        });

        setFiles((prev) =>
          prev.map((file) =>
            batchIds.has(file.id)
              ? { ...file, status: 'completed', progress: 100 }
              : file
          )
        );
      } catch (err: any) {
        hadErrors = true;
        const message = err.response?.data?.error || t('modals.uploadFolder.uploadError');
        setFiles((prev) =>
          prev.map((file) =>
            batchIds.has(file.id)
              ? { ...file, status: 'error', error: message }
              : file
          )
        );
      }
    };

    const uploadChunked = async (item: FolderUploadItem) => {
      setFiles((prev) =>
        prev.map((file) =>
          file.id === item.id
            ? { ...file, status: 'uploading', progress: 0, error: undefined }
            : file
        )
      );

      try {
        const result = await uploadFile(
          item.file,
          baseFolderId,
          (progress) => {
            setFiles((prev) =>
              prev.map((file) =>
                file.id === item.id
                  ? { ...file, status: 'uploading', progress: progress.progress }
                  : file
              )
            );
          },
          { relativePath: item.relativePath }
        );

        if (result.success) {
          setFiles((prev) =>
            prev.map((file) =>
              file.id === item.id
                ? { ...file, status: 'completed', progress: 100 }
                : file
            )
          );
        } else {
          hadErrors = true;
          const message = result.error || t('modals.uploadFolder.uploadError');
          setFiles((prev) =>
            prev.map((file) =>
              file.id === item.id
                ? { ...file, status: 'error', error: message }
                : file
            )
          );
        }
      } catch (err: any) {
        hadErrors = true;
        const message = err.response?.data?.error || err.message || t('modals.uploadFolder.uploadError');
        setFiles((prev) =>
          prev.map((file) =>
            file.id === item.id
              ? { ...file, status: 'error', error: message }
              : file
          )
        );
      }
    };

    type UploadJob =
      | { type: 'batch'; items: FolderUploadItem[] }
      | { type: 'chunked'; item: FolderUploadItem };

    const jobs: UploadJob[] = [
      ...batches.map((items) => ({ type: 'batch' as const, items })),
      ...chunkedItems.map((item) => ({ type: 'chunked' as const, item })),
    ];

    const pendingJobs = [...jobs];
    const executing: Promise<void>[] = [];

    const startJob = (job: UploadJob) => {
      const promise = (job.type === 'batch' ? uploadBatch(job.items) : uploadChunked(job.item))
        .catch(() => { })
        .finally(() => {
          const index = executing.indexOf(promise);
          if (index >= 0) {
            executing.splice(index, 1);
          }
        });
      executing.push(promise);
    };

    while (pendingJobs.length > 0 || executing.length > 0) {
      while (executing.length < MAX_PARALLEL_UPLOADS && pendingJobs.length > 0) {
        startJob(pendingJobs.shift()!);
      }

      if (executing.length > 0) {
        await Promise.race(executing);
      }
    }

    setIsUploading(false);
    if (!hadErrors) {
      toast(t('modals.uploadFolder.success'), 'success');
      onSuccess?.();
      refreshUser(); // Update storage info in sidebar
    }
  };

  const pendingCount = files.filter((file) => file.status === 'pending').length;
  const completedCount = files.filter((file) => file.status === 'completed').length;

  const handleClose = () => {
    if (isUploading) return;
    setFiles([]);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('modals.uploadFolder.title')} size="lg">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
            : 'border-dark-300 dark:border-dark-600 hover:border-primary-500'
        )}
      >
        <input {...getInputProps()} {...{ directory: '', webkitdirectory: '' } as any} />
        <Upload className="w-12 h-12 mx-auto text-dark-400 mb-4" />
        <p className="text-dark-600">
          {t('modals.uploadFolder.dropHere')}
        </p>
        <p className="text-sm text-dark-500 mt-2">{t('modals.uploadFolder.preserveStructure')}</p>
      </div>

      {files.length > 0 && (
        <div className="mt-6 max-h-72 overflow-y-auto space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 bg-dark-50 dark:bg-dark-700 rounded-lg"
            >
              <FolderOpen className="w-8 h-8 text-dark-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dark-900 dark:text-white truncate">
                  {file.relativePath}
                </p>
                <p className="text-xs text-dark-500">
                  {formatBytes(file.file.size)}
                </p>
                {file.status === 'uploading' && (
                  <Progress value={file.progress} size="sm" className="mt-2" />
                )}
                {file.status === 'error' && (
                  <p className="text-xs text-red-600 mt-1">{file.error}</p>
                )}
              </div>
              {file.status === 'completed' ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : file.status === 'error' ? (
                <XCircle className="w-5 h-5 text-red-500" />
              ) : file.status === 'pending' ? (
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-1 text-dark-400 hover:text-dark-600 dark:hover:text-dark-200"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6">
        <Button type="button" variant="ghost" onClick={handleClose} disabled={isUploading}>
          {completedCount === files.length && files.length > 0 ? t('modals.uploadFolder.done') : t('modals.uploadFolder.cancel')}
        </Button>
        <Button onClick={handleUpload} loading={isUploading} disabled={pendingCount === 0}>
          {t('modals.uploadFolder.upload')}
        </Button>
      </div>
    </Modal>
  );
}
