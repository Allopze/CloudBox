import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { FileItem } from '../types';
import { useFileStore } from '../stores/fileStore';
import FileCard from '../components/files/FileCard';
import FileToolbar from '../components/files/FileToolbar';
import { Loader2 } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn } from '../lib/utils';
import UploadModal from '../components/modals/UploadModal';

export default function Documents() {
  const [documents, setDocuments] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const { viewMode, sortBy, sortOrder, selectedItems, clearSelection } = useFileStore();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/files', {
        params: {
          type: 'documents',
          sortBy,
          sortOrder,
        },
      });
      setDocuments(response.data.files || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast('Error al cargar los documentos', 'error');
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortOrder]);

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
      await Promise.all(
        Array.from(selectedItems).map((id) => api.delete(`/files/${id}`))
      );
      toast('Documentos movidos a la papelera', 'success');
      clearSelection();
      loadData();
    } catch (error) {
      toast('Error al eliminar los documentos', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <FileToolbar
        selectedCount={selectedItems.size}
        onDeleteSelected={handleDeleteSelected}
      />

      {/* Content */}
      <div
        className={cn(
          viewMode === 'grid'
            ? 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
            : 'space-y-1'
        )}
      >
        {documents.map((doc) => (
          <FileCard
            key={doc.id}
            file={doc}