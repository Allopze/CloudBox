import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
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
} from 'lucide-react';
import { cn, formatDuration } from '../../../lib/utils';

interface VideoPlayerProps {
    src: string;
    showControls: boolean;
    initialTime?: number;
    onTimeUpdate?: (time: number) => void;
}

export default function VideoPlayer({
    src,
    showControls,
    initialTime = 0,
    onTimeUpdate,
}: VideoPlayerProps) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);

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

    // Initialize video with initial time if provided
    useEffect(() => {
        if (videoRef.current && initialTime > 0) {
            videoRef.current.currentTime = initialTime;
        }
    }, [src]);

    // Keyboard shortcuts for video
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;

            switch (e.key) {
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
                case 'ArrowUp':
                    e.preventDefault();
                    adjustVolume(0.1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    adjustVolume(-0.1);
                    break;
                case 'j':
                    e.preventDefault();
                    skip(-10);
                    break;
                case 'l':
                    e.preventDefault();
                    skip(10);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Fullscreen change handler
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
    };

    const toggleMute = () => {
        if (!videoRef.current) return;
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const adjustVolume = (delta: number) => {
        const newVolume = Math.max(0, Math.min(1, volume + delta));
        setVolume(newVolume);
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
            if (newVolume > 0 && isMuted) {
                setIsMuted(false);
                videoRef.current.muted = false;
            }
        }
    };

    const skip = (seconds: number) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    };

    const toggleFullscreen = async () => {
        if (!containerRef.current) return;
        try {
            if (isFullscreen) {
                await document.exitFullscreen();
            } else {
                await containerRef.current.requestFullscreen();
            }
        } catch (error) {
            console.error('Fullscreen error:', error);
        }
    };

    const togglePiP = async () => {
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
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
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

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center"
        >
            {/* Video Element */}
            <video
                ref={videoRef}
                src={src}
                className="max-w-full max-h-full"
                onClick={togglePlay}
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
                <button
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center"
                >
                    <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                        <Play className="w-10 h-10 text-white ml-1" fill="white" />
                    </div>
                </button>
            )}

            {/* Controls Overlay */}
            <div
                className={cn(
                    'absolute bottom-0 left-0 right-0',
                    'bg-gradient-to-t from-black/80 via-black/40 to-transparent',
                    'pt-16 pb-4 px-4',
                    'transition-all duration-200',
                    showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
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
                            aria-label="-10s"
                        >
                            <SkipBack className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => skip(10)}
                            className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                            aria-label="+10s"
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
}
