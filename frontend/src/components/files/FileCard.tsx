import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { FileItem } from '../../types';
import { useFileStore } from '../../stores/fileStore';
import {
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
import ShareModal from '../modals/ShareModal';
import RenameModal from '../modals/RenameModal';
import MoveModal from '../modals/MoveModal';
import CompressModal from '../modals/CompressModal';
import InfoModal from '../modals/InfoModal';
import ContextMenu, { ContextMenuItemOrDivider, ContextMenuDividerItem } from '../ui/ContextMenu';
import { motion } from 'framer-motion';
import { FileExtensionIcon } from '../icons/SolidIcons';

interface FileCardProps {
  file: FileItem;
  view?: 'grid' | 'list';
  onRefresh?: () => void;
  onPreview?: (file: FileItem) => void;
}

// Get color based on file type
function getFileTypeColor(mimeType: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeCategory = mimeType.split('/')[0];

  // PDF - Red
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'text-red-500';

  // Word documents - Blue
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || mimeType.includes('word')) return 'text-blue-600';

  // Excel spreadsheets - Green
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext) || mimeType.includes('spreadsheet')) return 'text-green-600';

  // PowerPoint - Orange
  if (['ppt', 'pptx', 'odp'].includes(ext) || mimeType.includes('presentation')) return 'text-orange-500';

  // Code files - Purple
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'json', 'xml', 'yaml', 'sh', 'sql'].includes(ext)) return 'text-purple-500';

  // Archives - Amber
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType.includes('zip') || mimeType.includes('archive')) return 'text-amber-600';

  // Images - Cyan
  if (mimeCategory === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'text-cyan-500';

  // Videos - Rose
  if (mimeCategory === 'video' || ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) return 'text-rose-500';

  // Audio - Violet
  if (mimeCategory === 'audio' || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) return 'text-violet-500';

  // Text files - Gray
  if (['txt', 'md', 'log'].includes(ext) || mimeType === 'text/plain') return 'text-gray-500';

  // Default - Gray
  return 'text-gray-400';
}

// Get file extension from filename
function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}



export default function FileCard({ file, view = 'grid', onRefresh, onPreview }: FileCardProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isSelected = useFileStore(useCallback((state) => state.selectedItems.has(file.id), [file.id]));
  // Use getState() for action functions to avoid unnecessary subscriptions
  const { addToSelection, removeFromSelection, selectRange, selectSingle } = useFileStore.getState();
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

  // Get file extension and color for the icon
  const fileExtension = getFileExtension(file.name);
  const fileTypeColor = getFileTypeColor(file.mimeType, file.name);
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

  const handleDownload = useCallback(() => {
    setContextMenu(null);
    window.open(getFileUrl(file.id, 'download', true), '_blank');
  }, [file.id]);

  const handleFavorite = useCallback(async () => {
    setContextMenu(null);
    try {
      await api.patch(`/files/${file.id}/favorite`);
      toast(file.isFavorite ? t('fileCard.removedFromFavorites') : t('fileCard.addedToFavorites'), 'success');
      onRefresh?.();
    } catch {
      toast(t('fileCard.favoriteError'), 'error');
    }
  }, [file.id, file.isFavorite, t, onRefresh]);

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
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          ref={setNodeRef}
          style={dragStyle}
          {...attributes}
          {...listeners}
          data-file-item={file.id}
          data-file-name={file.name}
          data-file-data={dragData}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          tabIndex={0}
          className={cn(
            'premium-card-list group',
            isSelected && 'selected',
            isDragging && 'dragging'
          )}
        >
          {/* Type-specific Icon with extension */}
          <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-dark-100/50 dark:bg-white/5 flex items-center justify-center">
            <FileExtensionIcon size={32} extension={fileExtension} className={fileTypeColor} />
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
        <ContextMenu items={contextMenuItems} position={contextMenu} onClose={closeContextMenu} />
        {modals}
      </>
    );
  }

  return (
    <>
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        ref={setNodeRef}
        style={dragStyle}
        {...attributes}
        {...listeners}
        data-file-item={file.id}
        data-file-name={file.name}
        data-file-data={dragData}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        className={cn(
          'premium-card group',
          isSelected && 'selected',
          isDragging && 'dragging'
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

        {/* Type-specific Icon with extension in center */}
        <div className="premium-card-thumbnail">
          <FileExtensionIcon size={56} extension={fileExtension} className={fileTypeColor} />
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
      <ContextMenu items={contextMenuItems} position={contextMenu} onClose={closeContextMenu} />
      {modals}
    </>
  );
}
