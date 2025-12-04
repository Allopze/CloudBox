import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMusicStore } from '../stores/musicStore';
import { getFileUrl } from '../lib/api';
import { formatDuration } from '../lib/utils';
import { X, Music } from 'lucide-react';

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
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  
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
    if (!audioRef.current || !currentTrack) return;
    audioRef.current.src = getFileUrl(currentTrack.id, 'stream');
    if (isPlaying) {
      audioRef.current.play().catch(console.error);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setProgress(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  const handleEnded = () => {
    next();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
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
  const thumbnailUrl = currentTrack.thumbnailPath 
    ? getFileUrl(currentTrack.id, 'thumbnail')
    : null;

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Floating player */}
      <div className="fixed bottom-6 right-6 z-50 select-none">
        <div 
          className="flex flex-col items-center group/player"
          onMouseEnter={() => setIsExpanded(true)}
          onMouseLeave={() => { setIsExpanded(false); setShowQueue(false); }}
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
                  const trackThumbUrl = track.thumbnailPath 
                    ? getFileUrl(track.id, 'thumbnail')
                    : null;
                  
                  return (
                    <button
                      key={track.id}
                      onClick={() => handlePlayFromQueue(track)}
                      className={`w-full px-4 py-2 flex items-center gap-3 hover:bg-primary-50 dark:hover:bg-dark-700 transition-colors text-left ${
                        index === currentIndex ? 'bg-primary-50 dark:bg-dark-700' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 rounded overflow-hidden flex items-center justify-center flex-shrink-0 ${
                        !trackThumbUrl && (index === currentIndex ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-dark-600 text-gray-500')
                      }`}>
                        {trackThumbUrl ? (
                          <img 
                            src={trackThumbUrl} 
                            alt={track.name} 
                            className="w-full h-full object-cover"
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
                        <p className={`truncate text-sm ${
                          index === currentIndex ? 'font-semibold text-primary-600 dark:text-primary-400' : 'text-dark-800 dark:text-dark-200'
                        }`}>
                          {track.name.replace(/\.[^/.]+$/, '')}
                        </p>
                      </div>
                      {/* Playing indicator for tracks with thumbnail */}
                      {trackThumbUrl && index === currentIndex && isPlaying && (
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
          <div className={`relative z-30 flex flex-col bg-white dark:bg-dark-800 shadow-xl rounded-2xl transition-all duration-300 ${
            isExpanded ? 'w-72 h-40' : 'w-44 h-20'
          }`}>
            {/* Expanded header with vinyl */}
            <div className={`flex flex-row w-full transition-all duration-300 ${isExpanded ? 'h-20' : 'h-0 overflow-hidden'}`}>
              <div className={`absolute flex items-center justify-center transition-all duration-300 ${
                isExpanded ? '-top-6 -left-4 opacity-100' : '-top-6 -left-4 opacity-0 pointer-events-none'
              }`}>
                <VinylDisc size={96} spinning={isPlaying} thumbnailUrl={thumbnailUrl} />
              </div>
              <div className={`flex flex-col justify-center flex-1 pr-4 pl-24 overflow-hidden transition-all duration-300 ${
                isExpanded ? 'opacity-100' : 'opacity-0'
              }`}>
                <p className="text-xl font-bold text-dark-900 dark:text-white truncate">{trackName}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {t('player.trackOf', { current: currentIndex + 1, total: queue.length })}
                </p>
              </div>
              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearQueue();
                }}
                className={`absolute top-2 right-2 p-1.5 text-zinc-400 hover:text-white hover:bg-red-500 rounded-full transition-all active:scale-90 ${
                  isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className={`flex flex-row items-center mx-3 bg-primary-100 dark:bg-primary-900/30 rounded-md min-h-4 transition-all ${
              isExpanded ? 'mt-0' : 'mt-3'
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
              />
              <span className={`pr-3 text-sm text-zinc-500 dark:text-zinc-400 transition-all ${isExpanded ? 'inline-block' : 'hidden'}`}>
                {formatDuration(duration)}
              </span>
            </div>

            {/* Controls */}
            <div className="flex flex-row items-center justify-center flex-grow mx-3 space-x-5">
              {/* Repeat/Shuffle button */}
              <button
                onClick={toggleShuffle}
                className={`flex items-center justify-center h-full cursor-pointer transition-all active:scale-90 ${
                  isExpanded ? 'w-10 opacity-100' : 'w-0 opacity-0 overflow-hidden'
                } ${shuffle ? 'text-primary-500' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
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

              {/* Previous */}
              <button
                onClick={previous}
                className="flex items-center justify-center w-10 h-full cursor-pointer text-dark-700 dark:text-dark-300 hover:text-primary-600 dark:hover:text-primary-400 transition-all active:scale-90"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="19 20 9 12 19 4 19 20" />
                  <line x1={5} y1={19} x2={5} y2={5} />
                </svg>
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlayPause}
                className="flex items-center justify-center w-12 h-full cursor-pointer text-dark-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-all active:scale-90"
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

              {/* Next */}
              <button
                onClick={next}
                className="flex items-center justify-center w-10 h-full cursor-pointer text-dark-700 dark:text-dark-300 hover:text-primary-600 dark:hover:text-primary-400 transition-all active:scale-90"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 4 15 12 5 20 5 4" />
                  <line x1={19} y1={5} x2={19} y2={19} />
                </svg>
              </button>

              {/* List button */}
              <button
                onClick={() => setShowQueue(!showQueue)}
                className={`flex items-center justify-center h-full cursor-pointer transition-all active:scale-90 ${
                  isExpanded ? 'w-10 opacity-100' : 'w-0 opacity-0 overflow-hidden'
                } ${showQueue ? 'text-primary-500' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
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
