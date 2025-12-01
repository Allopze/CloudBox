import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Progress from '../ui/Progress';
import { Upload, X, File, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { formatBytes, cn } from '../../lib/utils';
import { toast } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';

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
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export default function UploadModal({
  isOpen,
  onClose,
  onSuccess,
  folderId: propFolderId,
}: UploadModalProps) {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuthStore();

  const getCurrentFolderId = () => {
    if (propFolderId !== undefined) return propFolderId || undefined;
    const folderId = searchParams.get('folder');
    return folderId || undefined;
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: FileUpload[] = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      progress: 0,
      status: 'pending',
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadFile = async (fileUpload: FileUpload) => {
    const formData = new FormData();
    formData.append('files', fileUpload.file);
    const folderId = getCurrentFolderId();
    if (folderId) {
      formData.append('folderId', folderId);
    }

    try {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileUpload.id ? { ...f, status: 'uploading' } : f
        )
      );

      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          setFiles((prev) =>
            prev.map((f) => (f.id === fileUpload.id ? { ...f, progress } : f))
          );
        },
      });

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileUpload.id
            ? { ...f, status: 'completed', progress: 100 }
            : f
        )
      );
    } catch (err: any) {
      const message = err.response?.data?.message || 'Upload failed';
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileUpload.id ? { ...f, status: 'error', error: message } : f
        )
      );
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    const pendingFiles = files.filter((f) => f.status === 'pending');

    // Upload files sequentially
    for (const fileUpload of pendingFiles) {
      await uploadFile(fileUpload);
    }

    setIsUploading(false);
    const hasErrors = files.some((f) => f.status === 'error');
    if (!hasErrors) {
      toast('Todos los archivos se subieron correctamente', 'success');
      onSuccess?.();
      refreshUser(); // Update storage info in sidebar
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      onClose();
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const completedCount = files.filter((f) => f.status === 'completed').length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Subir archivos"
      size="lg"
    >
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
            ? 'Suelta los archivos aquí...'
            : 'Arrastra y suelta archivos aquí, o haz clic para seleccionar'}
        </p>
        <p className="text-sm text-dark-500 mt-2">Tamaño máximo: 1GB</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-6 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-dark-700 dark:text-dark-300">
              {files.length} archivo(s) seleccionado(s)
            </p>
            {completedCount > 0 && (
              <p className="text-sm text-green-600">
                {completedCount} completado(s)
              </p>
            )}
          </div>
          <div className="space-y-2">
            {files.map((fileUpload) => (
              <div
                key={fileUpload.id}
                className="flex items-center gap-3 p-3 bg-dark-50 dark:bg-dark-700 rounded-lg"
              >
                <File className="w-8 h-8 text-dark-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark-900 dark:text-white truncate">
                    {fileUpload.file.name}
                  </p>
                  <p className="text-xs text-dark-500">
                    {formatBytes(fileUpload.file.size)}
                  </p>
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
        <Button variant="ghost" onClick={handleClose} disabled={isUploading}>
          {completedCount === files.length && files.length > 0 ? 'Listo' : 'Cancelar'}
        </Button>
        {pendingCount > 0 && (
          <Button onClick={handleUpload} loading={isUploading}>
            Subir {pendingCount} archivo(s)
          </Button>
        )}
      </div>
    </Modal>
  );
}
