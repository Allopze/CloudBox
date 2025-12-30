import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, getSignedFileUrl, openSignedFileUrl } from '../lib/api';
import { FileItem, Album } from '../types';
import { useFileStore } from '../stores/fileStore';
import {
  X, Download, Trash2, Star, Check,
  Share2, Info, Copy, Edit3, Images, FolderPlus,
  ImagePlus, ExternalLink, Plus, Loader2
} from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatDate, cn } from '../lib/utils';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';
import ShareModal from '../components/modals/ShareModal';
import RenameModal from '../components/modals/RenameModal';
import ConfirmModal from '../components/ui/ConfirmModal';
import VideoPreview from '../components/gallery/VideoPreview';
import ImageGallery from '../components/gallery/ImageGallery';
import AuthenticatedImage from '../components/AuthenticatedImage';
import VirtualizedGrid from '../components/ui/VirtualizedGrid';
import FileCard from '../components/files/FileCard';
import { SkeletonGrid } from '../components/ui/Skeleton';

type TabType = 'all' | 'favorites' | 'videos' | 'screenshots';

interface ContextMenuState {
  x: number;
  y: number;
  photo: FileItem;
  isMultiSelect: boolean;
  selectedIds: Set<string>;
}

export default function Photos() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') || 'all') as TabType;
  const searchQuery = searchParams.get('search') || '';

  const [photos, setPhotos] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Modal states
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModalFile, setShareModalFile] = useState<FileItem | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameModalFile, setRenameModalFile] = useState<FileItem | null>(null);
  const [infoPhoto, setInfoPhoto] = useState<FileItem | null>(null);
  const [deleteConfirmPhoto, setDeleteConfirmPhoto] = useState<FileItem | null>(null);
  const [videoPreviewFile, setVideoPreviewFile] = useState<FileItem | null>(null);

  // Album selector state
  const [albumSelectorOpen, setAlbumSelectorOpen] = useState(false);
  const [albumSelectorPhotos, setAlbumSelectorPhotos] = useState<FileItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [newAlbumColor, setNewAlbumColor] = useState('#6366f1');
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  // Available colors for albums
  const albumColors = [
    '#6366f1', // Indigo
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#14b8a6', // Teal
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
  ];

  const { selectedItems, addToSelection, removeFromSelection, selectRange, selectSingle, lastSelectedId, clearSelection, viewMode } = useFileStore();


  const loadData = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setPage(1);
      setHasMore(true);
    }
    try {
      let params: any = {
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: pageNum.toString(),
        limit: '50'
      };

      if (activeTab === 'all') {
        params.type = 'media'; // Both images and videos
      } else if (activeTab === 'screenshots') {
        params.type = 'images';
      } else if (activeTab === 'videos') {
        params.type = 'videos';
      } else if (activeTab === 'favorites') {
        params.type = 'media'; // Both images and videos for favorites
        params.favorite = 'true';
      }

      // Add search query for global search
      if (searchQuery) {
        params.search = searchQuery;
      }

      const response = await api.get('/files', { params });
      let files = response.data.files || [];
      const pagination = response.data.pagination;

      // Update hasMore based on pagination
      if (pagination) {
        setHasMore(pagination.page < pagination.totalPages);
        setPage(pagination.page);
      } else {
        setHasMore(files.length === 50);
      }

      if (activeTab === 'favorites') {
        files = files.filter((f: FileItem) => f.isFavorite);
      }

      if (append) {
        setPhotos(prev => [...prev, ...files]);
      } else {
        setPhotos(files);
      }
    } catch (error) {
      console.error('Failed to load photos:', error);
      toast(t('photos.loadError'), 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeTab, searchQuery]);

  // Load more function for pagination
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      loadData(page + 1, true);
    }
  }, [loadData, page, loadingMore, hasMore, loading]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loadingMore, loading, loadMore]);

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

  // Helper to check if file is a video
  const isVideo = (file: FileItem): boolean => {
    return file.mimeType?.startsWith('video/') || false;
  };

  const imageFiles = useMemo(() => {
    return photos.filter((photo) => photo.mimeType?.startsWith('image/'));
  }, [photos]);

  const openLightbox = (photo: FileItem, index: number) => {
    // If it's a video, open video preview instead
    if (isVideo(photo)) {
      setVideoPreviewFile(photo);
      return;
    }

    const imageIndex = imageFiles.findIndex((item) => item.id === photo.id);
    const resolvedIndex = imageIndex >= 0 ? imageIndex : index;

    setGalleryIndex(Math.max(resolvedIndex, 0));
    setGalleryOpen(true);
  };

  const handleFavorite = async (photo: FileItem) => {
    try {
      await api.patch(`/files/${photo.id}/favorite`);
      toast(photo.isFavorite ? t('photos.removedFromFavorites') : t('photos.addedToFavorites'), 'success');
      // Update local state instead of reloading
      if (activeTab === 'favorites' && photo.isFavorite) {
        // In favorites tab, unfavoriting removes the photo from the list
        setPhotos(prev => prev.filter(p => p.id !== photo.id));
      } else {
        setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, isFavorite: !p.isFavorite } : p));
      }
    } catch {
      toast(t('photos.favoriteError'), 'error');
    }
  };

  const handleDelete = async (photo: FileItem) => {
    try {
      await api.delete(`/files/${photo.id}`);
      toast(t('photos.movedToTrash'), 'success');
      clearSelection();
      setGalleryOpen(false);
      loadData();
    } catch {
      toast(t('photos.deleteError'), 'error');
    }
  };

  const handleDeleteClick = (photo: FileItem) => {
    setDeleteConfirmPhoto(photo);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmPhoto) {
      await handleDelete(deleteConfirmPhoto);
      setDeleteConfirmPhoto(null);
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, photo: FileItem) => {
    e.preventDefault();
    e.stopPropagation();

    // Capture selection state at the moment context menu opens
    const currentSelectedItems = useFileStore.getState().selectedItems;
    const isMultiSelect = currentSelectedItems.size > 1 && currentSelectedItems.has(photo.id);

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      photo,
      isMultiSelect,
      selectedIds: new Set(currentSelectedItems)
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  // Close context menu when clicking outside (but not when album selector is open)
  useEffect(() => {
    const handleClick = () => {
      // Don't close if album selector is open
      if (albumSelectorOpen) return;
      closeContextMenu();
    };
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, albumSelectorOpen]);

  // Context menu actions
  const handleDownload = (photo: FileItem) => {
    void openSignedFileUrl(photo.id, 'download');
    closeContextMenu();
  };

  const handleShare = (photo: FileItem) => {
    setShareModalFile(photo);
    setShareModalOpen(true);
    closeContextMenu();
  };

  const handleRename = (photo: FileItem) => {
    setRenameModalFile(photo);
    setRenameModalOpen(true);
    closeContextMenu();
  };

  const handleAddToAlbum = async () => {
    if (!contextMenu) return;

    // Use the selection state captured when context menu opened
    const { photo, isMultiSelect, selectedIds } = contextMenu;

    // Determine which photos to add
    let photosToAdd: FileItem[];
    if (isMultiSelect) {
      photosToAdd = photos.filter(p => selectedIds.has(p.id));
    } else {
      photosToAdd = [photo];
    }

    // Set photos and open selector
    setAlbumSelectorPhotos(photosToAdd);
    setAlbumSelectorOpen(true);
    loadAlbums();

    // Close context menu last
    closeContextMenu();
  };

  const loadAlbums = async () => {
    setLoadingAlbums(true);
    try {
      const response = await api.get('/albums');
      setAlbums(response.data.albums || []);
    } catch (error) {
      console.error('Failed to load albums:', error);
      toast(t('photos.albumLoadError'), 'error');
    } finally {
      setLoadingAlbums(false);
    }
  };

  const addPhotoToAlbum = async (albumId: string) => {
    if (albumSelectorPhotos.length === 0) return;
    try {
      await api.post(`/albums/${albumId}/files`, {
        fileIds: albumSelectorPhotos.map(p => p.id)
      });
      const count = albumSelectorPhotos.length;
      toast(count > 1 ? t('photos.photosAddedToAlbum', { count }) : t('photos.photoAddedToAlbum'), 'success');
      setAlbumSelectorOpen(false);
      setAlbumSelectorPhotos([]);
      useFileStore.getState().clearSelection();
    } catch (error) {
      console.error('Failed to add to album:', error);
      toast(t('photos.addToAlbumError'), 'error');
    }
  };

  const createAlbumAndAdd = async () => {
    if (!newAlbumName.trim() || albumSelectorPhotos.length === 0) return;
    setCreatingAlbum(true);
    try {
      const response = await api.post('/albums', {
        name: newAlbumName.trim(),
        color: newAlbumColor
      });
      const newAlbum = response.data;
      await api.post(`/albums/${newAlbum.id}/files`, {
        fileIds: albumSelectorPhotos.map(p => p.id)
      });
      const count = albumSelectorPhotos.length;
      toast(t('photos.albumCreatedAndAdded', { name: newAlbumName, count: count > 1 ? count : 1 }), 'success');
      setAlbumSelectorOpen(false);
      setAlbumSelectorPhotos([]);
      setNewAlbumName('');
      setNewAlbumColor('#6366f1');
      useFileStore.getState().clearSelection();
    } catch (error) {
      console.error('Failed to create album:', error);
      toast(t('photos.createAlbumError'), 'error');
    } finally {
      setCreatingAlbum(false);
    }
  };

  const handleCopyLink = async (photo: FileItem) => {
    try {
      const url = await getSignedFileUrl(photo.id, 'view');
      await navigator.clipboard.writeText(url);
      toast(t('photos.linkCopied'), 'success');
    } catch {
      toast(t('photos.linkCopyError'), 'error');
    }
    closeContextMenu();
  };

  const handleOpenInNewTab = (photo: FileItem) => {
    void openSignedFileUrl(photo.id, 'view');
    closeContextMenu();
  };

  const handleShowInfo = (photo: FileItem) => {
    setInfoPhoto(photo);
    closeContextMenu();
  };

  const handleFavoriteFromMenu = async (photo: FileItem) => {
    await handleFavorite(photo);
    closeContextMenu();
  };

  // Format file size helper
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return <div className="p-4"><SkeletonGrid count={12} view={viewMode} /></div>;
  }

  return (
    <div>

      {/* Content */}
      {photos.length === 0 ? (
        (() => {
          // Get icon and text based on current tab
          const getEmptyStateConfig = () => {
            switch (activeTab) {
              case 'videos':
                return {
                  icon: Images,
                  title: t('photos.noVideos'),
                  subtitle: t('photos.uploadVideos'),
                  color: 'text-purple-400'
                };
              case 'screenshots':
                return {
                  icon: Images,
                  title: t('photos.noScreenshots'),
                  subtitle: t('photos.uploadScreenshots'),
                  color: 'text-cyan-400'
                };
              case 'favorites':
                return {
                  icon: Star,
                  title: t('photos.noFavoritePhotos'),
                  subtitle: t('photos.addFavoritePhotos'),
                  color: 'text-yellow-400'
                };
              default:
                return {
                  icon: Images,
                  title: t('photos.noPhotos'),
                  subtitle: t('photos.uploadPhotos'),
                  color: 'text-primary-400'
                };
            }
          };
          const { icon: EmptyIcon, title, subtitle, color } = getEmptyStateConfig();
          return (
            <div className="flex flex-col items-center justify-center h-64 text-dark-500">
              <EmptyIcon className={`w-16 h-16 mb-4 opacity-50 ${color}`} />
              <p className="text-lg font-medium">{title}</p>
              <p className="text-sm">{subtitle}</p>
            </div>
          );
        })()
      ) : (
        <VirtualizedGrid
          items={photos}
          viewMode={viewMode}
          scrollElementId="main-content"
          estimateListItemHeight={60}
          renderItem={(photo, index, style) => {
            // Use FileCard for list view
            if (viewMode === 'list') {
              return (
                <div style={style}>
                  <FileCard
                    file={photo}
                    view={viewMode}
                    onRefresh={() => loadData()}
                    onPreview={() => openLightbox(photo, index)}
                    onFavoriteToggle={(fileId, isFavorite) => {
                      setPhotos(prev => prev.map(p => p.id === fileId ? { ...p, isFavorite } : p));
                    }}
                  />
                </div>
              );
            }

            // Grid view with custom card
            const isSelected = selectedItems.has(photo.id);

            const handleClick = (e: React.MouseEvent) => {
              // Shift+Click: Range selection
              if (e.shiftKey && lastSelectedId) {
                const ids = photos.map(p => p.id);
                selectRange(ids, photo.id);
              }
              // Ctrl/Meta+Click: Toggle selection
              else if (e.ctrlKey || e.metaKey) {
                if (isSelected) {
                  removeFromSelection(photo.id);
                } else {
                  addToSelection(photo.id);
                }
              }
              // Simple click: Select or open lightbox if already selected
              else {
                if (isSelected && selectedItems.size === 1) {
                  openLightbox(photo, index);
                } else {
                  selectSingle(photo.id);
                }
              }
            };

            return (
              <div style={style}>
                <motion.div
                  key={photo.id}
                  data-file-item={photo.id}
                  onClick={handleClick}
                  onDoubleClick={() => openLightbox(photo, index)}
                  onContextMenu={(e) => handleContextMenu(e, photo)}
                  animate={isSelected ? { scale: 0.95 } : { scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={cn(
                    'premium-card group',
                    isSelected && 'selected'
                  )}
                >
                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg z-20">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}

                  {/* Favorite badge - top left */}
                  {photo.isFavorite && !isSelected && (
                    <div className="absolute top-2 left-2 z-10">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-md" />
                    </div>
                  )}

                  {/* Photo thumbnail */}
                  <div className="premium-card-thumbnail">
                    <AuthenticatedImage
                      fileId={photo.id}
                      endpoint={photo.thumbnailPath ? 'thumbnail' : 'view'}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* Content Area */}
                  <div className="premium-card-content">
                    <p className="premium-card-name" title={photo.name}>
                      {photo.name}
                    </p>
                    <div className="premium-card-meta">
                      <span>{formatDate(photo.createdAt)}</span>
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          }}
        />
      )}

      {/* Load More Sentinel */}
      {photos.length > 0 && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore && (
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          )}
          {!hasMore && photos.length >= 50 && (
            <p className="text-sm text-dark-400">{t('common.noMoreItems')}</p>
          )}
        </div>
      )}

      {/* Image Gallery */}
      <ImageGallery
        images={imageFiles}
        initialIndex={galleryIndex}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onDownload={(file) => void openSignedFileUrl(file.id, 'download')}
        onShare={(file) => {
          setShareModalFile(file);
          setShareModalOpen(true);
          setGalleryOpen(false);
        }}
        onFavorite={handleFavorite}
        onRename={(file) => {
          setRenameModalFile(file);
          setRenameModalOpen(true);
        }}
        onDelete={(file) => setDeleteConfirmPhoto(file)}
        onCopyLink={handleCopyLink}
      />

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (() => {
          // Use selection state captured when context menu opened
          const { isMultiSelect, selectedIds } = contextMenu;
          const selectedCount = isMultiSelect ? selectedIds.size : 1;

          const menuWidth = 300;
          // Calculate menu height based on items shown
          const baseHeight = isMultiSelect ? 280 : 480; // Smaller menu for multi-select
          const padding = 16;

          // Calculate optimal position
          let left = contextMenu.x;
          let top = contextMenu.y;

          // Calculate available space in each direction
          const spaceRight = window.innerWidth - contextMenu.x - padding;
          const spaceLeft = contextMenu.x - padding;
          const spaceBottom = window.innerHeight - contextMenu.y - padding;
          const spaceTop = contextMenu.y - padding;

          // Horizontal positioning
          if (spaceRight >= menuWidth) {
            left = contextMenu.x;
          } else if (spaceLeft >= menuWidth) {
            left = contextMenu.x - menuWidth;
          } else {
            left = Math.max(padding, (window.innerWidth - menuWidth) / 2);
          }

          // Vertical positioning
          if (spaceBottom >= baseHeight) {
            top = contextMenu.y;
          } else if (spaceTop >= baseHeight) {
            top = contextMenu.y - baseHeight;
          } else {
            top = Math.max(padding, (window.innerHeight - baseHeight) / 2);
          }

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="fixed z-[100] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 min-w-[180px]"
              style={{ left, top }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header showing selection count for multi-select */}
              {isMultiSelect && (
                <>
                  <div className="px-4 py-2 text-sm font-medium text-dark-500 dark:text-dark-400">
                    {t('photos.itemsSelected', { count: selectedCount })}
                  </div>
                  <div className="my-2 border-t border-dark-200 dark:border-dark-700" />
                </>
              )}

              {/* Single item actions - only show when single selection */}
              {!isMultiSelect && (
                <>
                  {/* View actions */}
                  <div className="px-1.5">
                    <button
                      onClick={() => {
                        const index = photos.findIndex(p => p.id === contextMenu.photo.id);
                        openLightbox(contextMenu.photo, index);
                        closeContextMenu();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <ImagePlus className="w-4 h-4 text-dark-400" />
                      {t('photos.openInViewer')}
                    </button>
                    <button
                      onClick={() => handleOpenInNewTab(contextMenu.photo)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 text-dark-400" />
                      {t('photos.openInNewTab')}
                    </button>
                  </div>

                  <div className="my-2 border-t border-dark-200 dark:border-dark-700" />

                  {/* File actions for single */}
                  <div className="px-1.5">
                    <button
                      onClick={() => handleDownload(contextMenu.photo)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <Download className="w-4 h-4 text-dark-400" />
                      {t('common.download')}
                    </button>
                    <button
                      onClick={() => handleShare(contextMenu.photo)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <Share2 className="w-4 h-4 text-dark-400" />
                      {t('common.share')}
                    </button>
                    <button
                      onClick={() => handleCopyLink(contextMenu.photo)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <Copy className="w-4 h-4 text-dark-400" />
                      {t('photos.copyLink')}
                    </button>
                  </div>

                  <div className="my-2 border-t border-dark-200 dark:border-dark-700" />

                  {/* Organization actions for single */}
                  <div className="px-1.5">
                    <button
                      onClick={() => handleFavoriteFromMenu(contextMenu.photo)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <Star className={cn('w-4 h-4', contextMenu.photo.isFavorite ? 'text-yellow-500 fill-yellow-500' : 'text-dark-400')} />
                      {contextMenu.photo.isFavorite ? t('photos.removeFromFavorites') : t('photos.addToFavorites')}
                    </button>
                    <button
                      onClick={handleAddToAlbum}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <FolderPlus className="w-4 h-4 text-dark-400" />
                      {t('photos.addToAlbum')}
                    </button>
                    <button
                      onClick={() => handleRename(contextMenu.photo)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <Edit3 className="w-4 h-4 text-dark-400" />
                      {t('common.rename')}
                    </button>
                  </div>

                  <div className="my-2 border-t border-dark-200 dark:border-dark-700" />

                  {/* Tools for single */}
                  <div className="px-1.5">
                    <button
                      onClick={() => handleShowInfo(contextMenu.photo)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <Info className="w-4 h-4 text-dark-400" />
                      {t('photos.viewInfo')}
                    </button>
                  </div>

                  <div className="my-2 border-t border-dark-200 dark:border-dark-700" />
                </>
              )}

              {/* Multi-select actions */}
              {isMultiSelect && (
                <>
                  <div className="px-1.5">
                    <button
                      onClick={handleAddToAlbum}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <FolderPlus className="w-4 h-4 text-dark-400" />
                      {t('photos.addToAlbum')}
                    </button>
                    <button
                      onClick={() => {
                        // Download all selected
                        const selected = photos.filter(p => selectedIds.has(p.id));
                        selected.forEach(p => handleDownload(p));
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <Download className="w-4 h-4 text-dark-400" />
                      {t('photos.downloadItems', { count: selectedCount })}
                    </button>
                  </div>

                  <div className="my-2 border-t border-dark-200 dark:border-dark-700" />
                </>
              )}

              {/* Delete - always show */}
              <div className="px-1.5">
                <button
                  onClick={() => handleDeleteClick(contextMenu.photo)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {isMultiSelect ? t('photos.deleteItems', { count: selectedCount }) : t('common.delete')}
                </button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Info Modal */}
      <AnimatePresence>
        {infoPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
            onClick={() => setInfoPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-dark-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Preview */}
              <div className="aspect-video bg-dark-100 dark:bg-dark-900 relative">
                <AuthenticatedImage
                  fileId={infoPhoto.id}
                  endpoint={infoPhoto.thumbnailPath ? 'thumbnail' : 'view'}
                  alt={infoPhoto.name}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Info */}
              <div className="p-4 space-y-3">
                <h3 className="font-semibold text-dark-900 dark:text-white text-lg truncate">{infoPhoto.name}</h3>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-dark-500 dark:text-dark-400">{t('photos.type')}</span>
                    <span className="text-dark-700 dark:text-dark-200">{infoPhoto.mimeType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-500 dark:text-dark-400">{t('photos.size')}</span>
                    <span className="text-dark-700 dark:text-dark-200">{formatSize(Number(infoPhoto.size))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-500 dark:text-dark-400">{t('photos.created')}</span>
                    <span className="text-dark-700 dark:text-dark-200">{formatDate(infoPhoto.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-500 dark:text-dark-400">{t('photos.modified')}</span>
                    <span className="text-dark-700 dark:text-dark-200">{formatDate(infoPhoto.updatedAt)}</span>
                  </div>
                  {infoPhoto.isFavorite && (
                    <div className="flex justify-between">
                      <span className="text-dark-500 dark:text-dark-400">{t('photos.favorite')}</span>
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setInfoPhoto(null)}
                  >
                    {t('common.close')}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => {
          setShareModalOpen(false);
          setShareModalFile(null);
        }}
        file={shareModalFile}
        onSuccess={loadData}
      />

      {/* Rename Modal */}
      <RenameModal
        isOpen={renameModalOpen}
        onClose={() => {
          setRenameModalOpen(false);
          setRenameModalFile(null);
        }}
        item={renameModalFile}
        type="file"
        onSuccess={loadData}
      />

      {/* Album Selector Modal */}
      <AnimatePresence>
        {albumSelectorOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
            onClick={() => {
              setAlbumSelectorOpen(false);
              setAlbumSelectorPhotos([]);
              setNewAlbumName('');
              setNewAlbumColor('#6366f1');
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-dark-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-dark-200 dark:border-dark-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-dark-900 dark:text-white">
                  {t('photos.addPhotosToAlbum', { count: albumSelectorPhotos.length })}
                </h3>
                <button
                  onClick={() => {
                    setAlbumSelectorOpen(false);
                    setAlbumSelectorPhotos([]);
                    setNewAlbumName('');
                    setNewAlbumColor('#6366f1');
                  }}
                  className="p-2 -m-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                  title={t('common.close')}
                  aria-label={t('common.close')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Create new album */}
              <div className="p-4 border-b border-dark-200 dark:border-dark-700 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder={t('photos.newAlbumName')}
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createAlbumAndAdd()}
                    className="flex-1"
                  />
                  <Button
                    onClick={createAlbumAndAdd}
                    disabled={!newAlbumName.trim() || creatingAlbum}
                    loading={creatingAlbum}
                    size="sm"
                    title={t('photos.createAlbum')}
                    aria-label={t('photos.createAlbum')}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {/* Color picker */}
                {newAlbumName.trim() && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-dark-500 dark:text-dark-400">{t('photos.color')}:</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {albumColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewAlbumColor(color)}
                          className={cn(
                            'w-6 h-6 rounded-full transition-all',
                            newAlbumColor === color ? 'ring-2 ring-offset-2 ring-dark-400 dark:ring-offset-dark-800' : 'hover:scale-110'
                          )}
                          style={{ backgroundColor: color }}
                          title={color}
                          aria-label={t('photos.selectColor')}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Album list */}
              <div className="max-h-80 overflow-y-auto">
                {loadingAlbums ? (
                  <div className="p-4">
                    <SkeletonGrid count={3} view="list" />
                  </div>
                ) : albums.length === 0 ? (
                  <div className="text-center py-8 text-dark-500 dark:text-dark-400">
                    <Images className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>{t('photos.noAlbums')}</p>
                    <p className="text-sm">{t('photos.createOneAbove')}</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {albums.map((album) => (
                      <button
                        key={album.id}
                        onClick={() => addPhotoToAlbum(album.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                      >
                        <div
                          className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: album.color || '#6366f1' }}
                        >
                          {album.coverUrl ? (
                            <img src={album.coverUrl} alt={album.name} className="w-full h-full object-cover" />
                          ) : (
                            <Images className="w-5 h-5 text-white/80" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-dark-900 dark:text-white">{album.name}</p>
                          <p className="text-sm text-dark-500 dark:text-dark-400">
                            {t('photos.photosCount', { count: album._count?.files || 0 })}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Preview */}
      {videoPreviewFile && (
        <VideoPreview
          file={videoPreviewFile}
          isOpen={true}
          onClose={() => setVideoPreviewFile(null)}
          onDownload={(file) => {
            void openSignedFileUrl(file.id, 'download');
            setVideoPreviewFile(null);
          }}
          onShare={(file) => {
            setShareModalFile(file);
            setShareModalOpen(true);
            setVideoPreviewFile(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmPhoto}
        onClose={() => setDeleteConfirmPhoto(null)}
        onConfirm={handleConfirmDelete}
        title={t('photos.deleteConfirmTitle')}
        message={t('photos.deleteConfirmMessage')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
      />

    </div>
  );
}
