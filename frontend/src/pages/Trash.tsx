import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Loader2, Trash2, RotateCcw, AlertTriangle, File, Folder, Info } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatDate, formatBytes, cn } from '../lib/utils';
import { useGlobalProgressStore } from '../stores/globalProgressStore';
import { useFileStore } from '../stores/fileStore';
import { useAuthStore } from '../stores/authStore';
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
  const { t } = useTranslation();
  const [data, setData] = useState<TrashData>({ files: [], folders: [] });
  const [loading, setLoading] = useState(true);
  const [showEmptyModal, setShowEmptyModal] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuSelection, setContextMenuSelection] = useState<Set<string>>(new Set());
  const { refreshUser } = useAuthStore();
  const [infoItem, setInfoItem] = useState<{ type: 'file' | 'folder'; item: FileItem | FolderType } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ files: FileItem[]; folders: FolderType[] } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { addOperation, completeOperation, failOperation } = useGlobalProgressStore();
  const { selectedItems, selectSingle, toggleSelection, clearSelection } = useFileStore();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/trash');
      setData(response.data || { files: [], folders: [] });
    } catch (error) {
      console.error('Error loading trash:', error);
      toast(t('trash.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
    clearSelection();
  }, [loadData, clearSelection]);

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
      toast(t('trash.restored', { type: t('trash.file') }), 'success');
      loadData();
    } catch {
      toast(t('trash.restoreError', { type: t('trash.file') }), 'error');
    }
  };

  const restoreFolder = async (folder: FolderType) => {
    try {
      await api.post(`/trash/restore/folder/${folder.id}`);
      toast(t('trash.restored', { type: t('trash.folder') }), 'success');
      loadData();
    } catch {
      toast(t('trash.restoreError', { type: t('trash.folder') }), 'error');
    }
  };

  const deleteFile = async (file: FileItem) => {
    try {
      await api.delete(`/files/${file.id}?permanent=true`);
      toast(t('trash.deleted', { type: t('trash.file') }), 'success');
      loadData();
      refreshUser(); // Update storage info in sidebar
    } catch {
      toast(t('trash.deleteError', { type: t('trash.file') }), 'error');
    }
  };

  const deleteFolder = async (folder: FolderType) => {
    try {
      await api.delete(`/folders/${folder.id}?permanent=true`);
      toast(t('trash.deleted', { type: t('trash.folder') }), 'success');
      loadData();
      refreshUser(); // Update storage info in sidebar
    } catch {
      toast(t('trash.deleteError', { type: t('trash.folder') }), 'error');
    }
  };

  const emptyTrash = async () => {
    setEmptyingTrash(true);
    const totalItems = data.files.length + data.folders.length;

    const opId = addOperation({
      id: `empty-trash-${Date.now()}`,
      type: 'delete',
      title: t('trash.emptyingTrash', { count: totalItems }),
      totalItems: totalItems,
    });

    try {
      await api.delete('/trash/empty');
      completeOperation(opId);
      toast(t('sidebar.trashEmptied'), 'success');
      setShowEmptyModal(false);
      loadData();
      refreshUser(); // Update storage info in sidebar
    } catch {
      failOperation(opId, t('sidebar.trashEmptyError'));
      toast(t('sidebar.trashEmptyError'), 'error');
    } finally {
      setEmptyingTrash(false);
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, type: 'file' | 'folder', item: FileItem | FolderType) => {
    e.preventDefault();
    e.stopPropagation();

    // Obtener el estado actual directamente del store (síncrono)
    const currentSelectedItems = useFileStore.getState().selectedItems;

    // Si el item clickeado no está en la selección, seleccionarlo solo
    if (!currentSelectedItems.has(item.id)) {
      selectSingle(item.id);
      // Guardar solo este item como selección
      setContextMenuSelection(new Set([item.id]));
    } else {
      // Guardar la selección actual para usar en las acciones del menú
      setContextMenuSelection(new Set(currentSelectedItems));
    }

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

    // Usar la selección capturada al abrir el menú
    const selectedFilesList = data.files.filter(f => contextMenuSelection.has(f.id));
    const selectedFoldersList = data.folders.filter(f => contextMenuSelection.has(f.id));
    const total = selectedFilesList.length + selectedFoldersList.length;

    if (total === 0) {
      // Si no hay selección, restaurar solo el item del menú
      if (contextMenu.type === 'file') {
        await restoreFile(contextMenu.item as FileItem);
      } else {
        await restoreFolder(contextMenu.item as FolderType);
      }
    } else if (total === 1) {
      // Un solo elemento seleccionado
      if (selectedFilesList.length === 1) {
        await restoreFile(selectedFilesList[0]);
      } else {
        await restoreFolder(selectedFoldersList[0]);
      }
    } else {
      // Múltiples elementos seleccionados
      const opId = addOperation({
        id: `restore-${Date.now()}`,
        type: 'move',
        title: t('trash.restoringItems', { count: total }),
        totalItems: total,
      });

      try {
        for (const file of selectedFilesList) {
          await api.post(`/trash/restore/file/${file.id}`);
        }
        for (const folder of selectedFoldersList) {
          await api.post(`/trash/restore/folder/${folder.id}`);
        }
        completeOperation(opId);
        toast(t('trash.itemsRestored', { count: total }), 'success');
        clearSelection();
        loadData();
      } catch {
        failOperation(opId, t('trash.restoreErrorGeneric'));
        toast(t('trash.restoreErrorGeneric'), 'error');
      }
    }

    closeContextMenu();
  };

  const handleDeleteFromMenu = async () => {
    if (!contextMenu) return;

    // Usar la selección capturada al abrir el menú
    const selectedFilesList = data.files.filter(f => contextMenuSelection.has(f.id));
    const selectedFoldersList = data.folders.filter(f => contextMenuSelection.has(f.id));
    const total = selectedFilesList.length + selectedFoldersList.length;

    if (total === 0) {
      // Si no hay selección, eliminar solo el item del menú
      if (contextMenu.type === 'file') {
        await deleteFile(contextMenu.item as FileItem);
      } else {
        await deleteFolder(contextMenu.item as FolderType);
      }
    } else if (total === 1) {
      // Un solo elemento seleccionado
      if (selectedFilesList.length === 1) {
        await deleteFile(selectedFilesList[0]);
      } else {
        await deleteFolder(selectedFoldersList[0]);
      }
    } else {
      // Múltiples elementos seleccionados - mostrar modal de confirmación
      setDeleteConfirmation({ files: selectedFilesList, folders: selectedFoldersList });
      closeContextMenu();
      return;
    }

    closeContextMenu();
  };

  const executeMultiDelete = async () => {
    if (!deleteConfirmation) return;

    const { files, folders } = deleteConfirmation;
    const total = files.length + folders.length;

    setIsDeleting(true);

    const opId = addOperation({
      id: `delete-permanent-${Date.now()}`,
      type: 'delete',
      title: t('trash.deletingPermanently', { count: total }),
      totalItems: total,
    });

    try {
      for (const file of files) {
        await api.delete(`/files/${file.id}?permanent=true`);
      }
      for (const folder of folders) {
        await api.delete(`/folders/${folder.id}?permanent=true`);
      }
      completeOperation(opId);
      toast(t('trash.itemsDeleted', { count: total }), 'success');
      clearSelection();
      loadData();
      refreshUser(); // Update storage info in sidebar
    } catch {
      failOperation(opId, t('trash.deleteErrorGeneric'));
      toast(t('trash.deleteErrorGeneric'), 'error');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmation(null);
    }
  };

  const handleShowInfo = () => {
    if (!contextMenu) return;
    setInfoItem({ type: contextMenu.type, item: contextMenu.item });
    closeContextMenu();
  };

  // Handle item click for selection
  const handleItemClick = (e: React.MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) {
      toggleSelection(id);
    } else {
      selectSingle(id);
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
      {/* Contenido */}
      {totalItems > 0 ? (
        <div className="space-y-2">
          {/* Carpetas */}
          {data.folders.map((folder) => {
            const isSelected = selectedItems.has(folder.id);
            return (
              <div
                key={`folder-${folder.id}`}
                data-folder-item={folder.id}
                onClick={(e) => handleItemClick(e, folder.id)}
                onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer",
                  isSelected
                    ? "bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-dark-900"
                    : "hover:bg-dark-50 dark:hover:bg-dark-800"
                )}
              >
                <div className="w-9 h-9 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                  <Folder className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark-900 dark:text-white truncate">
                    {folder.name}
                  </p>
                  <div className="flex items-center gap-3 text-sm text-dark-500 dark:text-dark-400">
                    <span>{t('trash.folder')}</span>
                    <span>•</span>
                    <span>{t('trash.deletedOn', { date: formatDate(folder.trashedAt || folder.updatedAt) })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => restoreFolder(folder)}
                    icon={<RotateCcw className="w-4 h-4" />}
                    aria-label={t('trash.restoreFolder', { name: folder.name })}
                  >
                    {t('trash.restore')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => deleteFolder(folder)}
                    icon={<Trash2 className="w-4 h-4" />}
                    aria-label={t('trash.deleteFolderPermanently', { name: folder.name })}
                  >
                    {t('trash.delete')}
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Archivos */}
          {data.files.map((file) => {
            const isSelected = selectedItems.has(file.id);
            return (
              <div
                key={`file-${file.id}`}
                data-file-item={file.id}
                onClick={(e) => handleItemClick(e, file.id)}
                onContextMenu={(e) => handleContextMenu(e, 'file', file)}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer",
                  isSelected
                    ? "bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-dark-900"
                    : "hover:bg-dark-50 dark:hover:bg-dark-800"
                )}
              >
                <div className="w-9 h-9 rounded-xl bg-dark-100 dark:bg-dark-700 flex items-center justify-center flex-shrink-0">
                  <File className="w-4 h-4 text-dark-500 dark:text-dark-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark-900 dark:text-white truncate">
                    {file.name}
                  </p>
                  <div className="flex items-center gap-3 text-sm text-dark-500 dark:text-dark-400">
                    <span>{t('trash.file')}</span>
                    <span>•</span>
                    <span>{formatBytes(file.size)}</span>
                    <span>•</span>
                    <span>{t('trash.deletedOn', { date: formatDate(file.trashedAt || file.updatedAt) })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => restoreFile(file)}
                    icon={<RotateCcw className="w-4 h-4" />}
                    aria-label={t('trash.restoreFile', { name: file.name })}
                  >
                    {t('trash.restore')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => deleteFile(file)}
                    icon={<Trash2 className="w-4 h-4" />}
                    aria-label={t('trash.deleteFilePermanently', { name: file.name })}
                  >
                    {t('trash.delete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Trash2 className="w-16 h-16 text-dark-400 mb-4" />
          <h3 className="text-lg font-medium text-dark-900 dark:text-white mb-2">{t('trash.empty')}</h3>
          <p className="text-dark-500 dark:text-dark-400 max-w-sm">
            {t('trash.emptySubtitle')}
          </p>
        </div>
      )}

      {/* Modal de confirmar vaciado */}
      <Modal
        isOpen={showEmptyModal}
        onClose={() => setShowEmptyModal(false)}
        title={t('trash.emptyConfirmTitle')}
        size="sm"
      >
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <p className="text-dark-700 dark:text-dark-300 mb-2">
            {t('trash.emptyConfirmMessage', { count: totalItems })}
          </p>
          <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">
            {t('trash.emptyConfirmWarning')}
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="ghost" onClick={() => setShowEmptyModal(false)}>
              {t('trash.cancel')}
            </Button>
            <Button variant="danger" loading={emptyingTrash} onClick={emptyTrash}>
              {t('trash.emptyTrash')}
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
            className="z-50 min-w-[180px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 overflow-hidden"
          >
            {/* Restaurar */}
            <div className="px-2 py-1">
              <button
                onClick={handleRestoreFromMenu}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                <span>{t('trash.restore')}</span>
              </button>
            </div>

            <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

            {/* Información */}
            <div className="px-2 py-1">
              <button
                onClick={handleShowInfo}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
              >
                <Info className="w-5 h-5" />
                <span>{t('trash.info')}</span>
              </button>
            </div>

            <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

            {/* Eliminar permanentemente */}
            <div className="px-2 py-1">
              <button
                onClick={handleDeleteFromMenu}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                <span>{t('trash.deletePermanently')}</span>
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
              <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 bg-dark-100 dark:bg-dark-700">
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
                <p className="text-sm text-dark-500">{infoItem.type === 'folder' ? t('trash.folder') : t('trash.file')}</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {infoItem.type === 'file' && (
                <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                  <span className="text-dark-500">{t('trash.size')}</span>
                  <span className="text-dark-900 dark:text-white font-medium">
                    {formatBytes((infoItem.item as FileItem).size)}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">{t('trash.deletedDate')}</span>
                <span className="text-dark-900 dark:text-white font-medium">
                  {formatDate(infoItem.item.trashedAt || infoItem.item.updatedAt)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-dark-500">{t('trash.createdDate')}</span>
                <span className="text-dark-900 dark:text-white font-medium">
                  {formatDate(infoItem.item.createdAt)}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setInfoItem(null)}>
                {t('trash.close')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !isDeleting && setDeleteConfirmation(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full p-6"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dark-900 dark:text-white">
                  {t('trash.deleteConfirmTitle')}
                </h3>
                <p className="text-sm text-dark-500">
                  {t('trash.deleteConfirmSelected', { count: deleteConfirmation.files.length + deleteConfirmation.folders.length })}
                </p>
              </div>
            </div>

            <p className="text-dark-600 dark:text-dark-300 mb-6">
              {t('trash.deleteConfirmMessage')}
              <span className="text-red-600 dark:text-red-400 font-medium"> {t('trash.emptyConfirmWarning')}</span>
            </p>

            {/* Preview of items to delete */}
            <div className="max-h-32 overflow-y-auto mb-6 space-y-1">
              {deleteConfirmation.folders.map(folder => (
                <div key={folder.id} className="flex items-center gap-2 text-sm text-dark-600 dark:text-dark-400 py-1">
                  <Folder className="w-4 h-4 text-yellow-600" />
                  <span className="truncate">{folder.name}</span>
                </div>
              ))}
              {deleteConfirmation.files.map(file => (
                <div key={file.id} className="flex items-center gap-2 text-sm text-dark-600 dark:text-dark-400 py-1">
                  <File className="w-4 h-4 text-dark-400" />
                  <span className="truncate">{file.name}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setDeleteConfirmation(null)}
                disabled={isDeleting}
              >
                {t('trash.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={executeMultiDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('trash.deletePermanently')
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
