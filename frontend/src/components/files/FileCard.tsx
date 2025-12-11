import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { FileItem } from '../../types';
import { useFileStore } from '../../stores/fileStore';
import {
  File,
  Image,
  Video,
  Music,
  FileText,
  Archive,
  Star,
  Download,
  Share2,
  Trash2,
  Edit,
  Move,
  FileArchive,
  Info,
} from 'lucide-react';
import { formatBytes, formatDate, cn } from '../../lib/utils';
import { api, getFileUrl } from '../../lib/api';
import { toast } from '../ui/Toast';
import AuthenticatedImage from '../AuthenticatedImage';
import ShareModal from '../modals/ShareModal';
import RenameModal from '../modals/RenameModal';
import MoveModal from '../modals/MoveModal';
import CompressModal from '../modals/CompressModal';
import InfoModal from '../modals/InfoModal';
import ContextMenu, { ContextMenuItemOrDivider, ContextMenuDividerItem } from '../ui/ContextMenu';
import { motion } from 'framer-motion';

interface FileCardProps {
  file: FileItem;
  view?: 'grid' | 'list';
  onRefresh?: () => void;
  onPreview?: (file: FileItem) => void;
}

const fileIcons: Record<string, typeof File> = {
  image: Image,
  video: Video,
  audio: Music,
  document: FileText,
  archive: Archive,
  default: File,
};

export default function FileCard({ file, view = 'grid', onRefresh, onPreview }: FileCardProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isSelected = useFileStore(useCallback((state) => state.selectedItems.has(file.id), [file.id]));
  const addToSelection = useFileStore((state) => state.addToSelection);
  const removeFromSelection = useFileStore((state) => state.removeFromSelection);
  const selectRange = useFileStore((state) => state.selectRange);
  const selectSingle = useFileStore((state) => state.selectSingle);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuSelection, setContextMenuSelection] = useState<Set<string>>(new Set());

  // dnd-kit draggable hook
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: file.id,
    data: { type: 'file', item: file },
  });

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
    if (!currentSelectedItems.has(file.id)) {
      selectSingle(file.id);
      // Save the new selection (just this file)
      setContextMenuSelection(new Set([file.id]));
    } else {
      // Save the current multi-selection for use in context menu actions
      setContextMenuSelection(new Set(currentSelectedItems));
    }

    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const getFileIcon = () => {
    const mimeCategory = file.mimeType.split('/')[0];
    const Icon = fileIcons[mimeCategory] || fileIcons.default;
    return Icon;
  };

  const Icon = getFileIcon();
  const hasThumbnail = Boolean(file.thumbnailPath);
  const dragData = useMemo(() => JSON.stringify(file), [file]);

  const handleClick = (e: React.MouseEvent) => {
    // Don't handle click if we're dragging
    if (isDragging) return;

    const { selectedItems, lastSelectedId } = useFileStore.getState();

    // Shift+Click: Range selection
    if (e.shiftKey && lastSelectedId) {
      // Get all file items in the DOM to determine range
      const allItems = Array.from(document.querySelectorAll('[data-file-item], [data-folder-item]'));
      const ids = allItems.map(el => el.getAttribute('data-file-item') || el.getAttribute('data-folder-item')).filter(Boolean) as string[];
      selectRange(ids, file.id);
    }
    // Ctrl/Meta+Click: Toggle selection
    else if (e.ctrlKey || e.metaKey) {
      if (isSelected) {
        removeFromSelection(file.id);
      } else {
        addToSelection(file.id);
      }
    }
    // Simple click: Select only this item or open if already selected
    else {
      if (isSelected && selectedItems.size === 1) {
        // Use onPreview if provided, otherwise open in new tab
        if (onPreview) {
          onPreview(file);
        } else {
          window.open(getFileUrl(file.id, 'view'), '_blank');
        }
      } else {
        selectSingle(file.id);
      }
    }
  };

  // Handle double click to always preview
  const handleDoubleClick = () => {
    if (onPreview) {
      onPreview(file);
    } else {
      window.open(getFileUrl(file.id, 'view'), '_blank');
    }
  };

  const handleDownload = () => {
    setContextMenu(null);
    window.open(getFileUrl(file.id, 'download', true), '_blank');
  };

  const handleFavorite = async () => {
    setContextMenu(null);
    try {
      await api.patch(`/files/${file.id}/favorite`);
      toast(file.isFavorite ? t('fileCard.removedFromFavorites') : t('fileCard.addedToFavorites'), 'success');
      onRefresh?.();
    } catch {
      toast(t('fileCard.favoriteError'), 'error');
    }
  };

  // Context menu items configuration
  const contextMenuItems: ContextMenuItemOrDivider[] = useMemo(() => [
    { id: 'download', label: t('fileCard.download'), icon: Download, onClick: handleDownload },
    { id: 'favorite', label: file.isFavorite ? t('fileCard.removeFromFavorites') : t('fileCard.addToFavorites'), icon: Star, onClick: handleFavorite },
    { id: 'share', label: t('fileCard.share'), icon: Share2, onClick: () => setShowShareModal(true) },
    ContextMenuDividerItem(),
    { id: 'rename', label: t('fileCard.rename'), icon: Edit, onClick: () => setShowRenameModal(true) },
    { id: 'move', label: t('fileCard.move'), icon: Move, onClick: () => setShowMoveModal(true) },
    { id: 'compress', label: t('fileCard.compress'), icon: FileArchive, onClick: () => setShowCompressModal(true) },
    ContextMenuDividerItem(),
    { id: 'info', label: t('common.info'), icon: Info, onClick: () => setShowInfoModal(true) },
    {
      id: 'delete',
      label: t('fileCard.moveToTrash'),
      icon: Trash2,
      onClick: () => {
        // Determine which ids to delete (respect multi-selection captured on context menu open)
        const ids = contextMenuSelection.size > 1 && contextMenuSelection.has(file.id)
          ? Array.from(contextMenuSelection)
          : [file.id];
        window.dispatchEvent(new CustomEvent('file-delete-request', { detail: { ids } }));
        setContextMenu(null);
      },
      danger: true,
    },
  ], [t, file.isFavorite, handleDownload, handleFavorite, contextMenuSelection, file.id]);

  const closeContextMenu = () => setContextMenu(null);

  const modals = (
    <>
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        file={file}
        onSuccess={onRefresh}
      />
      <RenameModal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        item={file}
        type="file"
        onSuccess={onRefresh}
      />
      <MoveModal
        isOpen={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        items={[file]}
        onSuccess={onRefresh}
      />
      <CompressModal
        isOpen={showCompressModal}
        onClose={() => setShowCompressModal(false)}
        items={[{ id: file.id, name: file.name, type: 'file' }]}
        onSuccess={onRefresh}
      />
      <InfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        item={file}
        type="file"
      />
    </>
  );

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
          data-file-item={file.id}
          data-file-name={file.name}
          data-file-data={dragData}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all duration-100 touch-none',
            isSelected
              ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/50 ring-offset-1 ring-offset-white dark:ring-offset-dark-900'
              : 'hover:bg-dark-50 dark:hover:bg-dark-800'
          )}
        >
          <div className="w-9 h-9 flex-shrink-0">
            {hasThumbnail ? (
              <AuthenticatedImage
                fileId={file.id}
                endpoint="thumbnail"
                alt={file.name}
                className="w-full h-full object-cover rounded"
                fallback={
                  <div className="w-full h-full flex items-center justify-center bg-dark-50 dark:bg-dark-700 rounded">
                    <Icon className="w-5 h-5 text-dark-400" />
                  </div>
                }
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon className="w-5 h-5 text-dark-400" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-dark-900 dark:text-white truncate">{file.name}</p>
            <p className="text-sm text-dark-500">{formatBytes(file.size)} - {formatDate(file.createdAt)}</p>
          </div>
          {file.isFavorite && <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
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
        data-file-item={file.id}
        data-file-name={file.name}
        data-file-data={dragData}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'group relative flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all duration-100 border touch-none',
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 ring-2 ring-primary-500/40 ring-offset-1 ring-offset-white dark:ring-offset-dark-900'
            : 'bg-white dark:bg-dark-800 border-dark-100 dark:border-dark-700 hover:border-dark-200 dark:hover:border-dark-600'
        )}
      >
        <div className="w-8 h-8 flex-shrink-0 rounded overflow-hidden bg-dark-50 dark:bg-dark-700">
          {hasThumbnail ? (
            <AuthenticatedImage
              fileId={file.id}
              endpoint="thumbnail"
              alt={file.name}
              className="w-full h-full object-cover"
              fallback={
                <div className="w-full h-full flex items-center justify-center">
                  <Icon className="w-5 h-5 text-dark-400" />
                </div>
              }
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon className="w-5 h-5 text-dark-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-900 dark:text-white truncate">{file.name}</p>
        </div>
        {file.isFavorite && (
          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
        )}
      </motion.div>
      <ContextMenu items={contextMenuItems} position={contextMenu} onClose={closeContextMenu} />
      {modals}
    </>
  );
}
