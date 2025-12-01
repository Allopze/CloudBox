import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getFileUrl } from '../lib/api';
import { FileItem, Album } from '../types';
import { useFileStore } from '../stores/fileStore';
import { 
  Loader2, X, ChevronLeft, ChevronRight, Download, Trash2, Star, Check,
  Share2, Info, Copy, Edit3, Images, FolderPlus,
  ImagePlus, ExternalLink, Plus
} from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatDate, cn } from '../lib/utils';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';
import ShareModal from '../components/modals/ShareModal';
import RenameModal from '../components/modals/RenameModal';

type TabType = 'all' | 'favorites' | 'videos' | 'screenshots';

interface ContextMenuState {
  x: number;
  y: number;
  photo: FileItem;
  isMultiSelect: boolean;
  selectedIds: Set<string>;
}

export default function Photos() {
  const [searchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') || 'all') as TabType;
  
  const [photos, setPhotos] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<FileItem | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  
  // Modal states
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModalFile, setShareModalFile] = useState<FileItem | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameModalFile, setRenameModalFile] = useState<FileItem | null>(null);
  const [infoPhoto, setInfoPhoto] = useState<FileItem | null>(null);
  
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

  const { selectedItems, addToSelection, removeFromSelection, selectRange, selectSingle, lastSelectedId, clearSelection } = useFileStore();


  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let params: any = { sortBy: 'createdAt', sortOrder: 'desc' };

      if (activeTab === 'all' || activeTab === 'screenshots') {
        params.type = 'images';
      } else if (activeTab === 'videos') {
        params.type = 'videos';
      } else if (activeTab === 'favorites') {
        params.type = 'images';
        params.favorite = 'true';
      }

      const response = await api.get('/files', { params });
      let files = response.data.files || [];

      if (activeTab === 'favorites') {
        files = files.filter((f: FileItem) => f.isFavorite);
      }

      setPhotos(files);
    } catch (error) {
      console.error('Failed to load photos:', error);
      toast('Error al cargar las fotos', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

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

  const openLightbox = (photo: FileItem, index: number) => {
    setSelectedPhoto(photo);
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setSelectedPhoto(null);
  };

  const navigateLightbox = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev'
      ? (lightboxIndex - 1 + photos.length) % photos.length
      : (lightboxIndex + 1) % photos.length;
    setLightboxIndex(newIndex);
    setSelectedPhoto(photos[newIndex]);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!selectedPhoto) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox('prev');
    if (e.key === 'ArrowRight') navigateLightbox('next');
  }, [selectedPhoto, lightboxIndex, photos]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleFavorite = async (photo: FileItem) => {
    try {
      await api.patch(`/files/${photo.id}/favorite`);
      toast(photo.isFavorite ? 'Eliminado de favoritos' : 'Añadido a favoritos', 'success');
      loadData();
    } catch {
      toast('Error al actualizar favorito', 'error');
    }
  };

  const handleDelete = async (photo: FileItem) => {
    try {
      await api.delete(`/files/${photo.id}`);
      toast('Foto movida a la papelera', 'success');
      closeLightbox();
      loadData();
    } catch {
      toast('Error al eliminar la foto', 'error');
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
    window.open(getFileUrl(`/files/${photo.id}/download`), '_blank');
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
      toast('Error al cargar álbumes', 'error');
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
      toast(count > 1 ? `${count} fotos añadidas al álbum` : 'Foto añadida al álbum', 'success');
      setAlbumSelectorOpen(false);
      setAlbumSelectorPhotos([]);
      useFileStore.getState().clearSelection();
    } catch (error) {
      console.error('Failed to add to album:', error);
      toast('Error al añadir al álbum', 'error');
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
      toast(`Álbum "${newAlbumName}" creado y ${count > 1 ? `${count} fotos añadidas` : 'foto añadida'}`, 'success');
      setAlbumSelectorOpen(false);
      setAlbumSelectorPhotos([]);
      setNewAlbumName('');
      setNewAlbumColor('#6366f1');
      useFileStore.getState().clearSelection();
    } catch (error) {
      console.error('Failed to create album:', error);
      toast('Error al crear el álbum', 'error');
    } finally {
      setCreatingAlbum(false);
    }
  };

  const handleCopyLink = async (photo: FileItem) => {
    try {
      const url = `${window.location.origin}${getFileUrl(`/files/${photo.id}/view`)}`;
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado al portapapeles', 'success');
    } catch {
      toast('Error al copiar el enlace', 'error');
    }
    closeContextMenu();
  };

  const handleOpenInNewTab = (photo: FileItem) => {
    window.open(getFileUrl(`/files/${photo.id}/view`), '_blank');
    closeContextMenu();
  };

  const handleShowInfo = (photo: FileItem) => {
    setInfoPhoto(photo);
    closeContextMenu();
  };

  const handleDeleteFromMenu = async (photo: FileItem) => {
    await handleDelete(photo);
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
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {photos.map((photo, index) => {
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
              <motion.div
                key={photo.id}
                data-file-item={photo.id}
                onClick={handleClick}
                onDoubleClick={() => openLightbox(photo, index)}
                onContextMenu={(e) => handleContextMenu(e, photo)}
                animate={isSelected ? { scale: 0.95 } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={cn(
                  'group relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-dark-100 dark:bg-dark-800 transition-all',
                  isSelected && 'ring-3 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-dark-900'
                )}
              >
                <img
                  src={photo.thumbnailPath ? getFileUrl(`/files/${photo.id}/thumbnail`) : getFileUrl(`/files/${photo.id}/view`)}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={cn(
                  'absolute inset-0 bg-black/40 transition-opacity flex items-end',
                  isSelected ? 'opacity-50' : 'opacity-0 group-hover:opacity-100'
                )}>
                  <div className="p-2 w-full">
                    <p className="text-white text-xs font-medium truncate">{photo.name}</p>
                  </div>
                </div>
                {photo.isFavorite && (
                  <div className="absolute top-2 right-2">
                    <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" role="dialog" aria-label="Visor de imagen">
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors z-10"
            aria-label="Cerrar visor"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Navigation */}
          <button
            onClick={() => navigateLightbox('prev')}
            className="absolute left-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            aria-label="Foto anterior"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={() => navigateLightbox('next')}
            className="absolute right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            aria-label="Foto siguiente"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* Image */}
          <img
            src={getFileUrl(`/files/${selectedPhoto.id}/view`)}
            alt={selectedPhoto.name}
            className="max-w-full max-h-full object-contain"
          />

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <div>
                <p className="text-white font-medium">{selectedPhoto.name}</p>
                <p className="text-white/70 text-sm">{formatDate(selectedPhoto.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFavorite(selectedPhoto)}
                  className="text-white hover:bg-white/10"
                  aria-label={selectedPhoto.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                >
                  <Star className={cn('w-5 h-5', selectedPhoto.isFavorite && 'fill-yellow-500 text-yellow-500')} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(getFileUrl(`/files/${selectedPhoto.id}/download`), '_blank')}
                  className="text-white hover:bg-white/10"
                  aria-label="Descargar"
                >
                  <Download className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(selectedPhoto)}
                  className="text-white hover:bg-white/10"
                  aria-label="Eliminar"
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            className="fixed z-[100] bg-white dark:bg-dark-800 rounded-2xl shadow-xl border border-dark-200 dark:border-dark-700 py-2 min-w-72"
            style={{ left, top }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header showing selection count for multi-select */}
            {isMultiSelect && (
              <>
                <div className="px-4 py-2 text-sm font-medium text-dark-500 dark:text-dark-400">
                  {selectedCount} elementos seleccionados
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
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <ImagePlus className="w-5 h-5 text-dark-400" />
                    Abrir en visor
                  </button>
                  <button
                    onClick={() => handleOpenInNewTab(contextMenu.photo)}
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <ExternalLink className="w-5 h-5 text-dark-400" />
                    Abrir en nueva pestaña
                  </button>
                </div>

                <div className="my-2 border-t border-dark-200 dark:border-dark-700" />

                {/* File actions for single */}
                <div className="px-1.5">
                  <button
                    onClick={() => handleDownload(contextMenu.photo)}
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <Download className="w-5 h-5 text-dark-400" />
                    Descargar
                  </button>
                  <button
                    onClick={() => handleShare(contextMenu.photo)}
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <Share2 className="w-5 h-5 text-dark-400" />
                    Compartir
                  </button>
                  <button
                    onClick={() => handleCopyLink(contextMenu.photo)}
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <Copy className="w-5 h-5 text-dark-400" />
                    Copiar enlace
                  </button>
                </div>

                <div className="my-2 border-t border-dark-200 dark:border-dark-700" />

                {/* Organization actions for single */}
                <div className="px-1.5">
                  <button
                    onClick={() => handleFavoriteFromMenu(contextMenu.photo)}
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <Star className={cn('w-5 h-5', contextMenu.photo.isFavorite ? 'text-yellow-500 fill-yellow-500' : 'text-dark-400')} />
                    {contextMenu.photo.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                  </button>
                  <button
                    onClick={handleAddToAlbum}
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <FolderPlus className="w-5 h-5 text-dark-400" />
                    Añadir a álbum
                  </button>
                  <button
                    onClick={() => handleRename(contextMenu.photo)}
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <Edit3 className="w-5 h-5 text-dark-400" />
                    Renombrar
                  </button>
                </div>

                <div className="my-2 border-t border-dark-200 dark:border-dark-700" />

                {/* Tools for single */}
                <div className="px-1.5">
                  <button
                    onClick={() => handleShowInfo(contextMenu.photo)}
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <Info className="w-5 h-5 text-dark-400" />
                    Ver información
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
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <FolderPlus className="w-5 h-5 text-dark-400" />
                    Añadir a álbum
                  </button>
                  <button
                    onClick={() => {
                      // Download all selected
                      const selected = photos.filter(p => selectedIds.has(p.id));
                      selected.forEach(p => handleDownload(p));
                    }}
                    className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-xl transition-colors"
                  >
                    <Download className="w-5 h-5 text-dark-400" />
                    Descargar {selectedCount} elementos
                  </button>
                </div>

                <div className="my-2 border-t border-dark-200 dark:border-dark-700" />
              </>
            )}

            {/* Delete - always show */}
            <div className="px-1.5">
              <button
                onClick={() => handleDeleteFromMenu(contextMenu.photo)}
                className="w-full flex items-center gap-3.5 px-4 py-2.5 text-base text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                {isMultiSelect ? `Eliminar ${selectedCount} elementos` : 'Eliminar'}
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
                <img
                  src={infoPhoto.thumbnailPath ? getFileUrl(`/files/${infoPhoto.id}/thumbnail`) : getFileUrl(`/files/${infoPhoto.id}/view`)}
                  alt={infoPhoto.name}
                  className="w-full h-full object-contain"
                />
              </div>
              
              {/* Info */}
              <div className="p-4 space-y-3">
                <h3 className="font-semibold text-dark-900 dark:text-white text-lg truncate">{infoPhoto.name}</h3>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-dark-500 dark:text-dark-400">Tipo</span>
                    <span className="text-dark-700 dark:text-dark-200">{infoPhoto.mimeType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-500 dark:text-dark-400">Tamaño</span>
                    <span className="text-dark-700 dark:text-dark-200">{formatSize(Number(infoPhoto.size))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-500 dark:text-dark-400">Creado</span>
                    <span className="text-dark-700 dark:text-dark-200">{formatDate(infoPhoto.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-500 dark:text-dark-400">Modificado</span>
                    <span className="text-dark-700 dark:text-dark-200">{formatDate(infoPhoto.updatedAt)}</span>
                  </div>
                  {infoPhoto.isFavorite && (
                    <div className="flex justify-between">
                      <span className="text-dark-500 dark:text-dark-400">Favorito</span>
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
                    Cerrar
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
                  Añadir {albumSelectorPhotos.length > 1 ? `${albumSelectorPhotos.length} fotos` : 'foto'} a álbum
                </h3>
                <button
                  onClick={() => {
                    setAlbumSelectorOpen(false);
                    setAlbumSelectorPhotos([]);
                    setNewAlbumName('');
                    setNewAlbumColor('#6366f1');
                  }}
                  className="p-2 -m-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Create new album */}
              <div className="p-4 border-b border-dark-200 dark:border-dark-700 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nombre del nuevo álbum"
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
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {/* Color picker */}
                {newAlbumName.trim() && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-dark-500 dark:text-dark-400">Color:</span>
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
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Album list */}
              <div className="max-h-80 overflow-y-auto">
                {loadingAlbums ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : albums.length === 0 ? (
                  <div className="text-center py-8 text-dark-500 dark:text-dark-400">
                    <Images className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No tienes álbumes</p>
                    <p className="text-sm">Crea uno arriba</p>
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
                            {album._count?.files || 0} fotos
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

    </div>
  );
}
