import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Folder, FileItem } from '../../types';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useFileStore } from '../../stores/fileStore';
import { useGlobalProgressStore } from '../../stores/globalProgressStore';
import { useDragDropStore, DragItem } from '../../stores/dragDropStore';
import { useAuthStore } from '../../stores/authStore';
import {
  FolderIcon,
  Star,
  Share2,
  Trash2,
  Edit,
  Move,
  FileArchive,
} from 'lucide-react';
import { formatDate, cn } from '../../lib/utils';

import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import ShareModal from '../modals/ShareModal';
import RenameModal from '../modals/RenameModal';
import MoveModal from '../modals/MoveModal';
import CompressModal from '../modals/CompressModal';
import ConfirmModal from '../ui/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';

interface FolderCardProps {
  folder: Folder;
  view?: 'grid' | 'list';
  onRefresh?: () => void;
}

export default function FolderCard({ folder, view = 'grid', onRefresh }: FolderCardProps) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { selectedItems, addToSelection, removeFromSelection, selectRange, selectSingle, lastSelectedId } = useFileStore();
  const { addOperation, incrementProgress, completeOperation, failOperation } = useGlobalProgressStore();
  const { draggedItems, startDrag, updatePosition, endDrag } = useDragDropStore();
  const { refreshUser } = useAuthStore();
  const isSelected = selectedItems.has(folder.id);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuSelection, setContextMenuSelection] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Check if this folder is being dragged (can't drop on itself)
  const isSelfDragged = draggedItems.some(item => item.type === 'folder' && item.item.id === folder.id);

  // Close context menu when location changes
  useEffect(() => {
    setContextMenu(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleScroll = () => setContextMenu(null);
    const handleContextMenuGlobal = () => setContextMenu(null);

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      document.addEventListener('contextmenu', handleContextMenuGlobal, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('contextmenu', handleContextMenuGlobal, true);
      };
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Get fresh state from store to ensure we have the latest selection
    const currentSelectedItems = useFileStore.getState().selectedItems;

    // If this item is not already selected, select only this item
    // If it's already selected (possibly as part of multi-select), keep the selection
    if (!currentSelectedItems.has(folder.id)) {
      selectSingle(folder.id);
      // Save the new selection (just this folder)
      setContextMenuSelection(new Set([folder.id]));
    } else {
      // Save the current multi-selection for use in context menu actions
      setContextMenuSelection(new Set(currentSelectedItems));
    }

    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleClick = (e: React.MouseEvent) => {
    // Shift+Click: Range selection
    if (e.shiftKey && lastSelectedId) {
      // Get all file items in the DOM to determine range
      const allItems = Array.from(document.querySelectorAll('[data-file-item], [data-folder-item]'));
      const ids = allItems.map(el => el.getAttribute('data-file-item') || el.getAttribute('data-folder-item')).filter(Boolean) as string[];
      selectRange(ids, folder.id);
    }
    // Ctrl/Meta+Click: Toggle selection
    else if (e.ctrlKey || e.metaKey) {
      if (isSelected) {
        removeFromSelection(folder.id);
      } else {
        addToSelection(folder.id);
      }
    }
    // Simple click: Select only this item
    else {
      selectSingle(folder.id);
    }
  };

  // Double click to navigate into folder
  const handleDoubleClick = () => {
    setSearchParams({ folder: folder.id });
  };

  const handleFavorite = async () => {
    setContextMenu(null);
    try {
      await api.patch(`/folders/${folder.id}/favorite`);
      toast(folder.isFavorite ? t('folderCard.removedFromFavorites') : t('folderCard.addedToFavorites'), 'success');
      onRefresh?.();
    } catch {
      toast(t('folderCard.favoriteError'), 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    setShowDeleteConfirm(false);

    // Use the selection that was captured when the context menu was opened
    const itemsToDelete = contextMenuSelection;
    const clearSelectionFn = useFileStore.getState().clearSelection;

    // If multiple items are selected and this folder is one of them, delete all selected
    if (itemsToDelete.size > 1 && itemsToDelete.has(folder.id)) {
      const itemIds = Array.from(itemsToDelete);
      const total = itemIds.length;

      const opId = addOperation({
        id: `delete-context-${Date.now()}`,
        type: 'delete',
        title: t('folderCard.deletingItems', { count: total }),
        totalItems: total,
      });

      try {
        for (const id of itemIds) {
          const fileEl = document.querySelector(`[data-file-item="${id}"]`);
          const folderEl = document.querySelector(`[data-folder-item="${id}"]`);
          const itemName = fileEl?.getAttribute('data-file-name') || folderEl?.getAttribute('data-folder-name') || id;

          if (fileEl) {
            await api.delete(`/files/${id}`);
          } else if (folderEl) {
            await api.delete(`/folders/${id}`);
          }
          incrementProgress(opId, itemName);
        }

        completeOperation(opId);
        clearSelectionFn();
        toast(t('folderCard.itemsMovedToTrash', { count: total }), 'success');
        // Trigger refresh event and call onRefresh
        window.dispatchEvent(new CustomEvent('workzone-refresh'));
        onRefresh?.();
        refreshUser(); // Update storage info in sidebar
      } catch {
        failOperation(opId, t('folderCard.deleteError'));
        toast(t('folderCard.deleteError'), 'error');
      }
    } else {
      // Single item delete
      try {
        await api.delete(`/folders/${folder.id}`);
        toast(t('folderCard.folderMovedToTrash'), 'success');
        // Trigger refresh event and call onRefresh
        window.dispatchEvent(new CustomEvent('workzone-refresh'));
        onRefresh?.();
        refreshUser(); // Update storage info in sidebar
      } catch {
        toast(t('folderCard.deleteFolderError'), 'error');
      }
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();

    const currentSelectedItems = useFileStore.getState().selectedItems;
    let itemsToDrag: DragItem[] = [];

    // If this folder is selected and there are multiple selections, drag all selected items
    if (currentSelectedItems.has(folder.id) && currentSelectedItems.size > 1) {
      // Get all selected items from the DOM
      currentSelectedItems.forEach(id => {
        const folderEl = document.querySelector(`[data-folder-item="${id}"]`);
        const fileEl = document.querySelector(`[data-file-item="${id}"]`);

        if (folderEl) {
          const folderData = folderEl.getAttribute('data-folder-data');
          if (folderData) {
            itemsToDrag.push({ type: 'folder', item: JSON.parse(folderData) });
          }
        } else if (fileEl) {
          const fileData = fileEl.getAttribute('data-file-data');
          if (fileData) {
            itemsToDrag.push({ type: 'file', item: JSON.parse(fileData) });
          }
        }
      });
    }

    // If no items collected or this folder wasn't selected, just drag this folder
    if (itemsToDrag.length === 0) {
      itemsToDrag = [{ type: 'folder', item: folder }];
      selectSingle(folder.id);
    }

    startDrag(itemsToDrag);

    // Set drag data for compatibility
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(itemsToDrag.map(i => ({ type: i.type, id: i.item.id }))));

    // Hide default drag image
    const emptyImg = document.createElement('img');
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(emptyImg, 0, 0);
  };

  const handleDrag = (e: React.DragEvent) => {
    if (e.clientX !== 0 || e.clientY !== 0) {
      updatePosition(e.clientX, e.clientY);
    }
  };

  const handleDragEnd = () => {
    endDrag();
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Don't allow dropping on itself
    if (isSelfDragged) return;

    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Don't allow dropping on itself
    if (isSelfDragged) return;

    const items = draggedItems;
    endDrag();

    if (items.length === 0) return;

    const clearSelectionFn = useFileStore.getState().clearSelection;

    try {
      for (const dragItem of items) {
        // Skip if trying to move a folder into itself
        if (dragItem.type === 'folder' && dragItem.item.id === folder.id) continue;
        // Skip if item is already in this folder
        if (dragItem.type === 'file' && (dragItem.item as FileItem).folderId === folder.id) continue;
        if (dragItem.type === 'folder' && (dragItem.item as Folder).parentId === folder.id) continue;

        if (dragItem.type === 'file') {
          await api.patch(`/files/${dragItem.item.id}/move`, { folderId: folder.id });
        } else {
          await api.patch(`/folders/${dragItem.item.id}/move`, { parentId: folder.id });
        }
      }

      toast(t('folderCard.itemsMovedTo', { count: items.length, name: folder.name }), 'success');
      clearSelectionFn();
      window.dispatchEvent(new CustomEvent('workzone-refresh'));
      onRefresh?.();
    } catch (error: any) {
      toast(error.response?.data?.error || t('folderCard.moveError'), 'error');
    }
  };

  const contextMenuContent = contextMenu ? createPortal(
    <AnimatePresence>
      <motion.div
        ref={contextMenuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className="fixed z-[9999] min-w-[180px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 overflow-hidden"
        style={{ top: contextMenu.y, left: contextMenu.x }}
      >
        <button
          onClick={handleFavorite}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700"
        >
          <Star className="w-4 h-4" /> {folder.isFavorite ? t('folderCard.removeFromFavorites') : t('folderCard.addToFavorites')}
        </button>
        <button
          onClick={() => { setContextMenu(null); setShowShareModal(true); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700"
        >
          <Share2 className="w-4 h-4" /> {t('folderCard.share')}
        </button>
        <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
        <button
          onClick={() => { setContextMenu(null); setShowRenameModal(true); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700"
        >
          <Edit className="w-4 h-4" /> {t('folderCard.rename')}
        </button>
        <button
          onClick={() => { setContextMenu(null); setShowMoveModal(true); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700"
        >
          <Move className="w-4 h-4" /> {t('folderCard.move')}
        </button>
        <button
          onClick={() => { setContextMenu(null); setShowCompressModal(true); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700"
        >
          <FileArchive className="w-4 h-4" /> {t('folderCard.compress')}
        </button>
        <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
        <button
          onClick={() => { setContextMenu(null); setShowDeleteConfirm(true); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 className="w-4 h-4" /> {t('folderCard.moveToTrash')}
        </button>
      </motion.div>
    </AnimatePresence>,
    document.body
  ) : null;

  const modals = (
    <>
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        folder={folder}
        onSuccess={onRefresh}
      />
      <RenameModal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        item={folder}
        type="folder"
        onSuccess={onRefresh}
      />
      <MoveModal
        isOpen={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        items={[folder]}
        onSuccess={onRefresh}
      />
      <CompressModal
        isOpen={showCompressModal}
        onClose={() => setShowCompressModal(false)}
        items={[{ id: folder.id, name: folder.name, type: 'folder' }]}
        onSuccess={onRefresh}
      />
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        title={t('modals.confirm.deleteTitle')}
        message={
          <div className="space-y-2">
            <p>{t('modals.confirm.deleteMessage', { count: contextMenuSelection.size > 1 && contextMenuSelection.has(folder.id) ? contextMenuSelection.size : 1 })}</p>
            <p className="text-sm text-dark-400">{t('modals.confirm.deleteNote')}</p>
          </div>
        }
        confirmText={t('modals.confirm.deleteButton')}
        cancelText={t('modals.confirm.cancelButton')}
        variant="warning"
      />
    </>
  );

  if (view === 'list') {
    return (
      <>
        <motion.div
          data-folder-item={folder.id}
          data-folder-name={folder.name}
          data-folder-data={JSON.stringify(folder)}
          draggable
          onDragStart={handleDragStart as any}
          onDrag={handleDrag as any}
          onDragEnd={handleDragEnd as any}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          animate={isSelected ? { scale: 0.98 } : { scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors',
            isSelected
              ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/50 ring-offset-1 ring-offset-white dark:ring-offset-dark-900'
              : 'hover:bg-dark-50 dark:hover:bg-dark-800',
            isDragOver && !isSelfDragged && 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/30'
          )}
        >
          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
            <FolderIcon className="w-6 h-6 text-primary-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-dark-900 dark:text-white truncate">{folder.name}</p>
            <p className="text-sm text-dark-500">{t('folderCard.itemsCount', { count: folder._count?.files ?? 0 })} • {formatDate(folder.createdAt)}</p>
          </div>
          {folder.isFavorite && <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
        </motion.div>
        {contextMenuContent}
        {modals}
      </>
    );
  }

  return (
    <>
      <motion.div
        data-folder-item={folder.id}
        data-folder-name={folder.name}
        data-folder-data={JSON.stringify(folder)}
        draggable
        onDragStart={handleDragStart as any}
        onDrag={handleDrag as any}
        onDragEnd={handleDragEnd as any}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        animate={isSelected ? { scale: 0.97 } : { scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'group relative flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all border',
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 ring-2 ring-primary-500/40 ring-offset-1 ring-offset-white dark:ring-offset-dark-900'
            : 'bg-white dark:bg-dark-800 border-dark-100 dark:border-dark-700 hover:border-dark-200 dark:hover:border-dark-600',
          isDragOver && !isSelfDragged && 'ring-2 ring-primary-500 border-primary-500 bg-primary-50 dark:bg-primary-900/30'
        )}
      >
        <FolderIcon className="w-6 h-6 text-primary-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-900 dark:text-white truncate">{folder.name}</p>
        </div>
        {folder.isFavorite && (
          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
        )}
      </motion.div>
      {contextMenuContent}
      {modals}
    </>
  );
}
