import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { FileItem, Folder } from '../types';
import { useFileStore } from '../stores/fileStore';
import FileCard from '../components/files/FileCard';
import FolderCard from '../components/files/FolderCard';
import FileToolbar from '../components/files/FileToolbar';
import { Loader2 } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn } from '../lib/utils';

export default function Favorites() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const { viewMode, sortBy, sortOrder, selectedItems, clearSelection } = useFileStore();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [filesRes, foldersRes] = await Promise.all([
        api.get('/files', { params: { favorites: true, sortBy, sortOrder } }),
        api.get('/folders', { params: { favorites: true } }),
      ]);

      setFiles(filesRes.data.files || []);
      setFolders(foldersRes.data.filter((f: Folder) => f.isFavorite) || []);
    } catch (error) {
      console.error('Failed to load favorites:', error);
      toast('Error al cargar favoritos', 'error');
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortOrder]);

  useEffect(() => {
    loadData();
    clearSelection();
  }, [loadData, clearSelection]);

  const handleDeleteSelected = async () => {
    try {
      await Promise.all(
        Array.from(selectedItems).map((id) => api.delete(`/files/${id}`))
      );
      toast('Elementos movidos a la papelera', 'success');
      clearSelection();
      loadData();
    } catch (error) {
      toast('Error al eliminar elementos', 'error');
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <FileToolbar
        selectedCount={selectedItems.size}
        onDeleteSelected={handleDeleteSelected}
      />

      {/* Content */}
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
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              view={viewMode}
              onRefresh={loadData}
            />
          ))}
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
    </div>
  );
}
