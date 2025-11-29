import { useEffect, useState, useCallback, useRef } from 'react';
import { api, getFileUrl } from '../lib/api';
import { FileItem } from '../types';
import { useMusicStore } from '../stores/musicStore';
import { Loader2, Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatBytes, cn } from '../lib/utils';

export default function MusicPage() {
  const [tracks, setTracks] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackDurations, setTrackDurations] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement>(null);

  const {
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    shuffle,
    repeat,
    setCurrentTrack,
    setIsPlaying,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    setQueue,
    playNext,
    playPrevious,
  } = useMusicStore();

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/files', {
        params: { type: 'audio', sortBy: 'name', sortOrder: 'asc' },
      });
      const audioFiles = response.data.files || [];
      setTracks(audioFiles);
      setQueue(audioFiles);
      
      // Load durations for all tracks
      audioFiles.forEach((track: FileItem) => {
        const audio = new Audio();
        audio.src = getFileUrl(`/files/${track.id}/stream`);
        audio.addEventListener('loadedmetadata', () => {
          setTrackDurations(prev => ({ ...prev, [track.id]: audio.duration }));
        });
      });
    } catch (error) {
      console.error('Failed to load music:', error);
      toast('Error al cargar la música', 'error');
    } finally {
      setLoading(false);
    }
  }, [setQueue]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for workzone refresh event from MainLayout context menu
  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [loadData]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current && currentTrack) {
      audioRef.current.src = getFileUrl(`/files/${currentTrack.id}/stream`);
      if (isPlaying) {
        audioRef.current.play();
      }
    }
  }, [currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    if (repeat === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      playNext();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current && duration) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audioRef.current.currentTime = percent * duration;
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="pb-32">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Track list */}
      {tracks.length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 border-b text-sm font-medium text-dark-500">
            <span className="w-10">#</span>
            <span>Título</span>
            <span>Tamaño</span>
            <span className="w-20 text-right">Duración</span>
          </div>
          <div className="divide-y">
            {tracks.map((track, index) => (
              <div
                key={track.id}
                onClick={() => playTrack(track)}
                className={cn(
                  'grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-dark-50 dark:hover:bg-dark-700',
                  currentTrack?.id === track.id && 'bg-primary-50 dark:bg-primary-900/20'
                )}
              >
                <span className="w-10 flex items-center justify-center">
                  {currentTrack?.id === track.id && isPlaying ? (
                    <div className="flex items-end gap-0.5 h-4">
                      <div className="w-1 bg-primary-600 animate-music-bar-1" />
                      <div className="w-1 bg-primary-600 animate-music-bar-2" />
                      <div className="w-1 bg-primary-600 animate-music-bar-3" />
                    </div>
                  ) : (
                    <span className="text-dark-500">{index + 1}</span>
                  )}
                </span>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                    <Music className="w-5 h-5 text-dark-400" />
                  </div>
                  <span className={cn(
                    'truncate font-medium',
                    currentTrack?.id === track.id ? 'text-primary-600' : 'text-dark-900 dark:text-white'
                  )}>
                    {track.name}
                  </span>
                </div>
                <span className="text-dark-500 text-sm">{formatBytes(track.size)}</span>
                <span className="w-20 text-right text-dark-500 text-sm">
                  {trackDurations[track.id] ? formatTime(trackDurations[track.id]) : '--:--'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player */}
      {currentTrack && (
        <div className="fixed bottom-0 left-64 right-0 bg-white dark:bg-dark-800 border-t p-4">
          <div className="max-w-screen-xl mx-auto">
            {/* Progress bar */}
            <div
              className="w-full h-1 bg-dark-100 dark:bg-dark-700 rounded-full cursor-pointer mb-4"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-primary-600 rounded-full"
                style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              {/* Track info */}
              <div className="flex items-center gap-3 w-1/4">
                <div className="w-12 h-12 bg-dark-100 dark:bg-dark-700 rounded-lg flex items-center justify-center">
                  <Music className="w-6 h-6 text-dark-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-dark-900 dark:text-white truncate">
                    {currentTrack.name}
                  </p>
                  <p className="text-sm text-dark-500">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleShuffle}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    shuffle ? 'text-primary-600' : 'text-dark-500 hover:text-dark-900 dark:hover:text-white'
                  )}
                  aria-label={shuffle ? 'Desactivar aleatorio' : 'Activar aleatorio'}
                >
                  <Shuffle className="w-5 h-5" />
                </button>
                <button
                  onClick={playPrevious}
                  className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg transition-colors"
                  aria-label="Canción anterior"
                >
                  <SkipBack className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-12 h-12 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700 transition-colors"
                  aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                </button>
                <button
                  onClick={playNext}
                  className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg transition-colors"
                  aria-label="Siguiente canción"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
                <button
                  onClick={toggleRepeat}
                  className={cn(
                    'p-2 rounded-lg transition-colors relative',
                    repeat !== 'none' ? 'text-primary-600' : 'text-dark-500 hover:text-dark-900 dark:hover:text-white'
                  )}
                  aria-label={repeat === 'none' ? 'Activar repetición' : repeat === 'all' ? 'Repetir una canción' : 'Desactivar repetición'}
                >
                  <Repeat className="w-5 h-5" />
                  {repeat === 'one' && (
                    <span className="absolute -top-1 -right-1 text-xs font-bold">1</span>
                  )}
                </button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-2 w-1/4 justify-end">
                <button
                  onClick={toggleMute}
                  className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg transition-colors"
                  aria-label={isMuted || volume === 0 ? 'Activar sonido' : 'Silenciar'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volu