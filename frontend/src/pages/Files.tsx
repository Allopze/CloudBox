import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { FileItem, Folder } from '../types';
import { useFileStore } from '../stores/fileStore';
import FileCard from '../components/files/FileCard';
import FolderCard from '../components/files/FolderCard';
import FileToolbar from '../components/files/FileToolbar';
import { Loader2 } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn } from '../lib/utils';
import UploadModal from '../components/modals/UploadModal';
import CreateFolderModal from '../components/modals/CreateFolderModal';

export default function Files() {
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get('folder');
  const searchQuery = searchParams.get('search');

  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setCreateFolderModalOpen] = useState(false);

  const { viewMode, sortBy, sortOrder, selectedItems, clearSelection, setBreadcrumbs } = useFileStore();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        sortBy,
        sortOrder,
      };

      if (folderId) {
        params.folderId = folderId;
      }

      if (searchQuery) {
        params.search = searchQuery;
      }

      const [filesRes, foldersRes] = await Promise.all([
        api.get('/files', { params }),
        api.get('/folders', { params: { parentId: folderId || undefined } }),
      ]);

      setFiles(filesRes.data.files || []);
      setFolders(foldersRes.data || []);

      // Cargar breadcrumbs si estamos en una carpeta
      if (folderId) {
        const folderRes = await api.get(`/folders/${folderId}`);

        // Construir breadcrumbs desde la ruta
        const crumbs: { id: string; name: string }[] = [];
        let current = folderRes.data;
        while (current) {
          crumbs.unshift({ id: current.id, name: current.name });
          if (current.parentId) {
            const parentRes = await api.get(`/folders/${current.parentId}`);
            current = parentRes.data;
          } else {
            current = null;
          }
        }
        setBreadcrumbs(crumbs);
      } else {
        setBreadcrumbs([]);
      }
    } catch (error) {
      console.error('Error al cargar archivos:', error);
      toast('Error al cargar los archivos', 'error');
    } finally {
      setLoading(false);
    }
  }, [folderId, searchQuery, sortBy, sortOrder, setBreadcrumbs]);

  useEffect(() => {
    loadData();
    clearSelection();
  }, [loadData, clearSelection]);

  // Listen for workzone refresh event from MainLayout context menu
  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [loadData]);

  const handleDeleteSelected = async () => {
    try {
      const selectedArray = Array.from(selectedItems);
      await Promise.all(
        selectedArray.map((id) => {
          return api.delete(`/files/${id}`).catch(() => api.delete(`/folders/${id}`));
        })
      );
      toast('Elementos movidos a la papelera', 'success');
      clearSelection();
      loadData();
    } catch (error) {
      toast('Error al eliminar los elementos', 'error');
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <FileToolbar
        selectedCount={selectedItems.size}
        onDeleteSelected={handleDeleteSelected}
      />

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
              : 'space-y-1'
          )}
        >
          {/* Carpetas primero */}
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              view={viewMode}
              onRefresh={loadData}
            />
          ))}

          {/* Luego archivos */}
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              view={viewMode}
              onRefresh={loadData}
            />
          ))}
        </div>
      )}

      {/* Modales */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setUploadM