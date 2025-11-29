import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { Loader2, Trash2, RotateCcw, AlertTriangle, File, Folder, Info } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatDate, formatBytes } from '../lib/utils';
import { useGlobalProgressStore } from '../stores/globalProgressStore';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { FileItem, Folder as FolderType } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface TrashData {
  files: FileItem[];
  folders: FolderType[];
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'file' | 'folder';
  item: FileItem | FolderType;
}

export default function Trash() {
  const [data, setData] = useState<TrashData>({ files: [], folders: [] });
  const [loading, setLoading] = useState(true);
  const [showEmptyModal, setShowEmptyModal] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [infoItem, setInfoItem] = useState<{ type: 'file' | 'folder'; item: FileItem | FolderType } | null>(null);
  
  const { addOperation, completeOperation, failOperation } = useGlobalProgressStore();

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

  // Listen for workzone refresh event
  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [loadData]);

  // Listen for empty trash event from breadcrumb bar
  useEffect(() => {
    const handleEmptyTrash = () => setShowEmptyModal(true);
    window.addEventListener('empty-trash', handleEmptyTrash);
    return () => window.removeEventListener('empty-trash', handleEmptyTrash);
  }, []);

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
    const totalItems = data.files.length + data.folders.length;
    
    const opId = addOperation({
      id: `empty-trash-${Date.now()}`,
      type: 'delete',
      title: `Vaciando papelera (${totalItems} elementos)`,
      totalItems: totalItems,
    });
    
    try {
      await api.delete('/trash/empty');
      completeOperation(opId);
      toast('Papelera vaciada correctamente', 'success');
      setShowEmptyModal(false);
      loadData();
    } catch (error) {
      failOperation(opId, 'Error al vaciar la papelera');
      toast('Error al vaciar la papelera', 'error');
    } finally {
      setEmptyingTrash(false);
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, type: 'file' | 'folder', item: FileItem | FolderType) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, item });
  };

  const closeContextMenu = () => setContextMenu(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const handleRestoreFromMenu = async () => {
    if (!contextMenu) return;
    if (contextMenu.type === 'file') {
      await restoreFile(contextMenu.item as FileItem);
    } else {
      await restoreFolder(contextMenu.item as FolderType);
    }
    closeContextMenu();
  };

  const handleDeleteFromMenu = async () => {
    if (!contextMenu) return;
    if (contextMenu.type === 'file') {
      await deleteFile(contextMenu.item as FileItem);
    } else {
      await deleteFolder(contextMenu.item as FolderType);
    }
    closeContextMenu();
  };

  const handleShowInfo = () => {
    if (!contextMenu) return;
    setInfoItem({ type: contextMenu.type, item: contextMenu.item });
    closeContextMenu();
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
      {/* Contenido */}
      {totalItems > 0 ? (
        <div className="space-y-1">
          {/* Carpetas */}
          {data.folders.map((folder) => (
            <div
              key={`folder-${folder.id}`}
              onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
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
              onContextMenu={(e) => handleContextMenu(e, 'file', file)}
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
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-dark-500">
          <Trash2 className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">La papelera está vacía</p>
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

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{
              position: 'fixed',
              left: contextMenu.x + 288 > window.innerWidth ? contextMenu.x - 288 : contextMenu.x,
              top: (() => {
                const menuHeight = 200;
                const padding = 20;
                if (contextMenu.y + menuHeight > window.innerHeight - padding) {
                  return Math.max(padding, contextMenu.y - menuHeight);
                }
                return contextMenu.y;
              })(),
            }}
            className="z-50 min-w-72 bg-white dark:bg-dark-800 rounded-xl shadow-2xl border border-dark-200 dark:border-dark-700 py-2 overflow-hidden"
          >
            {/* Restaurar */}
            <div className="px-2 py-1">
              <button
                onClick={handleRestoreFromMenu}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                <span>Restaurar</span>
              </button>
            </div>
            
            <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
            
            {/* Información */}
            <div className="px-2 py-1">
              <button
                onClick={handleShowInfo}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
              >
                <Info className="w-5 h-5" />
                <span>Información</span>
              </button>
            </div>
            
            <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
            
            {/* Eliminar permanentemente */}
            <div className="px-2 py-1">
              <button
                onClick={handleDeleteFromMenu}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                <span>Eliminar permanentemente</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Modal */}
      {infoItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setInfoItem(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-lg w-full p-8"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0 bg-dark-100 dark:bg-dark-700">
                {infoItem.type === 'folder' ? (
                  <Folder className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                ) : (
                  <File className="w-8 h-8 text-dark-500 dark:text-dark-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold text-dark-900 dark:text-white truncate">
                  {infoItem.item.name}
                </h3>
                <p className="text-sm text-dark-500">{infoItem.type === 'folder' ? 'Carpeta' : 'Archivo'}</p>
              </div>
            </div>
            
            <div className="space-y-3 mb-6">
              {infoItem.type === 'file' && (
                <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                  <span className="text-dark-500">Tamaño</span>
                  <span className="text-dark-900 dark:text-white font-medium">
                    {formatBytes((infoItem.item as FileItem).size)}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">Fecha de eliminación</span>
                <span className="text-dark-900 dark:text-white font-medium">
                  {formatDate(infoItem.item.trashedAt || infoItem.item.updatedAt)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-dark-500">Creado</span>
                <span className="text-dark-900 dark:text-white font-medium">
                  {formatDate(infoItem.item.createdAt)}
                </span>
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button onClick={() => setInfoItem(null)}>
                Cerrar
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
