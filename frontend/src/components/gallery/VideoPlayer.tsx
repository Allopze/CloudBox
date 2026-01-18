import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    X,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
    Settings,
    PictureInPicture2,
    SkipBack,
    SkipForward,
    Download,
    Share2,
    RotateCw,
} from 'lucide-react';
import { FileItem } from '../../types';
import { cn, formatDuration } from '../../lib/utils';

export interface VideoPlayerProps {
    /** Video source URL */
    src: string;
    /** File info for display and actions (required for standalone mode) */
    file?: FileItem;
    /** Show top chrome bar with file name and actions */
    showChrome?: boolean;
    /** Show/hide video controls */
    showControls?: boolean;
    /** Initial playback time in seconds */
    initialTime?: number;
    /** Callback when video closes (for standalone mode) */
    onClose?: () => void;
    /** Callback to share the file */
    onShare?: (file: FileItem) => void;
    /** Callback to download the file */
    onDownload?: (file: FileItem) => void;
    /** Callback when playback time updates */
    onTimeUpdate?: (time: number) => void;
}

/**
 * Unified video player component supporting both embedded and standalone modes.
 * 
 * Standalone mode (showChrome=true): Renders as a portal with file info bar and close button
 * Embedded mode (showChrome=false): Renders inline for use within MediaViewer
 */
export default function VideoPlayer({
    src,
    file,
    showChrome = false,
    showControls: controlsVisible = true,
    initialTime = 0,
    onClose,
    onShare,
    onDownload,
    onTimeUpdate,
}: VideoPlayerProps) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Video state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [buffered, setBuffered] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showSettings, setShowSettings] = useState(false);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [rotation, setRotation] = useState(0);

    // Initialize video with initial time if provided
    useEffect(() => {
        if (videoRef.current && initialTime > 0) {
            videoRef.current.currentTime = initialTime;
        }
    }, [src, initialTime]);

    // Control functions with useCallback for stable references
    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
        } else {
            videoRef.current.pause();
        }
    }, []);

    const toggleMute = useCallback(() => {
        if (!videoRef.current) return;
        const newMuted = !videoRef.current.muted;
        videoRef.current.muted = newMuted;
        setIsMuted(newMuted);
    }, []);

    const adjustVolume = useCallback((delta: number) => {
        setVolume(prev => {
            const newVolume = Math.max(0, Math.min(1, prev + delta));
            if (videoRef.current) {
                videoRef.current.volume = newVolume;
                if (newVolume > 0 && videoRef.current.muted) {
                    videoRef.current.muted = false;
                    setIsMuted(false);
                }
            }
            return newVolume;
        });
    }, []);

    const skip = useCallback((seconds: number) => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    }, []);

    const seekToPercent = useCallback((percent: number) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = (videoRef.current.duration * percent) / 100;
    }, []);

    const toggleFullscreen = useCallback(async () => {
        if (!containerRef.current) return;
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await containerRef.current.requestFullscreen();
            }
        } catch (error) {
            console.error('Fullscreen error:', error);
        }
    }, []);

    const togglePiP = useCallback(async () => {
        if (!videoRef.current) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await videoRef.current.requestPictureInPicture();
            }
        } catch (error) {
            console.error('PiP error:', error);
        }
    }, []);

    const rotateVideo = useCallback(() => {
        setRotation(prev => (prev + 90) % 360);
    }, []);

    // Auto-hide controls
    const resetControlsTimeout = useCallback(() => {
        setShowControls(true);
        if (controlsTimeout.current) {
            clearTimeout(controlsTimeout.current);
        }
        controlsTimeout.current = setTimeout(() => {
            if (isPlaying) {
                setShowControls(false);
                setShowSettings(false);
            }
        }, 3000);
    }, [isPlaying]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (controlsTimeout.current) {
                clearTimeout(controlsTimeout.current);
            }
        };
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;

            resetControlsTimeout();

            switch (e.key) {
                case 'Escape':
                    if (isFullscreen) {
                        document.exitFullscreen();
                    } else if (showChrome && onClose) {
                        onClose();
                    }
                    break;
                case ' ':
                case 'k':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'm':
                case 'M':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'f':
                case 'F':
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        toggleFullscreen();
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    adjustVolume(0.1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    adjustVolume(-0.1);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    skip(-10);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    skip(10);
                    break;
                case 'r':
                case 'R':
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        rotateVideo();
                    }
                    break;
                case 'j':
                    e.preventDefault();
                    skip(-10);
                    break;
                case 'l':
                    e.preventDefault();
                    skip(10);
                    break;
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                    e.preventDefault();
                    seekToPercent(parseInt(e.key) * 10);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, toggleMute, toggleFullscreen, adjustVolume, skip, seekToPercent, resetControlsTimeout, isFullscreen, showChrome, onClose, rotateVideo]);

    // Fullscreen change handler
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation(); // Prevent triggering play/pause
        if (!progressRef.current || !videoRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        videoRef.current.currentTime = percent * duration;
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const time = videoRef.current.currentTime;
        setCurrentTime(time);
        onTimeUpdate?.(time);

        // Update buffered
        const bufferedEnd = videoRef.current.buffered.length > 0
            ? videoRef.current.buffered.end(videoRef.current.buffered.length - 1)
            : 0;
        setBuffered((bufferedEnd / duration) * 100);
    };

    const changePlaybackRate = (rate: number) => {
        if (!videoRef.current) return;
        videoRef.current.playbackRate = rate;
        setPlaybackRate(rate);
        setShowSettings(false);
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const shouldShowControls = controlsVisible && showControls;

    // Video player content
    const playerContent = (
        <div
            ref={containerRef}
            className={cn(
                'relative w-full h-full flex flex-col',
                showChrome && 'bg-black'
            )}
            onMouseMove={resetControlsTimeout}
        >
            {/* Top Chrome Bar (standalone mode only) */}
            {showChrome && file && (
                <div
                    className={cn(
                        'absolute top-0 left-0 right-0 p-4 z-20',
                        'bg-gradient-to-b from-black/80 to-transparent',
                        'transition-opacity duration-300',
                        shouldShowControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    )}
                >
                    <div className="flex items-center justify-between">
                        <h3 className="text-white font-medium truncate max-w-md">{file.name}</h3>
                        <div className="flex items-center gap-2">
                            {onDownload && (
                                <button
                                    onClick={() => onDownload(file)}
                                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                    title={t('common.download')}
                                    aria-label={t('common.download')}
                                >
                                    <Download className="w-5 h-5" />
                                </button>
                            )}
                            {onShare && (
                                <button
                                    onClick={() => onShare(file)}
                                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                    title={t('common.share')}
                                    aria-label={t('common.share')}
                                >
                                    <Share2 className="w-5 h-5" />
                                </button>
                            )}
                            {onClose && (
                                <button
                                    onClick={onClose}
                                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                    title={t('common.close')}
                                    aria-label={t('common.close')}
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Video Container */}
            <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={togglePlay}>
                <video
                    ref={videoRef}
                    src={src}
                    className="max-w-full max-h-full transition-transform duration-200"
                    style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={() => {
                        if (videoRef.current) {
                            setDuration(videoRef.current.duration);
                        }
                        setIsLoading(false);
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onWaiting={() => setIsLoading(true)}
                    onCanPlay={() => setIsLoading(false)}
                />

                {/* Loading Spinner */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                )}

                {/* Big Play Button */}
                {!isPlaying && !isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                            <Play className="w-10 h-10 text-white ml-1" fill="white" />
                        </div>
                    </div>
                )}
            </div>

            {/* Controls Overlay */}
            <div
                className={cn(
                    'absolute bottom-0 left-0 right-0',
                    'bg-gradient-to-t from-black/80 via-black/40 to-transparent',
                    'pt-16 pb-4 px-4',
                    'transition-all duration-200',
                    shouldShowControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Progress Bar */}
                <div
                    ref={progressRef}
                    className="group relative h-1 bg-white/30 rounded-full cursor-pointer mb-4 hover:h-1.5 transition-all"
                    onClick={handleProgressClick}
                >
                    {/* Buffered */}
                    <div
                        className="absolute h-full bg-white/40 rounded-full"
                        style={{ width: `${buffered}%` }}
                    />
                    {/* Progress */}
                    <div
                        className="absolute h-full bg-primary-500 rounded-full"
                        style={{ width: `${progress}%` }}
                    />
                    {/* Thumb */}
                    <div
                        className="absolute top-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
                    />
                </div>

                {/* Controls Row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        {/* Play/Pause */}
                        <button
                            onClick={togglePlay}
                            className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                            aria-label={isPlaying ? t('gallery.pause') : t('gallery.play')}
                        >
                            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        </button>

                        {/* Skip Buttons */}
                        <button
                            onClick={() => skip(-10)}
                            className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                            aria-label={t('gallery.seekBackLabel', { seconds: 10 })}
                        >
                            <SkipBack className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => skip(10)}
                            className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                            aria-label={t('gallery.seekForwardLabel', { seconds: 10 })}
                        >
                            <SkipForward className="w-5 h-5" />
                        </button>

                        {/* Volume */}
                        <div
                            className="relative flex items-center"
                            onMouseEnter={() => setShowVolumeSlider(true)}
                            onMouseLeave={() => setShowVolumeSlider(false)}
                        >
                            <button
                                onClick={toggleMute}
                                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                                aria-label={isMuted ? t('gallery.unmute') : t('gallery.mute')}
                            >
                                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                            </button>
                            <div
                                className={cn(
                                    'overflow-hidden transition-all duration-200',
                                    showVolumeSlider ? 'w-20 ml-1 opacity-100' : 'w-0 opacity-0'
                                )}
                            >
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    onChange={(e) => {
                                        const newVolume = parseFloat(e.target.value);
                                        setVolume(newVolume);
                                        if (videoRef.current) {
                                            videoRef.current.volume = newVolume;
                                            videoRef.current.muted = newVolume === 0;
                                            setIsMuted(newVolume === 0);
                                        }
                                    }}
                                    className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                                    aria-label={t('gallery.volume')}
                                />
                            </div>
                        </div>

                        {/* Time */}
                        <span className="text-white text-sm ml-2 tabular-nums">
                            {formatDuration(currentTime)} / {formatDuration(duration)}
                        </span>
                    </div>

                    <div className="flex items-center gap-1">
                        {/* Settings (Playback Speed) */}
                        <div className="relative">
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className={cn(
                                    'p-2 text-white hover:bg-white/10 rounded-lg transition-colors',
                                    showSettings && 'bg-white/10'
                                )}
                                aria-label={t('gallery.settings')}
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                            {showSettings && (
                                <div className="absolute bottom-full right-0 mb-2 py-1 bg-dark-900/95 backdrop-blur-sm rounded-lg shadow-lg min-w-[120px]">
                                    <p className="px-3 py-1.5 text-xs text-gray-400 border-b border-white/10">
                                        {t('gallery.speed')}
                                    </p>
                                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                                        <button
                                            key={rate}
                                            onClick={() => changePlaybackRate(rate)}
                                            className={cn(
                                                'w-full px-3 py-1.5 text-left text-sm hover:bg-white/10 transition-colors',
                                                playbackRate === rate ? 'text-primary-400' : 'text-white'
                                            )}
                                        >
                                            {rate === 1 ? t('gallery.normal') : `${rate}x`}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* PiP */}
                        {'pictureInPictureEnabled' in document && (
                            <button
                                onClick={togglePiP}
                                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                                aria-label={t('mediaViewer.pictureInPicture')}
                            >
                                <PictureInPicture2 className="w-5 h-5" />
                            </button>
                        )}

                        {/* Rotate */}
                        <button
                            onClick={rotateVideo}
                            className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                            aria-label={t('gallery.rotate')}
                        >
                            <RotateCw className="w-5 h-5" />
                        </button>

                        {/* Fullscreen */}
                        <button
                            onClick={toggleFullscreen}
                            className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                            aria-label={isFullscreen ? t('gallery.exitFullscreen') : t('gallery.fullscreen')}
                        >
                            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    // If showChrome is enabled, render as a portal (standalone mode)
    if (showChrome) {
        return createPortal(
            <div className="fixed inset-0 z-50">
                {playerContent}
            </div>,
            document.body
        );
    }

    // Otherwise render inline (embedded mode)
    return playerContent;
}
