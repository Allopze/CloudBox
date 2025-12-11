import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Folder } from '../../types';
import { useFileStore } from '../../stores/fileStore';
import { useDragDropStore } from '../../stores/dragDropStore';
import {
  FolderIcon,
  Star,
  Share2,
  Trash2,
  Edit,
  Move,
  FileArchive,
  Info,
} from 'lucide-react';
import { formatDate, cn } from '../../lib/utils';

import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import ShareModal from '../modals/ShareModal';
import RenameModal from '../modals/RenameModal';
import MoveModal from '../modals/MoveModal';
import CompressModal from '../modals/CompressModal';
import InfoModal from '../modals/InfoModal';
import ContextMenu, { ContextMenuItemOrDivider, ContextMenuDividerItem } from '../ui/ContextMenu';
import { motion } from 'framer-motion';

interface FolderCardProps {
  folder: Folder;
  view?: 'grid' | 'list';
  onRefresh?: () => void;
}

export default function FolderCard({ folder, view = 'grid', onRefresh }: FolderCardProps) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();
  const isSelected = useFileStore(useCallback((state) => state.selectedItems.has(folder.id), [folder.id]));
  const addToSelection = useFileStore((state) => state.addToSelection);
  const removeFromSelection = useFileStore((state) => state.removeFromSelection);
  const selectRange = useFileStore((state) => state.selectRange);
  const selectSingle = useFileStore((state) => state.selectSingle);
  const clearSelection = useFileStore((state) => state.clearSelection);
  const { draggedItems } = useDragDropStore();
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuSelection, setContextMenuSelection] = useState<Set<string>>(new Set());
  const dragData = useMemo(() => JSON.stringify(folder), [folder]);

  // Check if this folder is being dragged (can't drop on itself)
  const isSelfDragged = draggedItems.some(item => item.type === 'folder' && item.item.id === folder.id);

  // dnd-kit draggable hook
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    isDragging,
  } = useDraggable({
    id: folder.id,
    data: { type: 'folder', item: folder },
  });

  // dnd-kit droppable hook
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: folder.id,
    data: { type: 'folder', item: folder },
    disabled: isSelfDragged,
  });

  // Combine refs for both draggable and droppable
  const setNodeRef = (node: HTMLElement | null) => {
    setDraggableRef(node);
    setDroppableRef(node);
  };

  // Apply transform style when dragging - completely hide from view
  const dragStyle: React.CSSProperties | undefined = isDragging ? {
    visibility: 'hidden',
    position: 'fixed',
    top: -9999,
    left: -9999,
    pointerEvents: 'none',
  } : transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  // Close context menu when location changes
  useEffect(() => {
    setContextMenu(null);
  }, [location.pathname, location.search]);

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
    // Don't handle click if we're dragging
    if (isDragging) return;

    const { selectedItems: _selectedItems, lastSelectedId } = useFileStore.getState();

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
    clearSelection();
    setSearchParams({ folder: folder.id });
  };

  const handleFavorite = useCallback(async () => {
    setContextMenu(null);
    try {
      await api.patch(`/folders/${folder.id}/favorite`);
      toast(folder.isFavorite ? t('folderCard.removedFromFavorites') : t('folderCard.addedToFavorites'), 'success');
      onRefresh?.();
    } catch {
      toast(t('folderCard.favoriteError'), 'error');
    }
  }, [folder.id, folder.isFavorite, t, onRefresh]);

  // Context menu items configuration
  const contextMenuItems: ContextMenuItemOrDivider[] = useMemo(() => [
    { id: 'favorite', label: folder.isFavorite ? t('folderCard.removeFromFavorites') : t('folderCard.addToFavorites'), icon: Star, onClick: handleFavorite },
    { id: 'share', label: t('folderCard.share'), icon: Share2, onClick: () => setShowShareModal(true) },
    ContextMenuDividerItem(),
    { id: 'rename', label: t('folderCard.rename'), icon: Edit, onClick: () => setShowRenameModal(true) },
    { id: 'move', label: t('folderCard.move'), icon: Move, onClick: () => setShowMoveModal(true) },
    { id: 'compress', label: t('folderCard.compress'), icon: FileArchive, onClick: () => setShowCompressModal(true) },
    ContextMenuDividerItem(),
    { id: 'info', label: t('common.info'), icon: Info, onClick: () => setShowInfoModal(true) },
    {
      id: 'delete',
      label: t('folderCard.moveToTrash'),
      icon: Trash2,
      onClick: () => {
        const ids = contextMenuSelection.size > 1 && contextMenuSelection.has(folder.id)
          ? Array.from(contextMenuSelection)
          : [folder.id];
        window.dispatchEvent(new CustomEvent('file-delete-request', { detail: { ids } }));
        setContextMenu(null);
      },
      danger: true,
    },
  ], [t, folder.isFavorite, handleFavorite, contextMenuSelection, folder.id]);

  const closeContextMenu = () => setContextMenu(null);

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
      <InfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        item={folder}
        type="folder"
      />
    </>
  );

  // Calculate drop target styling
  const isDropTarget = isOver && !isSelfDragged;

  if (view === 'list') {
    return (
      <>
        <motion.div
          layout
          transition={{ layout: { duration: 0.2, ease: 'easeOut' } }}
          ref={setNodeRef}
          style={{
            ...dragStyle,
            transform: dragStyle?.transform || (isSelected ? 'scale(0.98)' : 'scale(1)'),
          }}
          {...attributes}
          {...listeners}
          data-folder-item={folder.id}
          data-folder-name={folder.name}
          data-folder-data={dragData}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all duration-100 touch-none',
            isSelected
              ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/50 ring-offset-1 ring-offset-white dark:ring-offset-dark-900'
              : 'hover:bg-dark-50 dark:hover:bg-dark-800',
            isDropTarget && 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/30'
          )}
        >
          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
            <FolderIcon className="w-6 h-6 text-primary-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-dark-900 dark:text-white truncate">{folder.name}</p>
            <p className="text-sm text-dark-500">{t('folderCard.itemsCount', { count: folder._count?.files ?? 0 })} - {formatDate(folder.createdAt)}</p>
          </div>
          {folder.isFavorite && <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
        </motion.div>
        <ContextMenu items={contextMenuItems} position={contextMenu} onClose={closeContextMenu} />
        {modals}
      </>
    );
  }

  return (
    <>
      <motion.div
        layout
        transition={{ layout: { duration: 0.2, ease: 'easeOut' } }}
        ref={setNodeRef}
        style={{
          ...dragStyle,
          transform: dragStyle?.transform || (isSelected ? 'scale(0.97)' : 'scale(1)'),
        }}
        {...attributes}
        {...listeners}
        data-folder-item={folder.id}
        data-folder-name={folder.name}
        data-folder-data={dragData}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'group relative flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all duration-100 border touch-none',
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 ring-2 ring-primary-500/40 ring-offset-1 ring-offset-white dark:ring-offset-dark-900'
            : 'bg-white dark:bg-dark-800 border-dark-100 dark:border-dark-700 hover:border-dark-200 dark:hover:border-dark-600',
          isDropTarget && 'ring-2 ring-primary-500 border-primary-500 bg-primary-50 dark:bg-primary-900/30'
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
      <ContextMenu items={contextMenuItems} position={contextMenu} onClose={closeContextMenu} />
      {modals}
    </>
  );
}
