import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    FolderInput,
    Copy,
    Info,
    History,
    Trash2,
} from 'lucide-react';
import { FileItem } from '../../types';
import { cn } from '../../lib/utils';
import { getSignedFileUrl } from '../../lib/api';
import TopBar from './MediaViewer/TopBar';
import ImageCanvas from './MediaViewer/ImageCanvas';
import VideoPlayer from './VideoPlayer';
import Filmstrip from './MediaViewer/Filmstrip';
import DetailsPanel from './MediaViewer/DetailsPanel';

export interface MediaViewerProps {
    files: FileItem[];
    currentFile: FileItem | null;
    isOpen: boolean;
    onClose: () => void;
    onNavigate?: (file: FileItem) => void;
    onShare?: (file: FileItem) => void;
    onDownload?: (file: FileItem) => void;
    onFavorite?: (file: FileItem) => void;
    onDelete?: (file: FileItem) => void;
    breadcrumb?: string;
}

export default function MediaViewer({
    files,
    currentFile,
    isOpen,
    onClose,
    onNavigate,
    onShare,
    onDownload,
    onFavorite,
    onDelete,
    breadcrumb = '',
}: MediaViewerProps) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);

    // UI State
    const [showControls, setShowControls] = useState(true);
    const [focusMode, setFocusMode] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [showFilmstrip, setShowFilmstrip] = useState(true);
    const [showMenu, setShowMenu] = useState(false);

    // Media state
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Image specific state
    const [zoom, setZoom] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);

    // Video specific state
    const [videoTime, setVideoTime] = useState(0);

    // Auto-hide controls timer
    const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Determine current file index and media type
    const currentIndex = currentFile ? files.findIndex(f => f.id === currentFile.id) : -1;
    const isVideo = currentFile?.mimeType?.startsWith('video/') ?? false;
    const isImage = currentFile?.mimeType?.startsWith('image/') ?? false;

    // Preload adjacent files
    const prevFile = currentIndex > 0 ? files[currentIndex - 1] : null;
    const nextFile = currentIndex < files.length - 1 ? files[currentIndex + 1] : null;
    const preloadTargets = useMemo(() => {
        if (currentIndex < 0) return [] as FileItem[];
        const targets: FileItem[] = [];
        const offsets = [-2, -1, 1, 2];
        for (const offset of offsets) {
            const index = currentIndex + offset;
            if (index >= 0 && index < files.length) {
                targets.push(files[index]);
            }
        }
        return targets;
    }, [currentIndex, files]);

    // Fetch signed URL when current file changes
    useEffect(() => {
        if (!isOpen || !currentFile) {
            setSignedUrl(null);
            return;
        }

        setIsLoading(true);
        const endpoint = isVideo ? 'stream' : 'view';

        getSignedFileUrl(currentFile.id, endpoint)
            .then(url => setSignedUrl(url))
            .catch(err => {
                console.error('Failed to get signed URL:', err);
                setSignedUrl(null);
            })
            .finally(() => setIsLoading(false));
    }, [isOpen, currentFile?.id, isVideo]);

    // Reset state when file changes
    useEffect(() => {
        if (currentFile) {
            setZoom(1);
            setPosition({ x: 0, y: 0 });
            setRotation(0);
            setShowControls(true);
        }
    }, [currentFile?.id]);

    // Preload adjacent images for smoother navigation
    useEffect(() => {
        const preloadImage = (file: FileItem) => {
            if (!file?.mimeType?.startsWith('image/')) return;
            getSignedFileUrl(file.id, 'view').then(url => {
                const img = new Image();
                img.src = url;
            }).catch(() => { });
        };

        preloadTargets.forEach(preloadImage);
    }, [preloadTargets]);

    // Auto-hide controls after inactivity
    const resetControlsTimeout = useCallback(() => {
        setShowControls(true);

        if (controlsTimeout.current) {
            clearTimeout(controlsTimeout.current);
        }

        if (!focusMode) {
            controlsTimeout.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        }
    }, [focusMode]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            resetControlsTimeout();

            switch (e.key) {
                case 'Escape':
                    if (focusMode) {
                        setFocusMode(false);
                    } else if (showDetails) {
                        setShowDetails(false);
                    } else if (showMenu) {
                        setShowMenu(false);
                    } else {
                        onClose();
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    navigatePrev();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    navigateNext();
                    break;
                case 'f':
                case 'F':
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        toggleFocusMode();
                    }
                    break;
                case '+':
                case '=':
                    if (isImage) {
                        e.preventDefault();
                        handleZoomIn();
                    }
                    break;
                case '-':
                    if (isImage) {
                        e.preventDefault();
                        handleZoomOut();
                    }
                    break;
                case '0':
                    if (isImage) {
                        e.preventDefault();
                        handleZoomReset();
                    }
                    break;
                case 'r':
                case 'R':
                    if (isImage && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        handleRotate();
                    }
                    break;
                case 'i':
                case 'I':
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        setShowDetails(!showDetails);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, focusMode, showDetails, showMenu, isImage, onClose, resetControlsTimeout]);

    // Navigation functions
    const navigatePrev = () => {
        if (prevFile && onNavigate) {
            onNavigate(prevFile);
        }
    };

    const navigateNext = () => {
        if (nextFile && onNavigate) {
            onNavigate(nextFile);
        }
    };

    // Zoom functions
    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25));
    const handleZoomReset = () => {
        setZoom(1);
        setPosition({ x: 0, y: 0 });
    };
    const handleRotate = () => setRotation(prev => (prev + 90) % 360);

    // Focus mode
    const toggleFocusMode = () => {
        setFocusMode(!focusMode);
        if (!focusMode) {
            setShowFilmstrip(false);
            setShowDetails(false);
        }
    };

    // Menu actions
    const menuActions = [
        { icon: ExternalLink, label: t('mediaViewer.openInNewTab'), action: () => signedUrl && window.open(signedUrl, '_blank') },
        { icon: FolderInput, label: t('mediaViewer.moveTo'), action: () => { } },
        { icon: Copy, label: t('mediaViewer.duplicate'), action: () => { } },
        { type: 'divider' as const },
        { icon: Info, label: t('mediaViewer.details'), action: () => setShowDetails(true) },
        { icon: History, label: t('mediaViewer.versions'), action: () => { } },
        { type: 'divider' as const },
        { icon: Trash2, label: t('mediaViewer.delete'), action: () => currentFile && onDelete?.(currentFile), danger: true },
    ];

    const detailActions = useMemo(() => ([
        { id: 'copy-link', label: t('mediaViewer.copyLink'), icon: Copy },
    ]), [t]);

    if (!isOpen || !currentFile) return null;

    return createPortal(
        <div
            ref={containerRef}
            className={cn(
                'fixed inset-0 z-50 flex flex-col',
                'bg-dark-50 dark:bg-dark-900',
                focusMode && 'cursor-none'
            )}
            onMouseMove={resetControlsTimeout}
        >
            {/* Top Bar */}
            <TopBar
                file={currentFile}
                breadcrumb={breadcrumb}
                visible={showControls && !focusMode}
                onBack={onClose}
                onShare={() => onShare?.(currentFile)}
                onDownload={() => onDownload?.(currentFile)}
                showMenu={showMenu}
                onMenuToggle={() => setShowMenu(!showMenu)}
                menuActions={menuActions}
            />

            {/* Main Canvas Area */}
            <div className="flex-1 flex relative overflow-hidden">
                {/* Left Navigation Arrow */}
                {prevFile && (
                    <button
                        onClick={navigatePrev}
                        className={cn(
                            'absolute left-4 top-1/2 -translate-y-1/2 z-20',
                            'p-3 rounded-full',
                            'bg-white/80 dark:bg-dark-800/80 backdrop-blur-sm',
                            'text-dark-700 dark:text-dark-200',
                            'hover:bg-white dark:hover:bg-dark-700',
                            'shadow-lg',
                            'transition-all duration-200',
                            showControls && !focusMode ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        )}
                        aria-label={t('gallery.previous')}
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                )}

                {/* Content Canvas */}
                <div className="flex-1 flex items-center justify-center">
                    {isImage && signedUrl && (
                        <ImageCanvas
                            src={signedUrl}
                            alt={currentFile.name}
                            zoom={zoom}
                            position={position}
                            rotation={rotation}
                            onZoomChange={setZoom}
                            onPositionChange={setPosition}
                            onZoomIn={handleZoomIn}
                            onZoomOut={handleZoomOut}
                            onZoomReset={handleZoomReset}
                            onRotate={handleRotate}
                            onSwipeLeft={navigateNext}
                            onSwipeRight={navigatePrev}
                        />
                    )}

                    {isVideo && signedUrl && (
                        <VideoPlayer
                            src={signedUrl}
                            showChrome={false}
                            showControls={showControls && !focusMode}
                            initialTime={videoTime}
                            onTimeUpdate={setVideoTime}
                        />
                    )}

                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-10 h-10 border-3 border-dark-200 dark:border-dark-600 border-t-primary-500 rounded-full animate-spin" />
                        </div>
                    )}
                </div>

                {/* Right Navigation Arrow */}
                {nextFile && (
                    <button
                        onClick={navigateNext}
                        className={cn(
                            'absolute right-4 top-1/2 -translate-y-1/2 z-20',
                            'p-3 rounded-full',
                            'bg-white/80 dark:bg-dark-800/80 backdrop-blur-sm',
                            'text-dark-700 dark:text-dark-200',
                            'hover:bg-white dark:hover:bg-dark-700',
                            'shadow-lg',
                            'transition-all duration-200',
                            showControls && !focusMode ? 'opacity-100' : 'opacity-0 pointer-events-none',
                            showDetails && 'right-[340px]'
                        )}
                        aria-label={t('gallery.next')}
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                )}

                {/* Details Panel */}
                <DetailsPanel
                    file={currentFile}
                    isOpen={showDetails}
                    onClose={() => setShowDetails(false)}
                    onCopyLink={() => {
                        if (signedUrl) {
                            navigator.clipboard.writeText(signedUrl);
                        }
                    }}
                    actions={detailActions}
                />
            </div>

            {/* Filmstrip */}
            <Filmstrip
                files={files}
                currentFile={currentFile}
                visible={showFilmstrip && showControls && !focusMode}
                onFileSelect={(file: FileItem) => onNavigate?.(file)}
                onToggle={() => setShowFilmstrip(!showFilmstrip)}
                onFavorite={onFavorite}
            />

            {/* Focus Mode Exit Button */}
            {focusMode && (
                <button
                    onClick={() => setFocusMode(false)}
                    className={cn(
                        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
                        'px-4 py-2 rounded-full',
                        'bg-dark-900/60 backdrop-blur-sm',
                        'text-white text-sm',
                        'hover:bg-dark-900/80',
                        'transition-all duration-200',
                        showControls ? 'opacity-100' : 'opacity-0'
                    )}
                >
                    {t('mediaViewer.exitFocus')} <span className="ml-1 opacity-60">(Esc)</span>
                </button>
            )}
        </div>,
        document.body
    );
}
