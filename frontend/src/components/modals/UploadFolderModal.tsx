import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDropzone, FileWithPath } from 'react-dropzone';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Progress from '../ui/Progress';
import { Upload, FolderOpen, X, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { formatBytes, cn } from '../../lib/utils';
import { toast } from '../ui/Toast';
import { useAuthStore } from '../../stores/authStore';
import type { Folder } from '../../types';

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
  const [files, setFiles] = useState<FolderUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchParams] = useSearchParams();
  const childrenCache = useRef<Record<string, Folder[]>>({});
  const folderIdCache = useRef<Map<string, string>>(new Map());
  const { refreshUser } = useAuthStore();

  const getCurrentFolderId = () => {
    if (propFolderId !== undefined) return propFolderId || undefined;
    const currentFolder = searchParams.get('folder');
    return currentFolder || undefined;
  };

  const getChildrenKey = (parentId: string | undefined) => parentId ?? 'root';

  const loadChildren = async (parentId: string | undefined) => {
    const key = getChildrenKey(parentId);
    if (childrenCache.current[key]) {
      return childrenCache.current[key];
    }

    const response = await api.get('/folders', {
      params: { parentId: parentId || undefined },
    });

    const folders = response.data || [];
    childrenCache.current[key] = folders;
    return folders;
  };

  const ensureFolder = async (name: string, parentId: string | undefined) => {
    const cacheKey = `${parentId ?? 'root'}:${name}`;
    if (folderIdCache.current.has(cacheKey)) {
      return folderIdCache.current.get(cacheKey)!;
    }

    const children = await loadChildren(parentId);
    const existing = children.find((folder: Folder) => folder.name === name);
    if (existing) {
      folderIdCache.current.set(cacheKey, existing.id);
      return existing.id;
    }

    try {
      const response = await api.post('/folders', {
        name,
        parentId: parentId || undefined,
      });
      const created: Folder = response.data;
      childrenCache.current[getChildrenKey(parentId)] = [...children, created];
      folderIdCache.current.set(cacheKey, created.id);
      return created.id;
    } catch (error: any) {
      if (
        error.response?.status === 400 &&
        typeof error.response?.data?.error === 'string' &&
        error.response.data.error.includes('already exists')
      ) {
        const refreshedChildren = await loadChildren(parentId);
        const duplicate = refreshedChildren.find((folder: Folder) => folder.name === name);
        if (duplicate) {
          folderIdCache.current.set(cacheKey, duplicate.id);
          return duplicate.id;
        }
      }
      throw error;
    }
  };

  const resolveFolderForPath = async (relativePath: string) => {
    const parts = relativePath.split('/').filter(Boolean);
    const directories = parts.slice(0, -1);
    if (directories.length === 0) {
      return getCurrentFolderId();
    }

    let parentId = getCurrentFolderId();
    for (const segment of directories) {
      parentId = await ensureFolder(segment, parentId);
    }
    return parentId;
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

  const uploadFile = async (fileItem: FolderUploadItem, targetFolderId: string | undefined) => {
    const formData = new FormData();
    formData.append('file', fileItem.file);
    if (targetFolderId) {
      formData.append('folderId', targetFolderId);
    }

    try {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id ? { ...f, status: 'uploading' } : f
        )
      );

      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id ? { ...f, progress } : f
            )
          );
        },
      });

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id ? { ...f, status: 'completed', progress: 100 } : f
        )
      );
    } catch (err: any) {
      const message = err.response?.data?.error || 'Error al subir el archivo';
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? { ...f, status: 'error', error: message }
            : f
        )
      );
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    const pendingFiles = files.filter((file) => file.status === 'pending');
    const folderPathCache = new Map<string, string | undefined>();

    for (const fileItem of pendingFiles) {
      const directoryPath = fileItem.relativePath.split('/').slice(0, -1).join('/');
      const cacheKey = directoryPath || '__root__';
      let targetFolderId = folderPathCache.get(cacheKey);
      if (targetFolderId === undefined) {
        targetFolderId = await resolveFolderForPath(fileItem.relativePath);
        folderPathCache.set(cacheKey, targetFolderId);
      }
      await uploadFile(fileItem, targetFolderId);
    }

    setIsUploading(false);
    const hasErrors = files.some((file) => file.status === 'error');
    if (!hasErrors) {
      toast('Carpeta subida correctamente', 'success');
      onSuccess?.();
      refreshUser(); // Update storage info in sidebar
    }
  };

  const pendingCount = files.filter((file) => file.status === 'pending').length;
  const completedCount = files.filter((file) => file.status === 'completed').length;

  const handleClose = () => {
    if (isUploading) return;
    setFiles([]);
    childrenCache.current = {};
    folderIdCache.current.clear();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Subir carpeta" size="lg">
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
          Arrastra una carpeta o haz clic para seleccionar un directorio completo
        </p>
        <p className="text-sm text-dark-500 mt-2">Se preservará la estructura por carpetas</p>
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
          {completedCount === files.length && files.length > 0 ? 'Hecho' : 'Cancelar'}
        </Button>
        <Button onClick={handleUpload} loading={isUploading} disabled={pendingCount === 0}>
          Subir carpeta
        </Button>
      </div>
    </Modal>
  );
}
