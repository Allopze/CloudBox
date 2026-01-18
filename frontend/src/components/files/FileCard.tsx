import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useLongPress } from '../../hooks/useLongPress';
import { useTouchDevice } from '../../hooks/useTouchDevice';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { FileItem } from '../../types';
import { useFileStore } from '../../stores/fileStore';
import { useDragDropStore } from '../../stores/dragDropStore';
import {
  Star,
  Download,
  Share2,
  Trash2,
  Edit,
  Move,
  FileArchive,
  Info,
  Eye,
  Tag,
  History,
  MoreHorizontal,
} from 'lucide-react';
import { formatBytes, formatDate, cn } from '../../lib/utils';
import { api, openSignedFileUrl } from '../../lib/api';
import { toast } from '../ui/Toast';
import ShareModal from '../modals/ShareModal';
import RenameModal from '../modals/RenameModal';
import MoveModal from '../modals/MoveModal';
import CompressModal from '../modals/CompressModal';
import InfoModal from '../modals/InfoModal';
import TagModal from '../modals/TagModal';
import VersionHistory from './VersionHistory';
import ContextMenu, { ContextMenuItemOrDivider, ContextMenuDividerItem } from '../ui/ContextMenu';
import { motion, useReducedMotion } from 'framer-motion';
import { FileExtensionIcon } from '../icons/SolidIcons';
import AuthenticatedImage from '../AuthenticatedImage';

interface FileCardProps {
  file: FileItem;
  view?: 'grid' | 'list';
  onRefresh?: () => void;
  onPreview?: (file: FileItem) => void;
  onFavoriteToggle?: (fileId: string, isFavorite: boolean) => void;
  disableAnimation?: boolean;
}

// Get color based on file category
function getFileTypeColor(mimeType: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeCategory = mimeType.split('/')[0];

  // Multimedia
  if (mimeCategory === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'tiff', 'heic'].includes(ext)) return 'text-emerald-500';
  if (mimeCategory === 'video' || ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) return 'text-indigo-500';
  if (mimeCategory === 'audio' || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'mid', 'midi'].includes(ext)) return 'text-fuchsia-500';

  // Documents
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'text-primary-600'; // Rojo CloudBox
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || mimeType.includes('word')) return 'text-blue-600';
  if (['xls', 'xlsx', 'ods'].includes(ext) || mimeType.includes('spreadsheet')) return 'text-green-600';
  if (['ppt', 'pptx', 'odp'].includes(ext) || mimeType.includes('presentation')) return 'text-orange-500';
  if (ext === 'csv') return 'text-teal-600';
  if (['txt', 'log'].includes(ext) || mimeType === 'text/plain') return 'text-slate-500';
  if (ext === 'md') return 'text-sky-500';
  if (['epub', 'mobi', 'azw3'].includes(ext)) return 'text-amber-700';

  // Suite Office Extra
  if (ext === 'one') return 'text-purple-600';
  if (['accdb', 'mdb'].includes(ext)) return 'text-red-700';
  if (ext === 'pub') return 'text-teal-700';

  // Programming & DB
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sh'].includes(ext)) return 'text-violet-600';
  if (['sql', 'sqlite'].includes(ext)) return 'text-blue-700';

  // Design Professional
  if (ext === 'ai') return 'text-orange-700';
  if (ext === 'psd') return 'text-blue-800';
  if (ext === 'indd') return 'text-pink-700';
  if (ext === 'fig') return 'text-purple-500';
  if (ext === 'svg' || mimeType === 'image/svg+xml') return 'text-yellow-600';

  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mimeType.includes('zip') || mimeType.includes('archive')) return 'text-amber-500';

  // Systems & Installers
  if (['exe', 'msi', 'dmg', 'pkg', 'apk', 'ipa'].includes(ext)) return 'text-slate-700';
  if (['deb', 'rpm'].includes(ext)) return 'text-zinc-800';

  // Default
  return 'text-dark-400';
}

// Get file extension from filename
function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}



const FileCard = memo(function FileCard({ file, view = 'grid', onRefresh, onPreview, onFavoriteToggle, disableAnimation }: FileCardProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const isTouchDevice = useTouchDevice();
  const location = useLocation();
  const isSelected = useFileStore(useCallback((state) => state.selectedItems.has(file.id), [file.id]));
  // Use getState() for action functions to avoid unnecessary subscriptions
  const { addToSelection, removeFromSelection, selectRange, selectSingle } = useFileStore.getState();
  const { isDragging: isGlobalDragging } = useDragDropStore();
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuSelection, setContextMenuSelection] = useState<Set<string>>(new Set());

  // dnd-kit draggable hook
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: file.id,
    data: { type: 'file', item: file },
  });

  // Apply transform style when dragging - completely hide from view
  const dragStyle: React.CSSProperties | undefined = (isDragging && isGlobalDragging) ? {
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

  // Helper to open context menu at a given position
  const openContextMenuAt = useCallback((position: { x: number; y: number }) => {
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

    setContextMenu(position);
  }, [file.id, selectSingle]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenuAt({ x: e.clientX, y: e.clientY });
  };

  // Long-press handler for touch devices (opens context menu)
  const longPressHandlers = useLongPress(
    (position) => {
      openContextMenuAt(position);
    },
    { delay: 500 }
  );

  // Get file extension and color for the icon
  const fileExtension = getFileExtension(file.name);
  const fileTypeColor = getFileTypeColor(file.mimeType, file.name);
  const dragData = useMemo(() => JSON.stringify(file), [file]);

  const handleClick = (e: React.MouseEvent) => {
    // Don't handle click if we're dragging
    if (isDragging) return;

    // Skip if a long-press context menu was just triggered
    if ((window as Window & { __longPressActive?: boolean }).__longPressActive) {
      return;
    }

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
          void openSignedFileUrl(file.id, 'view');
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
      void openSignedFileUrl(file.id, 'view');
    }
  };

  // Handle keyboard navigation - Enter to open, Space to select
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDoubleClick();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (isSelected) {
        removeFromSelection(file.id);
      } else {
        addToSelection(file.id);
      }
    }
  };

  const handleDownload = useCallback(() => {
    setContextMenu(null);
    void openSignedFileUrl(file.id, 'download');
  }, [file.id]);

  const handleFavorite = useCallback(async () => {
    setContextMenu(null);
    try {
      await api.patch(`/files/${file.id}/favorite`);
      toast(file.isFavorite ? t('fileCard.removedFromFavorites') : t('fileCard.addedToFavorites'), 'success');
      // Use onFavoriteToggle if available for local state update, otherwise fall back to onRefresh
      if (onFavoriteToggle) {
        onFavoriteToggle(file.id, !file.isFavorite);
      } else {
        onRefresh?.();
      }
    } catch {
      toast(t('fileCard.favoriteError'), 'error');
    }
  }, [file.id, file.isFavorite, t, onRefresh, onFavoriteToggle]);

  // State for showing full menu on mobile after clicking "More options"
  const [showFullMobileMenu, setShowFullMobileMenu] = useState(false);

  // Reset showFullMobileMenu when context menu closes
  useEffect(() => {
    if (!contextMenu) {
      setShowFullMobileMenu(false);
    }
  }, [contextMenu]);

  // All context menu items (full list)
  const allContextMenuItems: ContextMenuItemOrDivider[] = useMemo(() => [
    { id: 'open', label: t('fileCard.open'), icon: Eye, onClick: () => { setContextMenu(null); handleDoubleClick(); } },
    ContextMenuDividerItem(),
    { id: 'download', label: t('fileCard.download'), icon: Download, onClick: handleDownload },
    { id: 'favorite', label: file.isFavorite ? t('fileCard.removeFromFavorites') : t('fileCard.addToFavorites'), icon: Star, onClick: handleFavorite },
    { id: 'share', label: t('fileCard.share'), icon: Share2, onClick: () => setShowShareModal(true) },
    ContextMenuDividerItem(),
    { id: 'rename', label: t('fileCard.rename'), icon: Edit, onClick: () => setShowRenameModal(true) },
    { id: 'move', label: t('fileCard.move'), icon: Move, onClick: () => setShowMoveModal(true) },
    { id: 'compress', label: t('fileCard.compress'), icon: FileArchive, onClick: () => setShowCompressModal(true) },
    ContextMenuDividerItem(),
    { id: 'tags', label: t('tags.title'), icon: Tag, onClick: () => setShowTagModal(true) },
    { id: 'versions', label: t('versions.title'), icon: History, onClick: () => setShowVersionHistory(true) },
    { id: 'info', label: t('common.info'), icon: Info, onClick: () => setShowInfoModal(true) },
    {
      id: 'delete',
      label: t('fileCard.moveToTrash'),
      icon: Trash2,
      onClick: () => {
        const ids = contextMenuSelection.size > 1 && contextMenuSelection.has(file.id)
          ? Array.from(contextMenuSelection)
          : [file.id];
        window.dispatchEvent(new CustomEvent('file-delete-request', { detail: { ids } }));
        setContextMenu(null);
      },
      danger: true,
    },
  ], [t, file.isFavorite, handleDownload, handleFavorite, handleDoubleClick, contextMenuSelection, file.id]);

  // Mobile-reduced menu items (main actions only + "More" button)
  const mobileContextMenuItems: ContextMenuItemOrDivider[] = useMemo(() => [
    { id: 'open', label: t('fileCard.open'), icon: Eye, onClick: () => { setContextMenu(null); handleDoubleClick(); } },
    { id: 'download', label: t('fileCard.download'), icon: Download, onClick: handleDownload },
    { id: 'share', label: t('fileCard.share'), icon: Share2, onClick: () => setShowShareModal(true) },
    {
      id: 'delete',
      label: t('fileCard.moveToTrash'),
      icon: Trash2,
      onClick: () => {
        const ids = contextMenuSelection.size > 1 && contextMenuSelection.has(file.id)
          ? Array.from(contextMenuSelection)
          : [file.id];
        window.dispatchEvent(new CustomEvent('file-delete-request', { detail: { ids } }));
        setContextMenu(null);
      },
      danger: true,
    },
    ContextMenuDividerItem(),
    { id: 'more', label: t('common.moreOptions'), icon: MoreHorizontal, onClick: () => setShowFullMobileMenu(true) },
  ], [t, handleDownload, handleDoubleClick, contextMenuSelection, file.id]);

  // Choose which menu to show based on device type and state
  const contextMenuItems = useMemo(() => {
    if (!isTouchDevice) return allContextMenuItems;
    if (showFullMobileMenu) return allContextMenuItems;
    return mobileContextMenuItems;
  }, [isTouchDevice, showFullMobileMenu, allContextMenuItems, mobileContextMenuItems]);

  const closeContextMenu = () => setContextMenu(null);

  const selectionScale = view === 'list' ? 0.98 : 0.95;
  const targetScale = isSelected ? selectionScale : 1;
  const motionProps = {
    initial: disableAnimation || reducedMotion ? false : { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: targetScale },
    transition: reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 25 },
  };

  if (view === 'list') {
    return (
      <>
        <motion.div
          {...motionProps}
          ref={setNodeRef}
          style={dragStyle}
          {...attributes}
          {...listeners}
          data-file-item={file.id}
          data-file-name={file.name}
          data-file-data={dragData}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          onTouchStart={longPressHandlers.onTouchStart}
          onTouchMove={longPressHandlers.onTouchMove}
          onTouchEnd={longPressHandlers.onTouchEnd}
          onTouchCancel={longPressHandlers.onTouchCancel}
          tabIndex={0}
          className={cn(
            'premium-card-list group',
            isSelected && 'selected',
            (isDragging && isGlobalDragging) && 'dragging'
          )}
        >
          {/* Type-specific Icon with extension or Thumbnail */}
          <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center overflow-hidden rounded">
            {file.thumbnailPath ? (
              <AuthenticatedImage
                fileId={file.id}
                endpoint="thumbnail"
                alt={file.name}
                placeholderSrc={file.lqip}
                className="w-full h-full object-cover"
              />
            ) : (
              <FileExtensionIcon size={40} extension={fileExtension} className={fileTypeColor} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-dark-900 dark:text-dark-50 truncate">{file.name}</p>
            <p className="text-xs text-dark-500 dark:text-dark-400">
              {formatBytes(file.size)} · {formatDate(file.createdAt)}
            </p>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {file.isFavorite && (
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            )}
          </div>
        </motion.div>
        {contextMenu && (
          <ContextMenu items={contextMenuItems} position={contextMenu} onClose={closeContextMenu} />
        )}
        {showShareModal && (
          <ShareModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            file={file}
            onSuccess={onRefresh}
          />
        )}
        {showRenameModal && (
          <RenameModal
            isOpen={showRenameModal}
            onClose={() => setShowRenameModal(false)}
            item={file}
            type="file"
            onSuccess={onRefresh}
          />
        )}
        {showMoveModal && (
          <MoveModal
            isOpen={showMoveModal}
            onClose={() => setShowMoveModal(false)}
            items={[file]}
            onSuccess={onRefresh}
          />
        )}
        {showCompressModal && (
          <CompressModal
            isOpen={showCompressModal}
            onClose={() => setShowCompressModal(false)}
            items={[{ id: file.id, name: file.name, type: 'file' }]}
            onSuccess={onRefresh}
          />
        )}
        {showInfoModal && (
          <InfoModal
            isOpen={showInfoModal}
            onClose={() => setShowInfoModal(false)}
            item={file}
            type="file"
          />
        )}
        {showTagModal && (
          <TagModal
            isOpen={showTagModal}
            onClose={() => setShowTagModal(false)}
            fileId={file.id}
          />
        )}
        {showVersionHistory && (
          <VersionHistory
            isOpen={showVersionHistory}
            onClose={() => setShowVersionHistory(false)}
            fileId={file.id}
            fileName={file.name}
            onVersionRestored={onRefresh}
          />
        )}
      </>
    );
  }

  return (
    <>
      <motion.div
        {...motionProps}
        ref={setNodeRef}
        style={dragStyle}
        {...attributes}
        {...listeners}
        data-file-item={file.id}
        data-file-name={file.name}
        data-file-data={dragData}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        onTouchStart={longPressHandlers.onTouchStart}
        onTouchMove={longPressHandlers.onTouchMove}
        onTouchEnd={longPressHandlers.onTouchEnd}
        onTouchCancel={longPressHandlers.onTouchCancel}
        tabIndex={0}
        className={cn(
          'premium-card group',
          isSelected && 'selected',
          (isDragging && isGlobalDragging) && 'dragging'
        )}
      >
        {/* Quick Actions - visible on hover */}
        <div className="premium-card-actions">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowShareModal(true); }}
            className="premium-card-action-btn"
            title={t('fileCard.share')}
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            className="premium-card-action-btn"
            title={t('fileCard.download')}
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Favorite badge - top left */}
        {file.isFavorite && (
          <div className="absolute top-2 left-2 z-10">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-md" />
          </div>
        )}

        <div className="premium-card-thumbnail">
          <FileExtensionIcon size={80} extension={fileExtension} className={fileTypeColor} />
        </div>

        {/* Content Area - Overlay at bottom */}
        <div className="premium-card-content">
          <p className="premium-card-name" title={file.name}>
            {file.name}
          </p>
          <div className="premium-card-meta">
            <span>{formatBytes(file.size)}</span>
            <span>·</span>
            <span>{formatDate(file.createdAt)}</span>
          </div>
        </div>
      </motion.div>
      {contextMenu && (
        <ContextMenu items={contextMenuItems} position={contextMenu} onClose={closeContextMenu} />
      )}
      {showShareModal && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          file={file}
          onSuccess={onRefresh}
        />
      )}
      {showRenameModal && (
        <RenameModal
          isOpen={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          item={file}
          type="file"
          onSuccess={onRefresh}
        />
      )}
      {showMoveModal && (
        <MoveModal
          isOpen={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          items={[file]}
          onSuccess={onRefresh}
        />
      )}
      {showCompressModal && (
        <CompressModal
          isOpen={showCompressModal}
          onClose={() => setShowCompressModal(false)}
          items={[{ id: file.id, name: file.name, type: 'file' }]}
          onSuccess={onRefresh}
        />
      )}
      {showInfoModal && (
        <InfoModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          item={file}
          type="file"
        />
      )}
      {showTagModal && (
        <TagModal
          isOpen={showTagModal}
          onClose={() => setShowTagModal(false)}
          fileId={file.id}
        />
      )}
      {showVersionHistory && (
        <VersionHistory
          isOpen={showVersionHistory}
          onClose={() => setShowVersionHistory(false)}
          fileId={file.id}
          fileName={file.name}
          onVersionRestored={onRefresh}
        />
      )}
    </>
  );
});

export default FileCard;
