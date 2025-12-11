import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Folder } from '../../types';
import { useFileStore } from '../../stores/fileStore';
import { useDragDropStore } from '../../stores/dragDropStore';
import {
  Star,
  Share2,
  Trash2,
  Edit,
  Move,
  FileArchive,
  Info,
  Download,
  Loader2,
} from 'lucide-react';
import { SolidFolderIcon } from '../icons/SolidIcons';
import { formatDate, cn } from '../../lib/utils';

import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import ShareModal from '../modals/ShareModal';
import RenameModal from '../modals/RenameModal';
import MoveModal from '../modals/MoveModal';
import CompressModal from '../modals/CompressModal';
import InfoModal from '../modals/InfoModal';
import ContextMenu, { ContextMenuItemOrDivider, ContextMenuDividerItem } from '../ui/ContextMenu';
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ progress: 0, currentFile: '' });
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

  // Download folder as ZIP
  const handleDownloadAsZip = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress({ progress: 0, currentFile: '' });

    try {
      // Start compression job
      const response = await api.post('/compression/compress', {
        paths: [folder.id],
        format: 'zip',
        outputName: folder.name,
      });

      const { jobId } = response.data;

      // Poll for completion with progress updates
      const pollForCompletion = async (): Promise<string | null> => {
        const statusResponse = await api.get(`/compression/status/${jobId}`);
        const { status, error, outputFileId, progress, currentFile } = statusResponse.data;

        // Update progress
        setDownloadProgress({
          progress: progress || 0,
          currentFile: currentFile || ''
        });

        if (status === 'COMPLETED' && outputFileId) {
          setDownloadProgress({ progress: 100, currentFile: '' });
          return outputFileId;
        }

        if (status === 'FAILED') {
          throw new Error(error || t('folderCard.downloadError'));
        }

        // Continue polling
        await new Promise(resolve => setTimeout(resolve, 300));
        return pollForCompletion();
      };

      const outputFileId = await pollForCompletion();

      if (outputFileId) {
        // Download the ZIP file
        window.open(`/api/files/${outputFileId}/download?attachment=true`, '_blank');
        toast(t('folderCard.downloadStarted'), 'success');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('folderCard.downloadError');
      toast(message, 'error');
    } finally {
      setIsDownloading(false);
      setDownloadProgress({ progress: 0, currentFile: '' });
    }
  }, [folder.id, folder.name, isDownloading, t]);

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
      {/* Download Progress Modal */}
      <AnimatePresence>
        {isDownloading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-dark-200 dark:border-dark-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                    <Download className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-dark-900 dark:text-white">
                      {t('folderCard.downloadAsZip')}
                    </h2>
                    <p className="text-xs text-dark-500 dark:text-dark-400 truncate max-w-[200px]">
                      {folder.name}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Content */}
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-600 dark:text-dark-400 truncate max-w-[200px]">
                      {downloadProgress.currentFile || t('folderCard.preparingDownload')}
                    </span>
                    <span className="text-dark-900 dark:text-white font-medium ml-2">
                      {Math.round(downloadProgress.progress)}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-dark-100 dark:bg-dark-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${downloadProgress.progress}%` }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    />
                  </div>
                </div>
                <p className="text-xs text-center text-dark-500 dark:text-dark-400">
                  {t('folderCard.compressingFolder')}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
          style={dragStyle}
          {...attributes}
          {...listeners}
          data-folder-item={folder.id}
          data-folder-name={folder.name}
          data-folder-data={dragData}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          tabIndex={0}
          className={cn(
            'premium-card-list group',
            isSelected && 'selected',
            isDragging && 'dragging',
            isDropTarget && 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/30'
          )}
        >
          {/* Folder Icon */}
          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30">
            <SolidFolderIcon size={20} className="text-primary-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-dark-900 dark:text-dark-50 truncate">{folder.name}</p>
            <p className="text-xs text-dark-500 dark:text-dark-400">
              {t('folderCard.itemsCount', { count: folder._count?.files ?? 0 })} · {formatDate(folder.createdAt)}
            </p>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {folder.isFavorite && (
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            )}
          </div>
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
        style={dragStyle}
        {...attributes}
        {...listeners}
        data-folder-item={folder.id}
        data-folder-name={folder.name}
        data-folder-data={dragData}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        className={cn(
          'premium-card group',
          isSelected && 'selected',
          isDragging && 'dragging',
          isDropTarget && 'drop-target'
        )}
      >
        {/* Quick Actions - visible on hover */}
        <div className="premium-card-actions">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowShareModal(true); }}
            className="premium-card-action-btn"
            title={t('folderCard.share')}
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); handleDownloadAsZip(); }}
            className="premium-card-action-btn"
            title={t('folderCard.downloadAsZip')}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Favorite badge */}
        {folder.isFavorite && (
          <div className="premium-card-badges">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-md" />
          </div>
        )}

        {/* Folder Icon Area */}
        <div className="premium-card-thumbnail">
          <SolidFolderIcon size={60} className="text-primary-500" />
        </div>

        {/* Content Area - Overlay at bottom */}
        <div className="premium-card-content">
          <p className="premium-card-name" title={folder.name}>
            {folder.name}
          </p>
          <div className="premium-card-meta">
            <span>{t('folderCard.itemsCount', { count: folder._count?.files ?? 0 })}</span>
            <span>·</span>
            <span>{formatDate(folder.createdAt)}</span>
          </div>
        </div>
      </motion.div>
      <ContextMenu items={contextMenuItems} position={contextMenu} onClose={closeContextMenu} />
      {modals}
    </>
  );
}
