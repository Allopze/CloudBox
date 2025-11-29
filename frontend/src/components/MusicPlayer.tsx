import { useEffect, useRef, useState } from 'react';
import { useMusicStore } from '../stores/musicStore';
import { getFileUrl } from '../lib/api';
import { formatDuration } from '../lib/utils';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  Music,
} from 'lucide-react';

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    pause,
    resume,
    next,
    previous,
    setVolume,
    setProgress,
    setDuration,
    clearQueue,
  } = useMusicStore();

  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;

    audioRef.current.src = getFileUrl(currentTrack.id);
    
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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  if (!currentTrack) return null;

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Mini player */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-800 border-t shadow-lg z-50">
        <div className="max-w-screen-xl mx-auto">
          {/* Progress bar */}
          <div className="h-1 bg-dark-200 dark:bg-dark-700">
            <div
              className="h-full bg-primary-600 transition-all"
              style={{ width: `${(progress / duration) * 100 || 0}%` }}
            />
          </div>

          <div className="px-4 py-3 flex items-center gap-4">
            {/* Track info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Music className="w-6 h-6 text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-dark-900 dark:text-white truncate">
                  {currentTrack.name.replace(/\.[^/.]+$/, '')}
                </p>
                <p className="text-sm text-dark-500 truncate">
                  {formatDuration(progress)} / {formatDuration(duration)}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={previous}
                className="p-2 text-dark-500 hover:text-dark-900 hover:bg-dark-100 dark:hover:text-white dark:hover:bg-dark-700 rounded-lg transition-colors"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                onClick={togglePlayPause}
                className="w-12 h-12 bg-primary-600 hover:bg-primary-700 text-white rounded-full flex items-center justify-center transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-1" />
                )}
              </button>

              <button
                onClick={next}
                className="p-2 text-dark-500 hover:text-dark-900 hover:bg-dark-100 dark:hover:text-white dark:hover:bg-dark-700 rounded-lg transition-colors"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Volume */}
            <div className="hidden md:flex items-center gap-2 w-32">
              <button
                onClick={toggleMute}
                className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-full h-1 bg-dark-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
            </div>

            {/* Close */}
            <button
              onClick={clearQueue}
              className="p-2 text-dark-500 hover:text-dark-900 hover:bg-dark-100 dark:hover:text-white dark:hover:bg-dark-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
