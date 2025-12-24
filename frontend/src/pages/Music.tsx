import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, getSignedFileUrl, openSignedFileUrl } from '../lib/api';
import { FileItem } from '../types';
import { useMusicStore } from '../stores/musicStore';
import { useFileStore } from '../stores/fileStore';
import {
  Loader2, Music, Play, Heart, Disc, ChevronLeft, Check,
  Download, Share2, Trash2, ListPlus, Info, Copy, Star, Plus, FolderPlus
} from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn, formatDate } from '../lib/utils';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { waveIn } from '../lib/animations';
import ShareModal from '../components/modals/ShareModal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import AuthenticatedImage from '../components/AuthenticatedImage';
import FileCard from '../components/files/FileCard';

interface ContextMenuState {
  x: number;
  y: number;
  item: FileItem | any;
  type: 'song' | 'album';
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
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<FileItem[]>([]);
  // Store full folder objects
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackDurations, setTrackDurations] = useState<Record<string, number>>({});
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Create album modal state
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModalFile, setShareModalFile] = useState<FileItem | null>(null);
  const [infoTrack, setInfoTrack] = useState<FileItem | null>(null);

  const tab = searchParams.get('tab') || 'all';
  const searchQuery = searchParams.get('search') || '';

  const {
    currentTrack,
    isPlaying,
    setCurrentTrack,
    setIsPlaying,
    setQueue,
  } = useMusicStore();

  const { selectedItems, addToSelection, removeFromSelection, selectRange, selectSingle, lastSelectedId, clearSelection, sortBy, sortOrder, viewMode } = useFileStore();

  const loadData = useCallback(async (signal?: AbortSignal, pageNum: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setPage(1);
      setHasMore(true);
    }
    try {
      // Map sortBy to API-compatible values
      const apiSortBy = sortBy === 'date' ? 'createdAt' : sortBy;
      const params: Record<string, string> = {
        type: 'audio',
        sortBy: apiSortBy,
        sortOrder,
        page: pageNum.toString(),
        limit: '50'
      };

      // Filter by favorites if on favorites tab
      if (tab === 'favorites') {
        params.favorite = 'true';
      }

      // Add search query for global search
      if (searchQuery) {
        params.search = searchQuery;
      }

      const filesRes = await api.get('/files', { params, signal });

      // Don't update state if the request was aborted
      if (signal?.aborted) return;

      const audioFiles = filesRes.data.files || [];
      const pagination = filesRes.data.pagination;

      // Update hasMore based on pagination
      if (pagination) {
        setHasMore(pagination.page < pagination.totalPages);
        setPage(pagination.page);
      } else {
        setHasMore(audioFiles.length === 50);
      }

      if (append) {
        setTracks(prev => [...prev, ...audioFiles]);
        // musicStore.setQueue expects an array, not a callback
        const currentQueue = useMusicStore.getState().queue;
        setQueue([...currentQueue, ...audioFiles]);
      } else {
        setTracks(audioFiles);
        setQueue(audioFiles);

        // Fetch folders only on initial load
        const foldersRes = await api.get('/folders', { signal });
        if (!signal?.aborted) {
          const foldersData = Array.isArray(foldersRes.data) ? foldersRes.data : (foldersRes.data.folders || []);
          setFolders(foldersData);
        }
      }

      // Load durations for new tracks
      const loadDurations = async () => {
        const audio = new Audio();
        audio.volume = 0;

        for (const track of audioFiles) {
          if (signal?.aborted) break;

          try {
            const streamUrl = await getSignedFileUrl(track.id, 'stream');
            await new Promise<void>((resolve) => {
              const onLoaded = () => {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                  setTrackDurations(prev => ({ ...prev, [track.id]: audio.duration }));
                }
                resolve();
              };
              const onError = () => resolve();

              audio.addEventListener('loadedmetadata', onLoaded, { once: true });
              audio.addEventListener('error', onError, { once: true });
              audio.src = streamUrl;
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
      toast(t('music.loadError'), 'error');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [setQueue, tab, sortBy, sortOrder, searchQuery]);

  // Load more function for pagination
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      loadData(undefined, page + 1, true);
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

  // Sync selectedAlbum with URL folder param
  const folderId = searchParams.get('folder');

  useEffect(() => {
    // Only update if on albums tab to avoid conflicts
    if (tab === 'albums') {
      setSelectedAlbum(folderId || null);
    }
  }, [folderId, tab]);

  // Reset selected album (and URL) when changing tabs
  useEffect(() => {
    if (tab !== 'albums' && selectedAlbum) {
      setSelectedAlbum(null);
      // Clean up URL if needed, but usually tab change handles it
    }
  }, [tab]);

  // Listen for workzone refresh event from MainLayout context menu
  useEffect(() => {
    const handleRefresh = () => loadData(undefined);
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [loadData]);

  // Listen for create-music-album event from MainLayout breadcrumb
  useEffect(() => {
    const handleCreateAlbum = () => setCreateAlbumOpen(true);
    window.addEventListener('create-music-album', handleCreateAlbum);
    return () => window.removeEventListener('create-music-album', handleCreateAlbum);
  }, []);

  // Create album function
  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim()) return;

    setCreatingAlbum(true);
    try {
      await api.post('/folders', { name: newAlbumName.trim(), category: 'music' });
      toast(t('music.albumCreated'), 'success');
      setNewAlbumName('');
      setCreateAlbumOpen(false);
      loadData(undefined);
      // Navigate to albums tab to see the new album
      navigate('/music?tab=albums');
    } catch (error: any) {
      console.error('Create album error:', error);
      // Show specific validation error if available
      const message = error.response?.data?.details?.[0]?.message
        ? `Error: ${error.response.data.details[0].message} (${error.response.data.details[0].path})`
        : error.response?.data?.error || t('music.albumCreateError');

      toast(message, 'error');
    } finally {
      setCreatingAlbum(false);
    }
  };

  const toggleFavorite = async (e: React.MouseEvent, track: FileItem) => {
    e.stopPropagation();
    try {
      await api.patch(`/files/${track.id}/favorite`);
      // Update local state
      setTracks(prev => prev.map(t =>
        t.id === track.id ? { ...t, isFavorite: !t.isFavorite } : t
      ));
      toast(track.isFavorite ? t('music.removedFromFavorites') : t('music.addedToFavorites'), 'success');
    } catch (error) {
      toast(t('music.favoriteError'), 'error');
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, item: FileItem | any, type: 'song' | 'album' = 'song') => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item, type });
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
    toast(t('music.addedToQueue'), 'success');
    closeContextMenu();
  };

  const handleDownload = (track: FileItem) => {
    void openSignedFileUrl(track.id, 'download');
    closeContextMenu();
  };

  const handleShare = (track: FileItem) => {
    setShareModalFile(track);
    setShareModalOpen(true);
    closeContextMenu();
  };

  const handleCopyLink = async (track: FileItem) => {
    try {
      const url = await getSignedFileUrl(track.id, 'stream');
      await navigator.clipboard.writeText(url);
      toast(t('music.linkCopied'), 'success');
    } catch {
      toast(t('music.linkCopyError'), 'error');
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
      toast(track.isFavorite ? t('music.removedFromFavorites') : t('music.addedToFavorites'), 'success');
    } catch {
      toast(t('music.favoriteError'), 'error');
    }
    closeContextMenu();
  };

  const handleDelete = async (item: FileItem | any) => {
    if (contextMenu?.type === 'album') {
      try {
        await api.delete(`/folders/${item.id}`);
        toast(t('music.albumDeleted'), 'success'); // Verify translation key or use generic
        const { selectedItems } = useFileStore.getState();
        if (selectedItems.has(item.id)) {
          removeFromSelection(item.id);
        }
        loadData();
      } catch {
        toast(t('music.deleteError'), 'error');
      }
      closeContextMenu();
      return;
    }

    const { selectedItems, clearSelection } = useFileStore.getState();
    // For songs, item is track
    const track = item as FileItem;
    const isMultiSelect = selectedItems.size > 1 && selectedItems.has(track.id);

    try {
      if (isMultiSelect) {
        const promises = Array.from(selectedItems).map(id => api.delete(`/files/${id}`));
        await Promise.all(promises);
        toast(t('music.songsDeleted', { count: selectedItems.size }), 'success');
        clearSelection();
      } else {
        await api.delete(`/files/${track.id}`);
        toast(t('music.songMovedToTrash'), 'success');
      }
      loadData();
    } catch {
      toast(t('music.deleteError'), 'error');
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
    if (!Number.isFinite(time)) return '';
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
    const folderMap: Record<string, any> = {};

    // Create lookup for folders
    folders.forEach(f => {
      folderMap[f.id] = f;
    });

    // Populate groups from tracks
    tracks.forEach(track => {
      const folderId = track.folderId || 'no-folder';
      const folderName = folderMap[folderId]?.name || t('music.noAlbum');

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

    // Add empty root folders as albums ONLY if they are explicitly music category
    folders.forEach(folder => {
      if (!folder.parentId && !groups[folder.id] && folder.category === 'music') {
        groups[folder.id] = {
          name: folder.name,
          tracks: [],
          cover: null
        };
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
              onClick={() => {
                // Update URL to remove folder
                setSearchParams({ tab: 'albums' });
              }}
              className="p-2 rounded-full hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors"
              title={t('common.back')}
              aria-label={t('common.back')}
            >
              <ChevronLeft className="w-5 h-5 text-dark-500" />
            </button>
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center shadow-md',
                !selectedAlbumData.cover && 'bg-gradient-to-br from-violet-400 to-purple-300'
              )}>
                {selectedAlbumData.cover ? (
                  <AuthenticatedImage
                    fileId={selectedAlbumData.cover}
                    endpoint="thumbnail"
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
                  {t('music.songsCount', { count: albumTracks.length })}
                </p>
              </div>
            </div>
          </div>

          {/* Track list */}
          <div className="space-y-1">
            {albumTracks.map((track, index) => {
              const isCurrentTrack = currentTrack?.id === track.id;
              const [fromColor, toColor] = getGradientColors(track.name);
              const isTrackSelected = selectedItems.has(track.id);

              const waveInProps = waveIn(index, reducedMotion);
              const baseAnimate = typeof waveInProps.animate === 'object' ? waveInProps.animate : {};

              return (
                <motion.div
                  key={track.id}
                  initial={waveInProps.initial}
                  animate={{
                    ...baseAnimate,
                    scale: isTrackSelected ? 0.98 : 1
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  data-file-item={track.id}
                  onClick={() => {
                    setQueue(albumTracks);
                    playTrack(track);
                  }}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors group',
                    'hover:bg-dark-100 dark:hover:bg-dark-800',
                    isCurrentTrack && 'bg-dark-100 dark:bg-dark-800',
                    isTrackSelected && 'bg-primary-50/40 dark:bg-primary-900/30 border border-primary-500/50'
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
                      <AuthenticatedImage
                        fileId={track.id}
                        endpoint="thumbnail"
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
                    title={track.isFavorite ? t('music.removeFromFavorites') : t('music.addToFavorites')}
                    aria-label={track.isFavorite ? t('music.removeFromFavorites') : t('music.addToFavorites')}
                  >
                    <Heart className={cn('w-4 h-4', track.isFavorite && 'fill-current')} />
                  </button>
                  {typeof trackDurations[track.id] === 'number' && Number.isFinite(trackDurations[track.id]) && (
                    <span className="text-xs text-dark-400 w-10 text-right">
                      {formatTime(trackDurations[track.id])}
                    </span>
                  )}
                </motion.div>
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {albumGroups.map((album, index) => {
              const [fromColor, toColor] = getGradientColors(album.name);
              const isAlbumSelected = selectedItems.has(album.id);

              const waveInProps = waveIn(index, reducedMotion);
              const baseAnimate = typeof waveInProps.animate === 'object' ? waveInProps.animate : {};

              return (
                <motion.div
                  key={album.id}
                  initial={waveInProps.initial}
                  animate={{
                    ...baseAnimate,
                    scale: isAlbumSelected ? 0.95 : 1
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  data-folder-item={album.id}
                  onClick={() => {
                    // Update URL to include folder ID, enabling drag-and-drop globally
                    setSearchParams({ tab: 'albums', folder: album.id });
                  }}
                  onContextMenu={(e) => handleContextMenu(e, album, 'album')}
                  className={cn(
                    'premium-card group',
                    isAlbumSelected && 'selected'
                  )}
                >
                  {/* Selection indicator */}
                  {isAlbumSelected && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg z-20">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}

                  {/* Album cover */}
                  <div className={cn(
                    'premium-card-thumbnail',
                    !album.cover && `bg-gradient-to-br ${fromColor} ${toColor}`
                  )}>
                    {album.cover ? (
                      <AuthenticatedImage
                        fileId={album.cover}
                        endpoint="thumbnail"
                        alt={album.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Disc className="w-12 h-12 text-white/80" />
                    )}
                  </div>

                  {/* Content Area */}
                  <div className="premium-card-content">
                    <p className="premium-card-name" title={album.name}>
                      {album.name}
                    </p>
                    <div className="premium-card-meta">
                      <span>{t('music.songsCount', { count: album.tracks.length })}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-dark-500">
            <Disc className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">{t('music.noAlbums')}</p>
            <p className="text-sm">{t('music.organizeInFolders')}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Track list/grid */}
      {tracks.length > 0 ? (
        viewMode === 'list' ? (
          // List view
          <div className="flex flex-col gap-1">
            {tracks.map((track) => (
              <FileCard
                key={track.id}
                file={track}
                view="list"
                onRefresh={() => loadData(undefined)}
                onPreview={() => playTrack(track)}
                onFavoriteToggle={(fileId, isFavorite) => {
                  setTracks(prev => prev.map(t => t.id === fileId ? { ...t, isFavorite } : t));
                }}
              />
            ))}
          </div>
        ) : (
          // Grid view
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {tracks.map((track, index) => {
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

              const waveInProps = waveIn(index, reducedMotion);
              const baseAnimate = typeof waveInProps.animate === 'object' ? waveInProps.animate : {};

              return (
                <motion.div
                  key={track.id}
                  initial={waveInProps.initial}
                  animate={{
                    ...baseAnimate,
                    scale: isSelected ? 0.95 : 1
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  data-file-item={track.id}
                  onClick={handleTrackClick}
                  onDoubleClick={() => playTrack(track)}
                  onContextMenu={(e) => handleContextMenu(e, track)}
                  className={cn(
                    'premium-card group',
                    isSelected && 'selected',
                    isCurrentTrack && 'bg-dark-100 dark:bg-dark-800'
                  )}
                >
                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg z-20">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}

                  {/* Favorite badge - top left */}
                  {track.isFavorite && !isSelected && (
                    <div className="absolute top-2 left-2 z-10">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-md" />
                    </div>
                  )}

                  {/* Album art / Cover */}
                  <div className={cn(
                    'premium-card-thumbnail',
                    !track.thumbnailPath && `bg-gradient-to-br ${fromColor} ${toColor}`
                  )}>
                    {track.thumbnailPath ? (
                      <AuthenticatedImage
                        fileId={track.id}
                        endpoint="thumbnail"
                        alt={track.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Music className="w-12 h-12 text-white/80" />
                    )}

                    {/* Playing indicator overlay */}
                    {isCurrentTrack && isPlaying && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="flex items-end gap-1 h-8">
                          <div className="w-1.5 bg-white rounded-full animate-music-bar-1" />
                          <div className="w-1.5 bg-white rounded-full animate-music-bar-2" />
                          <div className="w-1.5 bg-white rounded-full animate-music-bar-3" />
                          <div className="w-1.5 bg-white rounded-full animate-music-bar-1" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Content Area */}
                  <div className="premium-card-content">
                    <p className={cn(
                      'premium-card-name',
                      isCurrentTrack && 'text-primary-600'
                    )} title={track.name}>
                      {getDisplayName(track.name)}
                    </p>
                    <div className="premium-card-meta">
                      {typeof trackDurations[track.id] === 'number' && Number.isFinite(trackDurations[track.id]) && (
                        <span>{formatTime(trackDurations[track.id])}</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )
      ) : (
        (() => {
          // Get icon and text based on current tab
          const getEmptyStateConfig = () => {
            switch (tab) {
              case 'favorites':
                return {
                  icon: Star,
                  title: t('music.noFavoriteMusic'),
                  subtitle: t('music.addFavoriteMusic'),
                  color: 'text-yellow-400'
                };
              default:
                return {
                  icon: Music,
                  title: t('music.noMusic'),
                  subtitle: t('music.uploadAudioFiles'),
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
      )}

      {/* Load More Sentinel */}
      {tracks.length > 0 && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore && (
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          )}
          {!hasMore && tracks.length >= 50 && (
            <p className="text-sm text-dark-400">{t('common.noMoreItems')}</p>
          )}
        </div>
      )}

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (() => {
          // Get current selection state
          const currentSelectedItems = useFileStore.getState().selectedItems;
          const isAlbum = contextMenu.type === 'album';
          const isMultiSelect = !isAlbum && currentSelectedItems.size > 1 && currentSelectedItems.has(contextMenu.item.id);
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
              className="z-50 min-w-[180px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 overflow-hidden"
            >
              {/* Header for multi-select */}
              {isMultiSelect && (
                <>
                  <div className="px-4 py-2 text-sm font-medium text-dark-500 dark:text-dark-400">
                    {t('music.songsSelected', { count: selectedCount })}
                  </div>
                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Album Actions */}
              {isAlbum && (
                <button
                  onClick={() => handleDelete(contextMenu.item)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('common.delete')}</span>
                </button>
              )}

              {/* Single item actions (Songs) */}
              {!isMultiSelect && !isAlbum && (
                <>
                  {/* Play */}
                  <button
                    onClick={() => handlePlayFromMenu(contextMenu.item)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    <span>{t('music.play')}</span>
                  </button>
                  <button
                    onClick={() => handleAddToQueue(contextMenu.item)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <ListPlus className="w-4 h-4" />
                    <span>{t('music.addToQueue')}</span>
                  </button>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

                  {/* File actions */}
                  <button
                    onClick={() => handleDownload(contextMenu.item)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('common.download')}</span>
                  </button>
                  <button
                    onClick={() => handleShare(contextMenu.item)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{t('common.share')}</span>
                  </button>
                  <button
                    onClick={() => handleCopyLink(contextMenu.item)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    <span>{t('music.copyLink')}</span>
                  </button>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

                  {/* Organization */}
                  <button
                    onClick={() => handleFavoriteFromMenu(contextMenu.item)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Star className={cn('w-4 h-4', contextMenu.item.isFavorite && 'fill-yellow-500 text-yellow-500')} />
                    <span>{contextMenu.item.isFavorite ? t('music.removeFromFavorites') : t('music.addToFavorites')}</span>
                  </button>
                  <button
                    onClick={() => handleShowInfo(contextMenu.item)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Info className="w-4 h-4" />
                    <span>{t('common.info')}</span>
                  </button>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Multi-select actions */}
              {isMultiSelect && (
                <>
                  <button
                    onClick={() => {
                      const selected = tracks.filter(t => currentSelectedItems.has(t.id));
                      selected.forEach(t => handleAddToQueue(t));
                      closeContextMenu();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <ListPlus className="w-4 h-4" />
                    <span>{t('music.addCountToQueue', { count: selectedCount })}</span>
                  </button>
                  <button
                    onClick={() => {
                      const selected = tracks.filter(t => currentSelectedItems.has(t.id));
                      selected.forEach(t => handleDownload(t));
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('music.downloadSongs', { count: selectedCount })}</span>
                  </button>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Delete - always visible */}
              <button
                onClick={() => handleDelete(contextMenu.item)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isMultiSelect ? t('music.deleteSongs', { count: selectedCount }) : t('common.delete')}</span>
              </button>
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
                  <AuthenticatedImage
                    fileId={infoTrack.id}
                    endpoint="thumbnail"
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
                <span className="text-dark-500">{t('music.size')}</span>
                <span className="text-dark-900 dark:text-white font-medium">{formatSize(Number(infoTrack.size))}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">{t('music.duration')}</span>
                <span className="text-dark-900 dark:text-white font-medium">
                  {trackDurations[infoTrack.id] ? formatTime(trackDurations[infoTrack.id]) : t('music.calculating')}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">{t('music.uploadDate')}</span>
                <span className="text-dark-900 dark:text-white font-medium">{formatDate(infoTrack.createdAt)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-dark-500">{t('music.favorite')}</span>
                <span className="text-dark-900 dark:text-white font-medium">{infoTrack.isFavorite ? t('common.yes') : t('common.no')}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setInfoTrack(null)}>
                {t('common.close')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Create Album Modal */}
      {createAlbumOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setCreateAlbumOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <FolderPlus className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dark-900 dark:text-white">{t('music.newAlbum')}</h3>
                <p className="text-sm text-dark-500">{t('music.createFolderForMusic')}</p>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateAlbum(); }}>
              <Input
                label={t('music.albumName')}
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder={t('music.myNewAlbum')}
                autoFocus
              />

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCreateAlbumOpen(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={!newAlbumName.trim() || creatingAlbum}
                  loading={creatingAlbum}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('music.createAlbum')}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
