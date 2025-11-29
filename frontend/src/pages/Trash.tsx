import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { Loader2, Trash2, RotateCcw, AlertTriangle, File, Folder } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatDate, formatBytes } from '../lib/utils';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { FileItem, Folder as FolderType } from '../types';

interface TrashData {
  files: FileItem[];
  folders: FolderType[];
}

export default function Trash() {
  const [data, setData] = useState<TrashData>({ files: [], folders: [] });
  const [loading, setLoading] = useState(true);
  const [showEmptyModal, setShowEmptyModal] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/trash');
      setData(response.data || { files: [], folders: [] });
    } catch (error) {
      console.error('Error al cargar la papelera:', error);
      toast('Error al cargar la papelera', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const restoreFile = async (file: FileItem) => {
    try {
      await api.post(`/trash/restore/file/${file.id}`);
      toast('Archivo restaurado correctamente', 'success');
      loadData();
    } catch (error) {
      toast('Error al restaurar el archivo', 'error');
    }
  };

  const restoreFolder = async (folder: FolderType) => {
    try {
      await api.post(`/trash/restore/folder/${folder.id}`);
      toast('Carpeta restaurada correctamente', 'success');
      loadData();
    } catch (error) {
      toast('Error al restaurar la carpeta', 'error');
    }
  };

  const deleteFile = async (file: FileItem) => {
    try {
      await api.delete(`/files/${file.id}?permanent=true`);
      toast('Archivo eliminado permanentemente', 'success');
      loadData();
    } catch (error) {
      toast('Error al eliminar el archivo', 'error');
    }
  };

  const deleteFolder = async (folder: FolderType) => {
    try {
      await api.delete(`/folders/${folder.id}?permanent=true`);
      toast('Carpeta eliminada permanentemente', 'success');
      loadData();
    } catch (error) {
      toast('Error al eliminar la carpeta', 'error');
    }
  };

  const emptyTrash = async () => {
    setEmptyingTrash(true);
    try {
      await api.delete('/trash/empty');
      toast('Papelera vaciada correctamente', 'success');
      setShowEmptyModal(false);
      loadData();
    } catch (error) {
      toast('Error al vaciar la papelera', 'error');
    } finally {
      setEmptyingTrash(false);
    }
  };

  const totalItems = data.files.length + data.folders.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Barra de acciones */}
      {totalItems > 0 && (
        <div className="flex items-center justify-end mb-4">
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowEmptyModal(true)}
            icon={<Trash2 className="w-4 h-4" />}
            aria-label="Vaciar papelera"
          >
            Vaciar papelera
          </Button>
        </div>
      )}

      {/* Contenido */}
      {totalItems > 0 && (
        <div className="space-y-1">
          {/* Carpetas */}
          {data.folders.map((folder) => (
            <div
              key={`folder-${folder.id}`}
              className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                <Folder className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-dark-900 dark:text-white truncate">
                  {folder.name}
                </p>
                <div className="flex items-center gap-3 text-sm text-dark-500 dark:text-dark-400">
                  <span>Carpeta</span>
                  <span>•</span>
                  <span>Eliminado {formatDate(folder.trashedAt || folder.updatedAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => restoreFolder(folder)}
                  icon={<RotateCcw className="w-4 h-4" />}
                  aria-label={`Restaurar carpeta ${folder.name}`}
                >
                  Restaurar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => deleteFolder(folder)}
                  icon={<Trash2 className="w-4 h-4" />}
                  aria-label={`Eliminar permanentemente carpeta ${folder.name}`}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
          
          {/* Archivos */}
          {data.files.map((file) => (
            <div
              key={`file-${file.id}`}
              className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-dark-100 dark:bg-dark-700 flex items-center justify-center flex-shrink-0">
                <File className="w-5 h-5 text-dark-500 dark:text-dark-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-dark-900 dark:text-white truncate">
                  {file.name}
                </p>
                <div className="flex items-center gap-3 text-sm text-dark-500 dark:text-dark-400">
                  <span>Archivo</span>
                  <span>•</span>
                  <span>{formatBytes(file.size)}</span>
                  <span>•</span>
                  <span>Eliminado {formatDate(file.trashedAt || file.updatedAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => restoreFile(file)}
                  icon={<RotateCcw className="w-4 h-4" />}
                  aria-label={`Restaurar archivo ${file.name}`}
                >
                  Restaurar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => deleteFile(file)}
                  icon={<Trash2 className="w-4 h-4" />}
                  aria-label={`Eliminar permanentemente archivo ${file.name}`}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmar vaciado */}
      <Modal
        isOpen={showEmptyModal}
        onClose={() => setShowEmptyModal(false)}
        title="Vaciar papelera"
        size="sm"
      >
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <p className="text-dark-700 dark:text-dark-300 mb-2">
            ¿Estás seguro de que deseas eliminar permanentemente {totalItems} {totalItems === 1 ? 'elemento' : 'elementos'} de la papelera?
          </p>
          <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">
            Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="ghost" onClick={() => setShowEmptyModal(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={emptyingTrash} onClick={emptyTrash}>
              Vaciar papelera
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
