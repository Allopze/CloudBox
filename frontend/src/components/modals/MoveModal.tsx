import { useState, useEffect, useCallback } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import { FileItem, Folder } from '../../types';
import { Folder as FolderIcon, ChevronRight, Home, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: (FileItem | Folder)[];
  onSuccess?: () => void;
}

export default function MoveModal({ isOpen, onClose, items, onSuccess }: MoveModalProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentPath, setCurrentPath] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);

  const currentFolderId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;

  // Get IDs of items being moved (to exclude them from destination options)
  const itemIds = items.map((item) => item.id);

  const loadFolders = useCallback(async (parentId: string | null, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await api.get('/folders', {
        params: { parentId: parentId || undefined },
        signal,
      });
      
      // Don't update state if aborted
      if (signal?.aborted) return;
      
      // Filter out the items being moved
      const filtered = (response.data || []).filter(
        (folder: Folder) => !itemIds.includes(folder.id)
      );
      setFolders(filtered);
    } catch (error: any) {
      // Ignore aborted requests
      if (error.name === 'CanceledError' || signal?.aborted) return;
      console.error('Failed to load folders:', error);
      toast('Error al cargar carpetas', 'error');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [itemIds]);

  useEffect(() => {
    if (isOpen) {
      const abortController = new AbortController();
      
      setCurrentPath([]);
      setSelectedFolder(null);
      loadFolders(null, abortController.signal);
      
      return () => {
        abortController.abort();
      };
    }
  }, [isOpen, loadFolders]);

  const navigateToFolder = (folder: Folder) => {
    setCurrentPath([...currentPath, folder]);
    setSelectedFolder(null);
    loadFolders(folder.id);
  };

  const navigateBack = (index: number) => {
    const newPath = currentPath.slice(0, index);
    setCurrentPath(newPath);
    setSelectedFolder(null);
    loadFolders(newPath.length > 0 ? newPath[newPath.length - 1].id : null);
  };

  const navigateToRoot = () => {
    setCurrentPath([]);
    setSelectedFolder(null);
    loadFolders(null);
  };

  const handleMove = async () => {
    // If no folder selected, move to current folder view (which could be root)
    const destinationId = selectedFolder || currentFolderId;

    setMoving(true);
    try {
      // Move each item
      for (const item of items) {
        const isFile = 'mimeType' in item;

        // Skip if trying to move to same location
        if (isFile && (item as FileItem).folderId === destinationId) continue;
        if (!isFile && (item as Folder).parentId === destinationId) continue;

        if (isFile) {
          await api.patch(`/files/${item.id}/move`, { folderId: destinationId });
        } else {
          await api.patch(`/folders/${item.id}/move`, { parentId: destinationId });
        }
      }

      toast(`${items.length} elemento(s) movido(s)`, 'success');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast(error.response?.data?.error || 'Error al mover', 'error');
    } finally {
      setMoving(false);
    }
  };

  const getDestinationName = () => {
    if (selectedFolder) {
      const folder = folders.find((f) => f.id === selectedFolder);
      return folder?.name || 'Carpeta seleccionada';
    }
    if (currentPath.length > 0) {
      return currentPath[currentPath.length - 1].name;
    }
    return 'Raíz';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Mover ${items.length} elemento(s)`}
      size="md"
    >
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-dark-500 overflow-x-auto pb-2">
          <button
            onClick={navigateToRoot}
            className="flex items-center gap-1 hover:text-dark-900 dark:hover:text-white transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Raíz</span>
          </button>
          {currentPath.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
              <button
                onClick={() => navigateBack(index + 1)}
                className="hover:text-dark-900 dark:hover:text-white transition-colors truncate max-w-32"
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        {/* Folders list */}
        <div className="border border-dark-100 dark:border-dark-700 rounded-xl max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-dark-500">
              <FolderIcon className="w-10 h-10 mb-2 text-dark-300" />
              <p>No hay subcarpetas</p>
            </div>
          ) : (
            <div className="divide-y divide-dark-100 dark:divide-dark-700">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={cn(
                    'flex items-center gap-3 p-3 cursor-pointer transition-colors',
                    selectedFolder === folder.id
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : 'hover:bg-dark-50 dark:hover:bg-dark-800'
                  )}
                  onClick={() => setSelectedFolder(folder.id)}
                  onDoubleClick={() => navigateToFolder(folder)}
                >
                  <FolderIcon className="w-5 h-5 text-primary-500 flex-shrink-0" />
                  <span className="font-medium text-dark-900 dark:text-white truncate">
                    {folder.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateToFolder(folder);
                    }}
                    className="ml-auto p-1 text-dark-400 hover:text-dark-600 dark:hover:text-dark-200"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Destination indicator */}
        <div className="bg-dark-50 dark:bg-dark-900 rounded-lg p-3 text-sm">
          <span className="text-dark-500">Mover a: </span>
          <span className="font-medium text-dark-900 dark:text-white">
            {getDestinationName()}
          </span>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleMove} loading={moving}>
            Mover aquí
          </Button>
        </div>
      </div>
    </Modal>
  );
}
