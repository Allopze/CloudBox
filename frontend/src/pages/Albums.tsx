import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, getSignedFileUrl, openSignedFileUrl } from '../lib/api';
import { Album, FileItem } from '../types';
import { useFileStore } from '../stores/fileStore';
import { Loader2, Album as AlbumIcon, Trash2, X, FolderPlus, Check, Download, Share2, Copy, Info, Star, Eye } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn, formatDate } from '../lib/utils';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';
import ShareModal from '../components/modals/ShareModal';
import AuthenticatedImage from '../components/AuthenticatedImage';
import ContextMenu, { type ContextMenuItemOrDivider } from '../components/ui/ContextMenu';

interface PhotoContextMenuState {
  x: number;
  y: number;
  photo: FileItem;
}

export default function Albums() {
  const { t } = useTranslation();
  const { albumId } = useParams<{ albumId: string }>();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddPhotosModal, setShowAddPhotosModal] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [creating, setCreating] = useState(false);
  const [availablePhotos, setAvailablePhotos] = useState<FileItem[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [photoContextMenu, setPhotoContextMenu] = useState<PhotoContextMenuState | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModalFile, setShareModalFile] = useState<FileItem | null>(null);
  const [infoPhoto, setInfoPhoto] = useState<FileItem | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<FileItem | null>(null);

  // Selection state from store
  const { selectedItems, addToSelection, removeFromSelection, selectRange, selectSingle, lastSelectedId, clearSelection } = useFileStore();

  const loadAlbums = useCallback(async () => {
    try {
      const response = await api.get('/albums');
      setAlbums(response.data || []);
    } catch (error) {
      console.error('Failed to load albums:', error);
      toast(t('albums.loadError'), 'error');
    }
  }, []);

  const loadAlbumDetails = useCallback(async (id: string) => {
    try {
      const [albumRes, photosRes] = await Promise.all([
        api.get(`/albums/${id}`),
        api.get(`/albums/${id}/files`),
      ]);
      setCurrentAlbum(albumRes.data);
      setAlbumPhotos(photosRes.data || []);
    } catch (error) {
      console.error('Failed to load album:', error);
      toast(t('albums.loadAlbumError'), 'error');
    }
  }, []);

  const loadAvailablePhotos = useCallback(async () => {
    try {
      const response = await api.get('/files', {
        params: { type: 'images' },
      });
      setAvailablePhotos(response.data.files || []);
    } catch (error) {
      console.error('Failed to load photos:', error);
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    setLoading(true);
    clearSelection();

    const loadData = async () => {
      try {
        if (albumId) {
          await loadAlbumDetails(albumId);
        } else {
          await loadAlbums();
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      abortController.abort();
    };
  }, [albumId, loadAlbums, loadAlbumDetails, clearSelection]);

  // Listen for workzone refresh event
  useEffect(() => {
    const handleRefresh = () => {
      if (albumId) {
        loadAlbumDetails(albumId);
      } else {
        loadAlbums();
      }
    };
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [albumId, loadAlbums, loadAlbumDetails]);

  // Listen for create-album event from breadcrumb bar
  useEffect(() => {
    const handleCreateAlbum = () => setShowCreateModal(true);
    window.addEventListener('create-album', handleCreateAlbum);
    return () => window.removeEventListener('create-album', handleCreateAlbum);
  }, []);

  // Listen for add-photos-to-album event from breadcrumb bar
  useEffect(() => {
    const handleAddPhotos = () => openAddPhotosModal();
    window.addEventListener('add-photos-to-album', handleAddPhotos);
    return () => window.removeEventListener('add-photos-to-album', handleAddPhotos);
  }, []);

  const createAlbum = async () => {
    if (!newAlbumName.trim()) return;
    setCreating(true);
    try {
      await api.post('/albums', { name: newAlbumName.trim() });
      toast(t('albums.created'), 'success');
      setNewAlbumName('');
      setShowCreateModal(false);
      loadAlbums();
    } catch (error) {
      toast(t('albums.createError'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const deleteAlbum = async (id: string) => {
    try {
      await api.delete(`/albums/${id}`);
      toast(t('albums.deleted'), 'success');
      loadAlbums();
    } catch (error) {
      toast(t('albums.deleteError'), 'error');
    }
  };

  const openAddPhotosModal = () => {
    setSelectedPhotos([]);
    loadAvailablePhotos();
    setShowAddPhotosModal(true);
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId]
    );
  };

  const addPhotosToAlbum = async () => {
    if (!currentAlbum || selectedPhotos.length === 0) return;
    try {
      await api.post(`/albums/${currentAlbum.id}/files`, {
        fileIds: selectedPhotos,
      });
      toast(t('albums.photosAdded'), 'success');
      setShowAddPhotosModal(false);
      loadAlbumDetails(currentAlbum.id);
    } catch (error) {
      toast(t('albums.addPhotosError'), 'error');
    }
  };

  const removePhotoFromAlbum = async (fileId: string) => {
    if (!currentAlbum) return;
    try {
      await api.delete(`/albums/${currentAlbum.id}/files`, {
        data: { fileIds: [fileId] },
      });
      toast(t('albums.photoRemoved'), 'success');
      loadAlbumDetails(currentAlbum.id);
    } catch (error) {
      toast(t('albums.removePhotoError'), 'error');
    }
  };

  // Photo context menu handlers
  const handlePhotoContextMenu = (e: React.MouseEvent, photo: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setPhotoContextMenu({ x: e.clientX, y: e.clientY, photo });
  };

  const closePhotoContextMenu = () => setPhotoContextMenu(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => closePhotoContextMenu();
    if (photoContextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [photoContextMenu]);

  const handleViewPhoto = (photo: FileItem) => {
    setLightboxPhoto(photo);
    closePhotoContextMenu();
  };

  const handleDownloadPhoto = (photo: FileItem) => {
    void openSignedFileUrl(photo.id, 'download');
    closePhotoContextMenu();
  };

  const handleSharePhoto = (photo: FileItem) => {
    setShareModalFile(photo);
    setShareModalOpen(true);
    closePhotoContextMenu();
  };

  const handleCopyPhotoLink = async (photo: FileItem) => {
    try {
      const url = await getSignedFileUrl(photo.id, photo.thumbnailPath ? 'thumbnail' : 'view');
      await navigator.clipboard.writeText(url);
      toast(t('albums.linkCopied'), 'success');
    } catch {
      toast(t('albums.linkCopyError'), 'error');
    }
    closePhotoContextMenu();
  };

  const handleFavoritePhoto = async (photo: FileItem) => {
    try {
      await api.patch(`/files/${photo.id}/favorite`);
      setAlbumPhotos(prev => prev.map(p =>
        p.id === photo.id ? { ...p, isFavorite: !p.isFavorite } : p
      ));
      toast(photo.isFavorite ? t('albums.removedFromFavorites') : t('albums.addedToFavorites'), 'success');
    } catch {
      toast(t('albums.favoriteError'), 'error');
    }
    closePhotoContextMenu();
  };

  const handleShowPhotoInfo = (photo: FileItem) => {
    setInfoPhoto(photo);
    closePhotoContextMenu();
  };

  const handleRemovePhotoFromMenu = async (photo: FileItem) => {
    await removePhotoFromAlbum(photo.id);
    closePhotoContextMenu();
  };

  const formatSize = (bytes: number | string) => {
    const numBytes = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (numBytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return parseFloat((numBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Album detail view
  if (albumId && currentAlbum) {
    return (
      <div>
        {/* Photos grid */}
        {albumPhotos.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {albumPhotos.map((photo) => {
              const isSelected = selectedItems.has(photo.id);

              const handlePhotoClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                // Shift+Click: Range selection
                if (e.shiftKey && lastSelectedId) {
                  const ids = albumPhotos.map(p => p.id);
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
                // Simple click: Select only this item
                else {
                  selectSingle(photo.id);
                }
              };

              return (
                <motion.div
                  key={photo.id}
                  data-file-item={photo.id}
                  onClick={handlePhotoClick}
                  onContextMenu={(e) => handlePhotoContextMenu(e, photo)}
                  animate={isSelected ? { scale: 0.95 } : { scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={cn(
                    'group relative aspect-square rounded-xl overflow-hidden bg-dark-100 dark:bg-dark-700 cursor-pointer transition-all',
                    isSelected && 'ring-3 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-dark-900'
                  )}
                >
                  <AuthenticatedImage
                    fileId={photo.id}
                    endpoint={photo.thumbnailPath ? 'thumbnail' : 'view'}
                    alt={photo.name}
                    placeholderSrc={photo.lqip}
                    className="w-full h-full object-cover"
                  />
                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removePhotoFromAlbum(photo.id); }}
                    className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-dark-500">
            <AlbumIcon className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">{t('albums.noPhotos')}</p>
            <p className="text-sm">{t('albums.addPhotosHint')}</p>
          </div>
        )}

        {/* Add photos modal */}
        <Modal
          isOpen={showAddPhotosModal}
          onClose={() => setShowAddPhotosModal(false)}
          title={t('albums.addPhotosToAlbum')}
          size="lg"
        >
          <div className="max-h-96 overflow-y-auto">
            {availablePhotos.length === 0 ? (
              <p className="text-center text-dark-500 py-8">{t('albums.noAvailablePhotos')}</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {availablePhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => togglePhotoSelection(photo.id)}
                    className={cn(
                      'aspect-square rounded-lg overflow-hidden cursor-pointer ring-2 transition-all',
                      selectedPhotos.includes(photo.id)
                        ? 'ring-primary-600'
                        : 'ring-transparent hover:ring-dark-300'
                    )}
                  >
                    <AuthenticatedImage
                      fileId={photo.id}
                      endpoint={photo.thumbnailPath ? 'thumbnail' : 'view'}
                      alt={photo.name}
                      placeholderSrc={photo.lqip}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setShowAddPhotosModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={addPhotosToAlbum}
              disabled={selectedPhotos.length === 0}
            >
              {t('albums.addPhotosCount', { count: selectedPhotos.length })}
            </Button>
          </div>
        </Modal>

        {/* Photo Context Menu */}
        <AnimatePresence>
          {photoContextMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{
                position: 'fixed',
                left: photoContextMenu.x + 288 > window.innerWidth ? photoContextMenu.x - 288 : photoContextMenu.x,
                top: (() => {
                  const menuHeight = 420;
                  const padding = 20;
                  if (photoContextMenu.y + menuHeight > window.innerHeight - padding) {
                    return Math.max(padding, photoContextMenu.y - menuHeight);
                  }
                  return photoContextMenu.y;
                })(),
              }}
              className="z-50 min-w-[180px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 overflow-hidden"
            >
              {/* Ver */}
              <div className="px-2 py-1">
                <button
                  onClick={() => handleViewPhoto(photoContextMenu.photo)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  <span>{t('albums.viewImage')}</span>
                </button>
              </div>

              <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

              {/* Acciones */}
              <div className="px-2 py-1">
                <button
                  onClick={() => handleDownloadPhoto(photoContextMenu.photo)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('common.download')}</span>
                </button>
                <button
                  onClick={() => handleSharePhoto(photoContextMenu.photo)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{t('common.share')}</span>
                </button>
                <button
                  onClick={() => handleCopyPhotoLink(photoContextMenu.photo)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>{t('common.copyLink')}</span>
                </button>
              </div>

              <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

              {/* Organización */}
              <div className="px-2 py-1">
                <button
                  onClick={() => handleFavoritePhoto(photoContextMenu.photo)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <Star className={cn('w-4 h-4', photoContextMenu.photo.isFavorite && 'fill-yellow-500 text-yellow-500')} />
                  <span>{photoContextMenu.photo.isFavorite ? t('common.removeFromFavorites') : t('common.addToFavorites')}</span>
                </button>
                <button
                  onClick={() => handleShowPhotoInfo(photoContextMenu.photo)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <Info className="w-4 h-4" />
                  <span>{t('common.info')}</span>
                </button>
              </div>

              <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

              {/* Quitar del álbum */}
              <div className="px-2 py-1">
                <button
                  onClick={() => handleRemovePhotoFromMenu(photoContextMenu.photo)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>{t('albums.removeFromAlbum')}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Share Modal */}
        {shareModalOpen && shareModalFile && (
          <ShareModal
            isOpen={shareModalOpen}
            onClose={() => {
              setShareModalOpen(false);
              setShareModalFile(null);
            }}
            file={shareModalFile}
          />
        )}

        {/* Info Modal */}
        {infoPhoto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setInfoPhoto(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-lg w-full p-8"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-dark-100 dark:bg-dark-700">
                  <AuthenticatedImage
                    fileId={infoPhoto.id}
                    endpoint={infoPhoto.thumbnailPath ? 'thumbnail' : 'view'}
                    alt={infoPhoto.name}
                    placeholderSrc={infoPhoto.lqip}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold text-dark-900 dark:text-white truncate">
                    {infoPhoto.name}
                  </h3>
                  <p className="text-sm text-dark-500">{infoPhoto.mimeType}</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                  <span className="text-dark-500">{t('albums.size')}</span>
                  <span className="text-dark-900 dark:text-white font-medium">{formatSize(infoPhoto.size)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                  <span className="text-dark-500">{t('albums.uploadDate')}</span>
                  <span className="text-dark-900 dark:text-white font-medium">{formatDate(infoPhoto.createdAt)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-dark-500">{t('albums.favorite')}</span>
                  <span className="text-dark-900 dark:text-white font-medium">{infoPhoto.isFavorite ? t('common.yes') : t('common.no')}</span>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setInfoPhoto(null)}>
                  {t('common.close')}
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Lightbox */}
        {lightboxPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            onClick={() => setLightboxPhoto(null)}
          >
            <button
              onClick={() => setLightboxPhoto(null)}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <AuthenticatedImage
              fileId={lightboxPhoto.id}
              endpoint="view"
              alt={lightboxPhoto.name}
              placeholderSrc={lightboxPhoto.lqip}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    );
  }

  // Albums list view
  const albumsListContextMenuItems: ContextMenuItemOrDivider[] = [
    {
      id: 'create-album',
      label: t('albums.createAlbum'),
      icon: FolderPlus,
      onClick: () => setShowCreateModal(true),
    },
  ];

  return (
    <div
      className="h-full"
      onContextMenu={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest?.('a')) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      onClick={() => setContextMenu(null)}
    >
      <ContextMenu items={albumsListContextMenuItems} position={contextMenu} onClose={() => setContextMenu(null)} />

      {/* Albums grid */}
      {albums.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {albums.map((album) => (
            <Link
              key={album.id}
              to={`/albums/${album.id}`}
              className="group rounded-lg border border-dark-100 dark:border-dark-700 overflow-hidden hover:border-dark-200 dark:hover:border-dark-600 transition-colors"
            >
              <div className="aspect-square bg-dark-50 dark:bg-dark-800 flex items-center justify-center overflow-hidden">
                {album.files && album.files.length >= 4 ? (
                  <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5">
                    {album.files.slice(0, 4).map((file) => (
                      <AuthenticatedImage
                        key={file.id}
                        fileId={file.id}
                        endpoint={file.thumbnailPath ? 'thumbnail' : 'view'}
                        alt={file.name}
                        placeholderSrc={file.lqip}
                        className="w-full h-full object-cover"
                      />
                    ))}
                  </div>
                ) : album.coverUrl ? (
                  <img
                    src={album.coverUrl}
                    alt={album.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <AlbumIcon className="w-10 h-10 text-dark-400" />
                )}
              </div>
              <div className="p-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-dark-900 dark:text-white truncate">
                    {album.name}
                  </h3>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      deleteAlbum(album.id);
                    }}
                    className="p-1 text-dark-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-dark-500">
                  {t('albums.photosCount', { count: album._count?.files || 0 })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create album modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('albums.createAlbum')}
        size="sm"
      >
        <Input
          label={t('albums.albumName')}
          placeholder={t('albums.myAlbum')}
          value={newAlbumName}
          onChange={(e) => setNewAlbumName(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={createAlbum} loading={creating}>
            {t('common.create')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
