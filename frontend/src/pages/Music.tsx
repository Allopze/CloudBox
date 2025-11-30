import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getFileUrl } from '../lib/api';
import { FileItem } from '../types';
import { useMusicStore } from '../stores/musicStore';
import { useFileStore } from '../stores/fileStore';
import {
  Loader2, Music, Play, Heart, Disc, ChevronLeft, Check,
  Download, Share2, Trash2, ListPlus, Info, Copy, Star
} from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import ShareModal from '../components/modals/ShareModal';
import Button from '../components/ui/Button';

interface ContextMenuState {
  x: number;
  y: number;
  track: FileItem;
}

// Generate a consistent gradient color based on the track name
const getGradientColors = (name: string) => {
  const gradients = [
    ['from-rose-400', 'to-orange-300'],
    ['from-violet-400', 'to-purple-300'],
    ['from-blue-400', 'to-cyan-300'],
    ['from-emerald-400', 'to-teal-300'],
    ['from-amber-400', 'to-yellow-300'],
    ['from-pink-400', 'to-rose-300'],
    ['from-indigo-400', 'to-blue-300'],
    ['from-fuchsia-400', 'to-pink-300'],
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % gradients.length;
  return gradients[index];
};

export default function MusicPage() {
  const [searchParams] = useSearchParams();
  const [tracks, setTracks] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [trackDurations, setTrackDurations] = useState<Record<string, number>>({});
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModalFile, setShareModalFile] = useState<FileItem | null>(null);
  const [infoTrack, setInfoTrack] = useState<FileItem | null>(null);

  const tab = searchParams.get('tab') || 'all';

  const {
    currentTrack,
    isPlaying,
    setCurrentTrack,
    setIsPlaying,
    setQueue,
  } = useMusicStore();

  const { selectedItems, addToSelection, removeFromSelection, selectRange, selectSingle, lastSelectedId, clearSelection } = useFileStore();

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { type: 'audio', sortBy: 'name', sortOrder: 'asc' };

      // Filter by favorites if on favorites tab
      if (tab === 'favorites') {
        params.favorite = 'true';
      }

      const [filesRes, foldersRes] = await Promise.all([
        api.get('/files', { params, signal }),
        api.get('/folders', { signal })
      ]);

      // Don't update state if the request was aborted
      if (signal?.aborted) return;

      const audioFiles = filesRes.data.files || [];
      setTracks(audioFiles);
      setQueue(audioFiles);

      // Create folder name lookup - folders API returns array directly
      const folderMap: Record<string, string> = {};
      const foldersData = Array.isArray(foldersRes.data) ? foldersRes.data : (foldersRes.data.folders || []);
      foldersData.forEach((folder: { id: string; name: string }) => {
        folderMap[folder.id] = folder.name;
      });
      setFolders(folderMap);

      // Load durations for all tracks
      // Load durations sequentially to avoid memory leaks
      const loadDurations = async () => {
        const audio = new Audio();
        audio.volume = 0;

        for (const track of audioFiles) {
          if (signal?.aborted) break;

          try {
            await new Promise<void>((resolve) => {
              const onLoaded = () => {
                setTrackDurations(prev => ({ ...prev, [track.id]: audio.duration }));
                resolve();
              };
              const onError = () => resolve();

              audio.addEventListener('loadedmetadata', onLoaded, { once: true });
              audio.addEventListener('error', onError, { once: true });
              audio.src = getFileUrl(`/files/${track.id}/stream`);
            });
          } catch (e) {
            console.error(`Failed to load duration for ${track.name}`, e);
          }
        }

        audio.src = '';
      };

      loadDurations();
    } catch (error) {
      // Ignore aborted requests
      if (signal?.aborted) return;
      console.error('Failed to load music:', error);
      toast('Error al cargar la música', 'error');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [setQueue, tab]);

  useEffect(() => {
    const abortController = new AbortController();
    loadData(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [loadData]);

  // Clear selection when tab changes
  useEffect(() => {
    clearSelection();
  }, [tab, clearSelection]);

  // Reset selected album when changing tabs
  useEffect(() => {
    setSelectedAlbum(null);
  }, [tab]);

  // Listen for workzone refresh event from MainLayout context menu
  useEffect(() => {
    const handleRefresh = () => loadData(undefined);
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [loadData]);

  const toggleFavorite = async (e: React.MouseEvent, track: FileItem) => {
    e.stopPropagation();
    try {
      await api.patch(`/files/${track.id}/favorite`);
      // Update local state
      setTracks(prev => prev.map(t =>
        t.id === track.id ? { ...t, isFavorite: !t.isFavorite } : t
      ));
      toast(track.isFavorite ? 'Eliminado de favoritos' : 'Añadido a favoritos', 'success');
    } catch (error) {
      toast('Error al actualizar favorito', 'error');
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, track: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, track });
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

  const handlePlayFromMenu = (track: FileItem) => {
    playTrack(track);
    closeContextMenu();
  };

  const handleAddToQueue = (track: FileItem) => {
    const currentQueue = useMusicStore.getState().queue;
    setQueue([...currentQueue, track]);
    toast('Añadido a la cola', 'success');
    closeContextMenu();
  };

  const handleDownload = (track: FileItem) => {
    window.open(getFileUrl(`/files/${track.id}/download`), '_blank');
    closeContextMenu();
  };

  const handleShare = (track: FileItem) => {
    setShareModalFile(track);
    setShareModalOpen(true);
    closeContextMenu();
  };

  const handleCopyLink = async (track: FileItem) => {
    try {
      const url = `${window.location.origin}${getFileUrl(`/files/${track.id}/stream`)}`;
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado al portapapeles', 'success');
    } catch {
      toast('Error al copiar el enlace', 'error');
    }
    closeContextMenu();
  };

  const handleShowInfo = (track: FileItem) => {
    setInfoTrack(track);
    closeContextMenu();
  };

  const handleFavoriteFromMenu = async (track: FileItem) => {
    try {
      await api.patch(`/files/${track.id}/favorite`);
      setTracks(prev => prev.map(t =>
        t.id === track.id ? { ...t, isFavorite: !t.isFavorite } : t
      ));
      toast(track.isFavorite ? 'Eliminado de favoritos' : 'Añadido a favoritos', 'success');
    } catch {
      toast('Error al actualizar favorito', 'error');
    }
    closeContextMenu();
  };

  const handleDelete = async (track: FileItem) => {
    const { selectedItems, clearSelection } = useFileStore.getState();
    const isMultiSelect = selectedItems.size > 1 && selectedItems.has(track.id);

    try {
      if (isMultiSelect) {
        const promises = Array.from(selectedItems).map(id => api.delete(`/files/${id}`));
        await Promise.all(promises);
        toast(`${selectedItems.size} canciones eliminadas`, 'success');
        clearSelection();
      } else {
        await api.delete(`/files/${track.id}`);
        toast('Canción movida a la papelera', 'success');
      }
      loadData();
    } catch {
      toast('Error al eliminar', 'error');
    }
    closeContextMenu();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const playTrack = (track: FileItem) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  // Remove file extension from name for display
  const getDisplayName = (name: string) => {
    return name.replace(/\.[^/.]+$/, '');
  };

  // Group tracks by folder for albums view. Must stay before early returns so hook order stays stable.
  const albumGroups = useMemo(() => {
    const groups: Record<string, { name: string; tracks: FileItem[]; cover: string | null }> = {};

    tracks.forEach(track => {
      const folderId = track.folderId || 'no-folder';
      const folderName = folders[folderId] || 'Sin álbum';

      if (!groups[folderId]) {
        groups[folderId] = {
          name: folderName,
          tracks: [],
          cover: null
        };
      }
      groups[folderId].tracks.push(track);
      // Use first track with thumbnail as cover
      if (!groups[folderId].cover && track.thumbnailPath) {
        groups[folderId].cover = track.id;
      }
    });

    return Object.entries(groups).map(([id, data]) => ({
      id,
      ...data
    }));
  }, [tracks, folders]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Get tracks for selected album
  const selectedAlbumData = selectedAlbum
    ? albumGroups.find(a => a.id === selectedAlbum)
    : null;

  // Albums view
  if (tab === 'albums') {
    // Show album detail
    if (selectedAlbumData) {
      const albumTracks = selectedAlbumData.tracks;

      return (
        <div className="pb-24">
          {/* Back button and album info */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setSelectedAlbum(null)}
              className="p-2 rounded-full hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-dark-500" />
            </button>
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center shadow-md',
                !selectedAlbumData.cover && 'bg-gradient-to-br from-violet-400 to-purple-300'
              )}>
                {selectedAlbumData.cover ? (
                  <img
                    src={getFileUrl(`/files/${selectedAlbumData.cover}/thumbnail`)}
                    alt={selectedAlbumData.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc className="w-8 h-8 text-white/80" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-dark-900 dark:text-white">
                  {selectedAlbumData.name}
                </h2>
                <p className="text-sm text-dark-500">
                  {albumTracks.length} {albumTracks.length === 1 ? 'canción' : 'canciones'}
                </p>
              </div>
            </div>
          </div>

          {/* Track list */}
          <div className="space-y-1">
            {albumTracks.map((track, index) => {
              const isCurrentTrack = currentTrack?.id === track.id;
              const [fromColor, toColor] = getGradientColors(track.name);

              return (
                <div
                  key={track.id}
                  onClick={() => {
                    setQueue(albumTracks);
                    playTrack(track);
                  }}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors',
                    'hover:bg-dark-100 dark:hover:bg-dark-800',
                    isCurrentTrack && 'bg-dark-100 dark:bg-dark-800'
                  )}
                >
                  <span className="w-6 text-center text-sm text-dark-400">
                    {isCurrentTrack && isPlaying ? (
                      <div className="flex items-end justify-center gap-0.5 h-4">
                        <div className="w-1 bg-primary-500 rounded-full animate-music-bar-1" />
                        <div className="w-1 bg-primary-500 rounded-full animate-music-bar-2" />
                        <div className="w-1 bg-primary-500 rounded-full animate-music-bar-3" />
                      </div>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div className={cn(
                    'w-10 h-10 rounded overflow-hidden flex-shrink-0',
                    !track.thumbnailPath && `bg-gradient-to-br ${fromColor} ${toColor}`
                  )}>
                    {track.thumbnailPath ? (
                      <img
                        src={getFileUrl(`/files/${track.id}/thumbnail`)}
                        alt={track.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-5 h-5 text-white/80" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-medium truncate',
                      isCurrentTrack ? 'text-primary-600' : 'text-dark-900 dark:text-white'
                    )}>
                      {getDisplayName(track.name)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => toggleFavorite(e, track)}
                    className={cn(
                      'p-1.5 rounded-full transition-colors',
                      track.isFavorite
                        ? 'text-red-500'
                        : 'text-dark-400 opacity-0 group-hover:opacity-100 hover:text-red-500'
                    )}
                  >
                    <Heart className={cn('w-4 h-4', track.isFavorite && 'fill-current')} />
                  </button>
                  {trackDurations[track.id] && (
                    <span className="text-xs text-dark-400 w-10 text-right">
                      {formatTime(trackDurations[track.id])}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Show albums grid
    return (
      <div className="pb-24">
        {albumGroups.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {albumGroups.map((album) => {
              const [fromColor, toColor] = getGradientColors(album.name);

              return (
                <div
                  key={album.id}
                  onClick={() => setSelectedAlbum(album.id)}
                  className="group cursor-pointer rounded-xl transition-all duration-200 hover:bg-dark-100 dark:hover:bg-dark-800 p-2"
                >
                  <div className={cn(
                    'relative aspect-square rounded-lg overflow-hidden mb-3 shadow-md',
                    !album.cover && `bg-gradient-to-br ${fromColor} ${toColor}`
                  )}>
                    {album.cover ? (
                      <img
                        src={getFileUrl(`/files/${album.cover}/thumbnail`)}
                        alt={album.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Disc className="w-12 h-12 text-white/80" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 text-white fill-white" />
                      </div>
                    </div>
                  </div>

                  <div className="px-1">
                    <p className="font-medium text-sm truncate text-dark-900 dark:text-white">
                      {album.name}
                    </p>
                    <p className="text-xs text-dark-500">
                      {album.tracks.length} {album.tracks.length === 1 ? 'canción' : 'canciones'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-dark-500">
            <Disc className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No hay álbumes</p>
            <p className="text-sm">Organiza tu música en carpetas para crear álbumes</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Track grid */}
      {tracks.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {tracks.map((track) => {
            const [fromColor, toColor] = getGradientColors(track.name);
            const isCurrentTrack = currentTrack?.id === track.id;
            const isSelected = selectedItems.has(track.id);

            const handleTrackClick = (e: React.MouseEvent) => {
              // Shift+Click: Range selection
              if (e.shiftKey && lastSelectedId) {
                const ids = tracks.map(t => t.id);
                selectRange(ids, track.id);
              }
              // Ctrl/Meta+Click: Toggle selection
              else if (e.ctrlKey || e.metaKey) {
                if (isSelected) {
                  removeFromSelection(track.id);
                } else {
                  addToSelection(track.id);
                }
              }
              // Simple click with selection: select single
              else if (selectedItems.size > 0 && !isSelected) {
                selectSingle(track.id);
              }
              // Simple click: play track
              else {
                playTrack(track);
              }
            };

            return (
              <motion.div
                key={track.id}
                data-file-item={track.id}
                onClick={handleTrackClick}
                onDoubleClick={() => playTrack(track)}
                onContextMenu={(e) => handleContextMenu(e, track)}
                animate={isSelected ? { scale: 0.95 } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={cn(
                  'group cursor-pointer rounded-xl transition-all duration-200 p-2',
                  'hover:bg-dark-100 dark:hover:bg-dark-800',
                  isCurrentTrack && 'bg-dark-100 dark:bg-dark-800',
                  isSelected && 'ring-3 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-dark-900'
                )}
              >
                {/* Album art / Cover */}
                <div className={cn(
                  'relative aspect-square rounded-lg overflow-hidden mb-3 shadow-md',
                  !track.thumbnailPath && `bg-gradient-to-br ${fromColor} ${toColor}`
                )}>
                  {/* Cover image or fallback gradient with icon */}
                  {track.thumbnailPath ? (
                    <img
                      src={getFileUrl(`/files/${track.id}/thumbnail`)}
                      alt={track.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Music className="w-12 h-12 text-white/80" />
                    </div>
                  )}

                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg z-20">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}

                  {/* Favorite button */}
                  <button
                    onClick={(e) => toggleFavorite(e, track)}
                    className={cn(
                      'absolute top-2 right-2 p-1.5 rounded-full transition-all z-10',
                      track.isFavorite
                        ? 'bg-red-500 text-white'
                        : 'bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-black/60'
                    )}
                  >
                    <Heart className={cn('w-4 h-4', track.isFavorite && 'fill-current')} />
                  </button>

                  {/* Playing indicator / Play button overlay */}
                  <div className={cn(
                    'absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity',
                    isCurrentTrack && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  )}>
                    {isCurrentTrack && isPlaying ? (
                      <div className="flex items-end gap-1 h-8">
                        <div className="w-1.5 bg-white rounded-full animate-music-bar-1" />
                        <div className="w-1.5 bg-white rounded-full animate-music-bar-2" />
                        <div className="w-1.5 bg-white rounded-full animate-music-bar-3" />
                        <div className="w-1.5 bg-white rounded-full animate-music-bar-1" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                        <Play className="w-6 h-6 text-white fill-white" />
                      </div>
                    )}
                  </div>

                  {/* Duration badge */}
                  {trackDurations[track.id] && (
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 rounded text-xs text-white font-medium">
                      {formatTime(trackDurations[track.id])}
                    </div>
                  )}
                </div>

                {/* Track info */}
                <div className="px-1">
                  <p className={cn(
                    'font-medium text-sm truncate',
                    isCurrentTrack ? 'text-primary-600' : 'text-dark-900 dark:text-white'
                  )}>
                    {getDisplayName(track.name)}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-dark-500">
          <Music className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">No hay música</p>
          <p className="text-sm">Sube archivos de audio para verlos aquí</p>
        </div>
      )}

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (() => {
          // Get current selection state
          const currentSelectedItems = useFileStore.getState().selectedItems;
          const isMultiSelect = currentSelectedItems.size > 1 && currentSelectedItems.has(contextMenu.track.id);
          const selectedCount = isMultiSelect ? currentSelectedItems.size : 1;

          const menuWidth = 288;
          const baseHeight = isMultiSelect ? 180 : 420;
          const padding = 20;

          let left = contextMenu.x + menuWidth > window.innerWidth ? contextMenu.x - menuWidth : contextMenu.x;
          let top = contextMenu.y;

          if (contextMenu.y + baseHeight > window.innerHeight - padding) {
            top = Math.max(padding, contextMenu.y - baseHeight);
          }

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{ position: 'fixed', left, top }}
              className="z-50 min-w-72 bg-white dark:bg-dark-800 rounded-xl shadow-2xl border border-dark-200 dark:border-dark-700 py-2 overflow-hidden"
            >
              {/* Header for multi-select */}
              {isMultiSelect && (
                <>
                  <div className="px-4 py-2 text-sm font-medium text-dark-500 dark:text-dark-400">
                    {selectedCount} canciones seleccionadas
                  </div>
                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Single item actions */}
              {!isMultiSelect && (
                <>
                  {/* Reproducir */}
                  <div className="px-2 py-1">
                    <button
                      onClick={() => handlePlayFromMenu(contextMenu.track)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Play className="w-5 h-5" />
                      <span>Reproducir</span>
                    </button>
                    <button
                      onClick={() => handleAddToQueue(contextMenu.track)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <ListPlus className="w-5 h-5" />
                      <span>Añadir a la cola</span>
                    </button>
                  </div>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

                  {/* Acciones de archivo */}
                  <div className="px-2 py-1">
                    <button
                      onClick={() => handleDownload(contextMenu.track)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      <span>Descargar</span>
                    </button>
                    <button
                      onClick={() => handleShare(contextMenu.track)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Share2 className="w-5 h-5" />
                      <span>Compartir</span>
                    </button>
                    <button
                      onClick={() => handleCopyLink(contextMenu.track)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Copy className="w-5 h-5" />
                      <span>Copiar enlace</span>
                    </button>
                  </div>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

                  {/* Organización */}
                  <div className="px-2 py-1">
                    <button
                      onClick={() => handleFavoriteFromMenu(contextMenu.track)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Star className={cn('w-5 h-5', contextMenu.track.isFavorite && 'fill-yellow-500 text-yellow-500')} />
                      <span>{contextMenu.track.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}</span>
                    </button>
                    <button
                      onClick={() => handleShowInfo(contextMenu.track)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Info className="w-5 h-5" />
                      <span>Información</span>
                    </button>
                  </div>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Multi-select actions */}
              {isMultiSelect && (
                <>
                  <div className="px-2 py-1">
                    <button
                      onClick={() => {
                        const selected = tracks.filter(t => currentSelectedItems.has(t.id));
                        selected.forEach(t => handleAddToQueue(t));
                        closeContextMenu();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <ListPlus className="w-5 h-5" />
                      <span>Añadir {selectedCount} a la cola</span>
                    </button>
                    <button
                      onClick={() => {
                        const selected = tracks.filter(t => currentSelectedItems.has(t.id));
                        selected.forEach(t => handleDownload(t));
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      <span>Descargar {selectedCount} canciones</span>
                    </button>
                  </div>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Eliminar - siempre visible */}
              <div className="px-2 py-1">
                <button
                  onClick={() => handleDelete(contextMenu.track)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>{isMultiSelect ? `Eliminar ${selectedCount} canciones` : 'Eliminar'}</span>
                </button>
              </div>
            </motion.div>
          );
        })()}
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
      {infoTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-lg w-full p-8"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className={cn(
                'w-20 h-20 rounded-lg overflow-hidden flex-shrink-0',
                !infoTrack.thumbnailPath && 'bg-gradient-to-br from-primary-400 to-primary-600'
              )}>
                {infoTrack.thumbnailPath ? (
                  <img
                    src={getFileUrl(`/files/${infoTrack.id}/thumbnail`)}
                    alt={infoTrack.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-10 h-10 text-white/80" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold text-dark-900 dark:text-white truncate">
                  {getDisplayName(infoTrack.name)}
                </h3>
                <p className="text-sm text-dark-500">{infoTrack.mimeType}</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">Tamaño</span>
                <span className="text-dark-900 dark:text-white font-medium">{formatSize(Number(infoTrack.size))}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">Duración</span>
                <span className="text-dark-900 dark:text-white font-medium">
                  {trackDurations[infoTrack.id] ? formatTime(trackDurations[infoTrack.id]) : 'Calculando...'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">Fecha de subida</span>
                <span className="text-dark-900 dark:text-white font-medium">{formatDate(infoTrack.createdAt)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-dark-500">Favorito</span>
                <span className="text-dark-900 dark:text-white font-medium">{infoTrack.isFavorite ? 'Sí' : 'No'}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setInfoTrack(null)}>
                Cerrar
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
