import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMusicStore } from '../stores/musicStore';
import { api, getSignedFileUrl } from '../lib/api';
import { formatDuration, cn } from '../lib/utils';
import { X, Music } from 'lucide-react';
import AuthenticatedImage, { useAuthenticatedUrl } from './AuthenticatedImage';
import { IAudioEngine } from '../player/AudioEngine';
import { pickEngine } from '../player/AudioEngineFactory';

// Constants for edge magnetism
const MAGNETISM_THRESHOLD = 50; // pixels - distance to start snapping
const EDGE_PADDING = 24; // pixels - padding from edge when snapped

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Vinyl disc component with album cover
const VinylDisc = ({
  size = 128,
  spinning = false,
  thumbnailUrl,
  holeSize = 0.12 // Size of center hole as percentage of disc size
}: {
  size?: number;
  spinning?: boolean;
  thumbnailUrl?: string | null;
  holeSize?: number;
}) => {
  const { t } = useTranslation();
  const holeSizePx = size * holeSize;

  // If no thumbnail, show classic vinyl disc
  if (!thumbnailUrl) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 128 128"
        className={`rounded-full shadow-lg ${spinning ? 'animate-[spin_3s_linear_infinite]' : ''}`}
      >
        {/* Black vinyl base */}
        <circle cx="64" cy="64" r="64" fill="#1a1a1a" />

        {/* Vinyl grooves */}
        <circle cx="64" cy="64" r="58" fill="none" stroke="#2a2a2a" strokeWidth="1" />
        <circle cx="64" cy="64" r="52" fill="none" stroke="#252525" strokeWidth="1" />
        <circle cx="64" cy="64" r="46" fill="none" stroke="#2a2a2a" strokeWidth="1" />
        <circle cx="64" cy="64" r="40" fill="none" stroke="#252525" strokeWidth="1" />
        <circle cx="64" cy="64" r="34" fill="none" stroke="#2a2a2a" strokeWidth="1" />
        <circle cx="64" cy="64" r="28" fill="none" stroke="#252525" strokeWidth="1" />

        {/* Label area - primary/red gradient */}
        <circle cx="64" cy="64" r="22" fill="url(#labelGradient)" />

        {/* Label details */}
        <circle cx="64" cy="64" r="20" fill="none" stroke="#dc2626" strokeWidth="0.5" />
        <circle cx="64" cy="64" r="16" fill="none" stroke="#dc2626" strokeWidth="0.5" />

        {/* Center hole */}
        <circle cx="64" cy="64" r="6" fill="white" />
        <circle cx="64" cy="64" r="5" fill="#f5f5f5" />

        {/* Shine effect */}
        <ellipse cx="45" cy="45" rx="20" ry="15" fill="white" fillOpacity="0.05" transform="rotate(-45 45 45)" />

        {/* Gradient definitions */}
        <defs>
          <radialGradient id="labelGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </radialGradient>
        </defs>
      </svg>
    );
  }

  // With thumbnail, show vinyl with album cover
  return (
    <div
      className={`relative rounded-full overflow-hidden shadow-lg ${spinning ? 'animate-[spin_3s_linear_infinite]' : ''}`}
      style={{ width: size, height: size }}
    >
      {/* Vinyl grooves background */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `
            repeating-radial-gradient(
              circle at center,
              transparent 0px,
              transparent 2px,
              rgba(0,0,0,0.1) 2px,
              rgba(0,0,0,0.1) 3px
            ),
            linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)
          `,
        }}
      />

      {/* Album cover image - circular */}
      <div
        className="absolute rounded-full overflow-hidden"
        style={{
          top: '15%',
          left: '15%',
          width: '70%',
          height: '70%',
          boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
        }}
      >
        <img
          src={thumbnailUrl}
          alt={t('player.albumCover')}
          className="w-full h-full object-cover"
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
        />
      </div>

      {/* Outer vinyl ring */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          border: `${size * 0.08}px solid rgba(30,30,30,0.9)`,
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5), 0 4px 15px rgba(0,0,0,0.3)',
        }}
      />

      {/* Center hole */}
      <div
        className="absolute bg-white dark:bg-dark-800 rounded-full shadow-inner"
        style={{
          width: holeSizePx,
          height: holeSizePx,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(255,255,255,0.1)',
        }}
      />

      {/* Shine effect */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
        }}
      />
    </div>
  );
};

export default function MusicPlayer() {
  const { t } = useTranslation();
  const engineRef = useRef<IAudioEngine | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    // Load saved position from localStorage
    const saved = localStorage.getItem('musicPlayerPosition');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { x: window.innerWidth - 200, y: window.innerHeight - 200 };
      }
    }
    return { x: window.innerWidth - 200, y: window.innerHeight - 200 };
  });
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    isMuted,
    shuffle,
    queue,
    currentIndex,
    pause,
    resume,
    next,
    previous,
    setProgress,
    setDuration,
    clearQueue,
    toggleShuffle,
    play,
  } = useMusicStore();

  useEffect(() => {
    const handleDeleted = (event: Event) => {
      const detail = (event as CustomEvent<{ ids?: string[] }>).detail;
      if (!detail?.ids || detail.ids.length === 0) return;

      const current = useMusicStore.getState().currentTrack;
      if (current && detail.ids.includes(current.id)) {
        useMusicStore.getState().clearQueue();
      }
    };

    window.addEventListener('files-deleted', handleDeleted as EventListener);
    return () => window.removeEventListener('files-deleted', handleDeleted as EventListener);
  }, []);

  const { url: thumbnailUrl } = useAuthenticatedUrl(
    currentTrack?.thumbnailPath ? currentTrack.id : null,
    'thumbnail'
  );

  // Apply edge magnetism to position
  // Always use collapsed size (w-44=176px, h-20=80px) for consistent positioning
  const applyMagnetism = useCallback((x: number, y: number): { x: number; y: number } => {
    const playerWidth = 176; // Collapsed width (w-44)
    const playerHeight = 80; // Collapsed height (h-20)
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let newX = x;
    let newY = y;

    // Left edge magnetism
    if (x < MAGNETISM_THRESHOLD) {
      newX = EDGE_PADDING;
    }
    // Right edge magnetism
    else if (x + playerWidth > windowWidth - MAGNETISM_THRESHOLD) {
      newX = windowWidth - playerWidth - EDGE_PADDING;
    }

    // Top edge magnetism
    if (y < MAGNETISM_THRESHOLD) {
      newY = EDGE_PADDING;
    }
    // Bottom edge magnetism
    else if (y + playerHeight > windowHeight - MAGNETISM_THRESHOLD) {
      newY = windowHeight - playerHeight - EDGE_PADDING;
    }

    return { x: newX, y: newY };
  }, []);

  // Handle drag start (mouse or touch)
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setIsDragging(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  // Handle drag move (mouse or touch)
  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || !dragStartRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;

    let newX = dragStartRef.current.posX + deltaX;
    let newY = dragStartRef.current.posY + deltaY;

    // Constrain to viewport - use collapsed size for consistent positioning
    const playerWidth = 176; // Collapsed width
    const playerHeight = 80; // Collapsed height

    newX = Math.max(0, Math.min(newX, window.innerWidth - playerWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight - playerHeight));

    setPosition({ x: newX, y: newY });
  }, [isDragging]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      // Apply magnetism on drop
      const magnetizedPos = applyMagnetism(position.x, position.y);
      setPosition(magnetizedPos);
      // Save position to localStorage
      localStorage.setItem('musicPlayerPosition', JSON.stringify(magnetizedPos));
    }
    setIsDragging(false);
    dragStartRef.current = null;
  }, [isDragging, position, applyMagnetism]);

  // Add/remove mouse and touch event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove, { passive: false });
      window.addEventListener('touchend', handleDragEnd);
      window.addEventListener('touchcancel', handleDragEnd);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    }

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('touchcancel', handleDragEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Handle window resize to keep player in bounds
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => {
        const playerWidth = playerRef.current?.offsetWidth || 288;
        const playerHeight = playerRef.current?.offsetHeight || 160;

        const newX = Math.max(0, Math.min(prev.x, window.innerWidth - playerWidth));
        const newY = Math.max(0, Math.min(prev.y, window.innerHeight - playerHeight));

        const magnetized = applyMagnetism(newX, newY);
        localStorage.setItem('musicPlayerPosition', JSON.stringify(magnetized));
        return magnetized;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [applyMagnetism]);

  useEffect(() => {
    if (!currentTrack) {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      return;
    }

    let isCancelled = false;
    let engine = engineRef.current;

    const setupEngine = async () => {
      if (engine) {
        engine.destroy();
      }

      engine = pickEngine(currentTrack.name);
      engineRef.current = engine;

      // Attach listeners
      engine.on('timeupdate', () => {
        if (!isCancelled && engineRef.current) {
          setProgress(engineRef.current.currentTime);
        }
      });

      engine.on('loadedmetadata', () => {
        if (!isCancelled && engineRef.current) {
          setDuration(engineRef.current.duration);
        }
      });

      engine.on('ended', () => {
        if (!isCancelled) {
          next();
        }
      });

      engine.on('error', (e) => {
        console.error("Engine error:", e);
      });

      try {
        const isMidiTrack =
          currentTrack.mimeType.toLowerCase().includes('midi') ||
          currentTrack.name.toLowerCase().endsWith('.mid') ||
          currentTrack.name.toLowerCase().endsWith('.midi');

        if (isMidiTrack) {
          const maxAttempts = 60;
          let attempts = 0;

          while (!isCancelled && attempts < maxAttempts) {
            const statusRes = await api.get(`/files/${currentTrack.id}/transcoding-status`, {
              params: { t: Date.now() },
              headers: { 'Cache-Control': 'no-cache' },
              validateStatus: () => true,
            });

            if (isCancelled) return;

            if (statusRes.status === 200 && statusRes.data?.ready) {
              break;
            }

            if (statusRes.status === 200 && statusRes.data?.status === 'FAILED') {
              throw new Error(statusRes.data?.error || 'MIDI rendering failed');
            }

            attempts += 1;
            await sleep(1000);
          }

          if (attempts >= maxAttempts) {
            throw new Error('Timed out waiting for MIDI render');
          }
        }

        const url = await getSignedFileUrl(currentTrack.id, 'stream');
        if (isCancelled) return;

        await engine.load(url, currentTrack.id);

        if (useMusicStore.getState().isPlaying && !isCancelled) {
          await engine.play();
        }
      } catch (err) {
        console.error("Failed to load track:", err);
      }
    };

    setupEngine();

    return () => {
      isCancelled = true;
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [currentTrack]);

  // Handle Play/Pause
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.play().catch(console.error);
    } else {
      engine.pause();
    }
  }, [isPlaying]);

  // Handle Volume
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    const engine = engineRef.current;
    if (engine) {
      engine.seek(time);
    }
    setProgress(time);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  const handlePlayFromQueue = (track: typeof currentTrack) => {
    if (track) {
      play(track, queue);
    }
  };

  if (!currentTrack) return null;

  const trackName = currentTrack.name.replace(/\.[^/.]+$/, '');
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <>
      <div
        ref={playerRef}
        className="fixed z-50 select-none no-marquee"
        style={{
          left: position.x,
          top: position.y,
          transition: isDragging ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out',
        }}
      >
        <div
          className="flex flex-col items-center group/player"
          onMouseEnter={() => setIsExpanded(true)}
          onMouseLeave={() => {
            if (!isDragging) {
              setIsExpanded(false);
              setShowQueue(false);
            }
          }}
        >
          {/* Queue list */}
          {showQueue && isExpanded && (
            <div className="absolute bottom-full right-0 mb-2 w-72 max-h-64 bg-white dark:bg-dark-800 rounded-xl shadow-xl overflow-hidden">
              <div className="px-4 py-2 bg-primary-500 text-white font-semibold flex items-center justify-between">
                <span>{t('player.queueTitle')}</span>
                <span className="text-sm opacity-80">{queue.length} {t('player.songs')}</span>
              </div>
              <div className="overflow-y-auto max-h-52">
                {queue.map((track, index) => {
                  const hasThumbnail = !!track.thumbnailPath;

                  return (
                    <button
                      key={track.id}
                      onClick={() => handlePlayFromQueue(track)}
                      className={`w-full px-4 py-2 flex items-center gap-3 hover:bg-primary-50 dark:hover:bg-dark-700 transition-colors text-left ${index === currentIndex ? 'bg-primary-50 dark:bg-dark-700' : ''
                        }`}
                    >
                      <div className={`w-8 h-8 rounded overflow-hidden flex items-center justify-center flex-shrink-0 ${!hasThumbnail && (index === currentIndex ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-dark-600 text-gray-500')
                        }`}>
                        {hasThumbnail ? (
                          <AuthenticatedImage
                            fileId={track.id}
                            endpoint="thumbnail"
                            alt={track.name}
                            className="w-full h-full object-cover"
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                          />
                        ) : index === currentIndex && isPlaying ? (
                          <div className="flex items-center gap-0.5">
                            <span className="w-0.5 h-3 bg-white animate-pulse" />
                            <span className="w-0.5 h-4 bg-white animate-pulse delay-75" />
                            <span className="w-0.5 h-2 bg-white animate-pulse delay-150" />
                          </div>
                        ) : (
                          <Music className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`truncate text-sm ${index === currentIndex ? 'font-semibold text-primary-600 dark:text-primary-400' : 'text-dark-800 dark:text-dark-200'
                          }`}>
                          {track.name.replace(/\.[^/.]+$/, '')}
                        </p>
                      </div>
                      {hasThumbnail && index === currentIndex && isPlaying && (
                        <div className="flex items-center gap-0.5 mr-1">
                          <span className="w-0.5 h-3 bg-primary-500 animate-pulse rounded-full" />
                          <span className="w-0.5 h-4 bg-primary-500 animate-pulse delay-75 rounded-full" />
                          <span className="w-0.5 h-2 bg-primary-500 animate-pulse delay-150 rounded-full" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vinyl disc - visible when collapsed */}
          <div className={`relative z-0 transition-all duration-300 ${isExpanded ? 'h-0 opacity-0' : 'h-16 -mb-2 opacity-100'}`}>
            <VinylDisc size={128} spinning={isPlaying} thumbnailUrl={thumbnailUrl} />
          </div>

          {/* Main player card */}
          <div className={`relative z-30 flex flex-col bg-white dark:bg-dark-800 shadow-xl rounded-2xl transition-all duration-300 ${isExpanded ? 'w-72 h-40' : 'w-44 h-20'
            }`}>
            {/* Drag handle */}
            {!isExpanded ? (
              <div
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                className={cn(
                  "absolute inset-0 cursor-grab active:cursor-grabbing z-40 rounded-2xl",
                  isDragging && "cursor-grabbing"
                )}
                title={t('player.drag')}
                aria-label={t('player.drag')}
              />
            ) : (
              <>
                <div
                  onMouseDown={handleDragStart}
                  onTouchStart={handleDragStart}
                  className={cn(
                    "absolute -top-3 left-1/2 -translate-x-1/2 w-14 h-1.5 bg-dark-300 dark:bg-dark-500 rounded-full cursor-grab active:cursor-grabbing z-50 hover:bg-dark-400 dark:hover:bg-dark-400 transition-colors shadow-sm",
                    isDragging && "cursor-grabbing bg-dark-400 dark:bg-dark-400"
                  )}
                  title={t('player.drag')}
                  aria-label={t('player.drag')}
                />
                <div
                  onMouseDown={handleDragStart}
                  onTouchStart={handleDragStart}
                  className={cn(
                    "absolute -top-4 left-1/4 right-1/4 h-6 cursor-grab active:cursor-grabbing z-40",
                    isDragging && "cursor-grabbing"
                  )}
                  title={t('player.drag')}
                  aria-label={t('player.drag')}
                />
              </>
            )}

            {/* Expanded header with vinyl */}
            <div className={`flex flex-row w-full transition-all duration-300 ${isExpanded ? 'h-20' : 'h-0 overflow-hidden'}`}>

              <div className={`absolute flex items-center justify-center transition-all duration-300 ${isExpanded ? '-top-6 -left-4 opacity-100' : '-top-6 -left-4 opacity-0 pointer-events-none'
                }`}>
                <VinylDisc size={96} spinning={isPlaying} thumbnailUrl={thumbnailUrl} />
              </div>

              <div className={`flex flex-col justify-center flex-1 pr-4 pl-24 overflow-hidden transition-all duration-300 relative z-10 ${isExpanded ? 'opacity-100' : 'opacity-0'
                }`}>
                <p className="text-xl font-bold text-dark-900 dark:text-white truncate">{trackName}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {t('player.trackOf', { current: currentIndex + 1, total: queue.length })}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearQueue();
                }}
                className={`absolute top-2 right-2 p-1.5 text-zinc-400 hover:text-white hover:bg-red-500 rounded-full transition-all active:scale-90 z-50 ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                title={t('common.close')}
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className={`flex flex-row items-center mx-3 bg-primary-100 dark:bg-primary-900/30 rounded-md min-h-4 transition-all relative z-50 ${isExpanded ? 'mt-0' : 'mt-3'
              }`}>
              <span className={`pl-3 text-sm text-zinc-500 dark:text-zinc-400 transition-all ${isExpanded ? 'inline-block' : 'hidden'}`}>
                {formatDuration(progress)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={progress}
                onChange={handleSeek}
                className={`flex-grow h-1 mx-2 my-auto bg-gray-300 dark:bg-dark-600 rounded-full appearance-none cursor-pointer transition-all
                  [&::-webkit-slider-thumb]:appearance-none 
                  [&::-webkit-slider-thumb]:w-3 
                  [&::-webkit-slider-thumb]:h-3 
                  [&::-webkit-slider-thumb]:bg-white 
                  [&::-webkit-slider-thumb]:border-2 
                  [&::-webkit-slider-thumb]:border-primary-500
                  [&::-webkit-slider-thumb]:rounded-full 
                  [&::-webkit-slider-thumb]:cursor-pointer 
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:transition-transform
                  [&::-webkit-slider-thumb]:hover:scale-125
                  ${isExpanded ? 'w-full' : 'w-28'}`}
                style={{
                  background: `linear-gradient(to right, rgb(239 68 68) ${progressPercent}%, rgb(209 213 219) ${progressPercent}%)`
                }}
                aria-label={t('player.seek')}
              />
              <span className={`pr-3 text-sm text-zinc-500 dark:text-zinc-400 transition-all ${isExpanded ? 'inline-block' : 'hidden'}`}>
                {formatDuration(duration)}
              </span>
            </div>

            {/* Controls */}
            <div className="flex flex-row items-center justify-center flex-grow mx-3 space-x-5 relative z-50">
              <button
                onClick={toggleShuffle}
                className={`flex items-center justify-center h-full cursor-pointer transition-all active:scale-90 ${isExpanded ? 'w-10 opacity-100' : 'w-0 opacity-0 overflow-hidden'
                  } ${shuffle ? 'text-primary-500' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                title={t('player.shuffle')}
                aria-label={t('player.shuffle')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </button>

              <button
                onClick={previous}
                className="flex items-center justify-center w-10 h-full cursor-pointer text-dark-700 dark:text-dark-300 hover:text-primary-600 dark:hover:text-primary-400 transition-all active:scale-90"
                title={t('player.previous')}
                aria-label={t('player.previous')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="19 20 9 12 19 4 19 20" />
                  <line x1={5} y1={19} x2={5} y2={5} />
                </svg>
              </button>

              <button
                onClick={togglePlayPause}
                className="flex items-center justify-center w-12 h-full cursor-pointer text-dark-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-all active:scale-90"
                title={isPlaying ? t('player.pause') : t('player.play')}
                aria-label={isPlaying ? t('player.pause') : t('player.play')}
              >
                {isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x={6} y={4} width={4} height={16} />
                    <rect x={14} y={4} width={4} height={16} />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </button>

              <button
                onClick={next}
                className="flex items-center justify-center w-10 h-full cursor-pointer text-dark-700 dark:text-dark-300 hover:text-primary-600 dark:hover:text-primary-400 transition-all active:scale-90"
                title={t('player.next')}
                aria-label={t('player.next')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 4 15 12 5 20 5 4" />
                  <line x1={19} y1={5} x2={19} y2={19} />
                </svg>
              </button>

              <button
                onClick={() => setShowQueue(!showQueue)}
                className={`flex items-center justify-center h-full cursor-pointer transition-all active:scale-90 ${isExpanded ? 'w-10 opacity-100' : 'w-0 opacity-0 overflow-hidden'
                  } ${showQueue ? 'text-primary-500' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                title={t('player.queueTitle')}
                aria-label={t('player.queueTitle')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1={8} y1={6} x2={21} y2={6} />
                  <line x1={8} y1={12} x2={21} y2={12} />
                  <line x1={8} y1={18} x2={21} y2={18} />
                  <line x1={3} y1={6} x2="3.01" y2={6} />
                  <line x1={3} y1={12} x2="3.01" y2={12} />
                  <line x1={3} y1={18} x2="3.01" y2={18} />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
